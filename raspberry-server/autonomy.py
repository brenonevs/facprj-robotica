import asyncio
import os
import time
from typing import Any, Callable, Awaitable

from arduino_bridge import bridge
from vision import vision_service

FSM_OFF = "OFF"
FSM_IDLE = "IDLE"
FSM_SCAN_TAG_1 = "SCAN_TAG_1"
FSM_NAV_TO_TAG_1 = "NAV_TO_TAG_1"
FSM_MANUAL_PALLETIZE = "MANUAL_PALLETIZE"
FSM_SCAN_TAG_2 = "SCAN_TAG_2"
FSM_NAV_TO_TAG_2 = "NAV_TO_TAG_2"
FSM_MANUAL_DEPALLETIZE = "MANUAL_DEPALLETIZE"

FSM_STATES = [
    FSM_OFF,
    FSM_IDLE,
    FSM_SCAN_TAG_1,
    FSM_NAV_TO_TAG_1,
    FSM_MANUAL_PALLETIZE,
    FSM_SCAN_TAG_2,
    FSM_NAV_TO_TAG_2,
    FSM_MANUAL_DEPALLETIZE,
]

AUTONOMY_ACTIONS = frozenset(
    {
        "start_autonomous_mode",
        "stop_autonomous_mode",
        "start_autonomous_cycle",
        "confirm_palletize_done",
        "confirm_depalletize_done",
    }
)

MANUAL_MOTOR_ACTIONS = frozenset(
    {
        "move_forward",
        "move_backward",
        "turn_left",
        "turn_right",
        "fork_up",
        "fork_down",
    }
)

ACTIVE_NAV_STATES = frozenset({FSM_SCAN_TAG_1, FSM_NAV_TO_TAG_1, FSM_SCAN_TAG_2, FSM_NAV_TO_TAG_2})

MANUAL_CONTROL_STATES = frozenset({FSM_MANUAL_PALLETIZE, FSM_MANUAL_DEPALLETIZE})

CYCLE_STEP_BY_STATE = {
    FSM_IDLE: 0,
    FSM_SCAN_TAG_1: 1,
    FSM_NAV_TO_TAG_1: 2,
    FSM_MANUAL_PALLETIZE: 3,
    FSM_SCAN_TAG_2: 4,
    FSM_NAV_TO_TAG_2: 5,
    FSM_MANUAL_DEPALLETIZE: 6,
}

CYCLE_STEP_TOTAL = 6

NAV_LOST_TAG_TICKS = 15


def _env_float(name: str, default: float) -> float:
    raw = os.environ.get(name, "").strip()
    if not raw:
        return default
    try:
        return float(raw)
    except ValueError:
        return default


def _env_int(name: str, default: int) -> int:
    raw = os.environ.get(name, "").strip()
    if not raw:
        return default
    try:
        return int(raw)
    except ValueError:
        return default


class AutonomyController:
    def __init__(self) -> None:
        self.target_distance_m = _env_float("AUTONOMY_TARGET_DISTANCE_M", 0.8)
        self.yaw_threshold_deg = _env_float("AUTONOMY_YAW_THRESHOLD_DEG", 8.0)
        self.scan_timeout_s = _env_float("AUTONOMY_SCAN_TIMEOUT_S", 60.0)
        self.loop_hz = _env_int("AUTONOMY_LOOP_HZ", 10)
        self._fsm_state = FSM_OFF
        self._first_tag_id: int | None = None
        self._target_tag_id: int | None = None
        self._current_distance_m: float | None = None
        self._alert: str | None = None
        self._scan_started_at: float | None = None
        self._nav_lost_tag_ticks = 0
        self._last_motor_action: str | None = None
        self._broadcast_fn: Callable[[dict], Awaitable[None]] | None = None
        self._loop_task: asyncio.Task | None = None
        self._last_payload_key = ""

    @property
    def fsm_state(self) -> str:
        return self._fsm_state

    @property
    def enabled(self) -> bool:
        return self._fsm_state != FSM_OFF

    def manual_control_allowed(self) -> bool:
        return self._fsm_state in MANUAL_CONTROL_STATES

    def manual_motor_blocked(self) -> bool:
        if not self.enabled:
            return False
        return not self.manual_control_allowed()

    def set_broadcast(self, fn: Callable[[dict], Awaitable[None]]) -> None:
        self._broadcast_fn = fn

    def start_loop(self) -> None:
        if self._loop_task is not None and not self._loop_task.done():
            return
        self._loop_task = asyncio.create_task(self._run_loop())

    async def stop_loop(self) -> None:
        if self._loop_task is not None:
            self._loop_task.cancel()
            try:
                await self._loop_task
            except asyncio.CancelledError:
                pass
            self._loop_task = None

    def build_payload(self) -> dict[str, Any]:
        return {
            "enabled": self.enabled,
            "fsmState": self._fsm_state,
            "targetTagId": self._target_tag_id,
            "firstTagId": self._first_tag_id,
            "targetDistanceM": self.target_distance_m,
            "currentDistanceM": self._current_distance_m,
            "manualControlAllowed": self.manual_control_allowed(),
            "cycleStep": CYCLE_STEP_BY_STATE.get(self._fsm_state, 0),
            "cycleStepTotal": CYCLE_STEP_TOTAL,
            "alert": self._alert,
        }

    async def broadcast_state(self, force: bool = False) -> None:
        if self._broadcast_fn is None:
            return
        payload = self.build_payload()
        key = (
            f"{payload['fsmState']}|{payload['targetTagId']}|"
            f"{payload['currentDistanceM']}|{payload['alert']}|{payload['manualControlAllowed']}"
        )
        if not force and key == self._last_payload_key:
            return
        self._last_payload_key = key
        await self._broadcast_fn(payload)

    async def handle_action(self, action: str) -> tuple[bool, str]:
        if action == "start_autonomous_mode":
            return await self._start_autonomous_mode()
        if action == "stop_autonomous_mode":
            return await self._stop_autonomous_mode()
        if action == "start_autonomous_cycle":
            return await self._start_cycle()
        if action == "confirm_palletize_done":
            return await self._confirm_palletize()
        if action == "confirm_depalletize_done":
            return await self._confirm_depalletize()
        return False, f"Ação de autonomia desconhecida: {action}"

    async def on_client_disconnect(self) -> None:
        if self.enabled:
            print("[autonomy] Último cliente desconectado — desarmando autonomia.")
            await self._stop_autonomous_mode()

    async def _start_autonomous_mode(self) -> tuple[bool, str]:
        if self._fsm_state != FSM_OFF:
            return True, f"Modo autônomo já ativo ({self._fsm_state})."
        ok, detail = await asyncio.to_thread(bridge.send_action, "start_autonomous_mode")
        if not ok:
            return False, detail or "Falha ao enviar A 1 ao Arduino."
        self._reset_cycle()
        self._fsm_state = FSM_IDLE
        self._alert = None
        await self._ensure_stop()
        await self.broadcast_state(force=True)
        return True, "Modo autônomo armado (IDLE)."

    async def _stop_autonomous_mode(self) -> tuple[bool, str]:
        await self._ensure_stop()
        ok_stop, _ = await asyncio.to_thread(bridge.send_action, "stop")
        if not ok_stop:
            print("[autonomy] Aviso: falha ao enviar stop ao desarmar.")
        ok, detail = await asyncio.to_thread(bridge.send_action, "stop_autonomous_mode")
        if not ok:
            return False, detail or "Falha ao enviar A 0 ao Arduino."
        self._fsm_state = FSM_OFF
        self._reset_cycle()
        self._alert = None
        await self.broadcast_state(force=True)
        return True, "Modo autônomo desativado."

    async def _start_cycle(self) -> tuple[bool, str]:
        if self._fsm_state != FSM_IDLE:
            return False, f"Ciclo só pode iniciar em IDLE (atual: {self._fsm_state})."
        self._reset_cycle()
        self._fsm_state = FSM_SCAN_TAG_1
        self._scan_started_at = time.monotonic()
        self._alert = None
        await self._ensure_stop()
        await self.broadcast_state(force=True)
        return True, "Ciclo autônomo iniciado — buscando 1ª AprilTag."

    async def _confirm_palletize(self) -> tuple[bool, str]:
        if self._fsm_state != FSM_MANUAL_PALLETIZE:
            return False, f"Confirmação inválida no estado {self._fsm_state}."
        self._target_tag_id = None
        self._current_distance_m = None
        self._fsm_state = FSM_SCAN_TAG_2
        self._scan_started_at = time.monotonic()
        self._nav_lost_tag_ticks = 0
        self._alert = None
        await self._ensure_stop()
        await self.broadcast_state(force=True)
        return True, "Paletização confirmada — buscando 2ª AprilTag."

    async def _confirm_depalletize(self) -> tuple[bool, str]:
        if self._fsm_state != FSM_MANUAL_DEPALLETIZE:
            return False, f"Confirmação inválida no estado {self._fsm_state}."
        self._reset_cycle()
        self._fsm_state = FSM_IDLE
        self._alert = None
        await self._ensure_stop()
        await self.broadcast_state(force=True)
        return True, "Despaletização confirmada — pronto para novo ciclo (IDLE)."

    def _reset_cycle(self) -> None:
        self._first_tag_id = None
        self._target_tag_id = None
        self._current_distance_m = None
        self._scan_started_at = None
        self._nav_lost_tag_ticks = 0

    async def _ensure_stop(self) -> None:
        if self._last_motor_action == "stop":
            return
        await asyncio.to_thread(bridge.send_action, "stop")
        self._last_motor_action = "stop"

    async def _send_motor(self, action: str) -> None:
        if self._last_motor_action == action:
            return
        await asyncio.to_thread(bridge.send_action, action)
        self._last_motor_action = action

    def _find_tag(self, tags: list[dict], *, exclude_id: int | None = None) -> dict | None:
        for tag in tags:
            tag_id = int(tag.get("id", -1))
            if exclude_id is not None and tag_id == exclude_id:
                continue
            return tag
        return None

    def _find_tag_by_id(self, tags: list[dict], tag_id: int | None) -> dict | None:
        if tag_id is None:
            return None
        for tag in tags:
            if int(tag.get("id", -1)) == tag_id:
                return tag
        return None

    async def _run_loop(self) -> None:
        interval = 1.0 / max(1, self.loop_hz)
        while True:
            try:
                await self._tick()
            except Exception as error:
                print(f"[autonomy] Erro no tick: {error}")
            await asyncio.sleep(interval)

    async def _tick(self) -> None:
        if self._fsm_state in (FSM_OFF, FSM_IDLE):
            await self._ensure_stop()
            await self.broadcast_state()
            return

        if self._fsm_state in MANUAL_CONTROL_STATES:
            await self._ensure_stop()
            await self.broadcast_state()
            return

        vision_state = vision_service.get_latest_state()
        tags = vision_state.get("tags") or []

        if self._fsm_state == FSM_SCAN_TAG_1:
            await self._tick_scan(tags, exclude_id=None, next_state=FSM_NAV_TO_TAG_1, lock_as_first=True)
        elif self._fsm_state == FSM_SCAN_TAG_2:
            await self._tick_scan(
                tags,
                exclude_id=self._first_tag_id,
                next_state=FSM_NAV_TO_TAG_2,
                lock_as_first=False,
            )
        elif self._fsm_state == FSM_NAV_TO_TAG_1:
            await self._tick_nav(tags, rescan_state=FSM_SCAN_TAG_1)
        elif self._fsm_state == FSM_NAV_TO_TAG_2:
            await self._tick_nav(tags, rescan_state=FSM_SCAN_TAG_2)

        await self.broadcast_state()

    async def _tick_scan(
        self,
        tags: list[dict],
        *,
        exclude_id: int | None,
        next_state: str,
        lock_as_first: bool,
    ) -> None:
        tag = self._find_tag(tags, exclude_id=exclude_id)
        if tag is not None:
            tag_id = int(tag["id"])
            self._target_tag_id = tag_id
            if lock_as_first:
                self._first_tag_id = tag_id
            self._current_distance_m = float(tag.get("distance_m", 0))
            self._fsm_state = next_state
            self._nav_lost_tag_ticks = 0
            self._scan_started_at = None
            await self._ensure_stop()
            print(f"[autonomy] Tag #{tag_id} detectada → {next_state}")
            return

        if self._scan_started_at is not None:
            elapsed = time.monotonic() - self._scan_started_at
            if elapsed > self.scan_timeout_s:
                self._alert = "Tempo esgotado buscando AprilTag."
                await self._ensure_stop()
                return

        await self._send_motor("turn_left")

    async def _tick_nav(self, tags: list[dict], *, rescan_state: str) -> None:
        tag = self._find_tag_by_id(tags, self._target_tag_id)
        if tag is None:
            self._nav_lost_tag_ticks += 1
            self._current_distance_m = None
            if self._nav_lost_tag_ticks >= NAV_LOST_TAG_TICKS:
                self._alert = "AprilTag perdida — retomando busca."
                self._fsm_state = rescan_state
                self._scan_started_at = time.monotonic()
                self._nav_lost_tag_ticks = 0
                await self._ensure_stop()
            else:
                await self._ensure_stop()
            return

        self._nav_lost_tag_ticks = 0
        distance_m = float(tag.get("distance_m", 999))
        yaw_deg = float(tag.get("yaw_deg", 0))
        self._current_distance_m = distance_m

        if distance_m <= self.target_distance_m:
            await self._ensure_stop()
            if self._fsm_state == FSM_NAV_TO_TAG_1:
                self._fsm_state = FSM_MANUAL_PALLETIZE
                print("[autonomy] Destino 1ª tag — aguardando paletização manual.")
            else:
                self._fsm_state = FSM_MANUAL_DEPALLETIZE
                print("[autonomy] Destino 2ª tag — aguardando despaletização manual.")
            self._alert = None
            return

        if abs(yaw_deg) > self.yaw_threshold_deg:
            if yaw_deg > 0:
                await self._send_motor("turn_right")
            else:
                await self._send_motor("turn_left")
            return

        await self._send_motor("move_forward")


autonomy_controller = AutonomyController()
