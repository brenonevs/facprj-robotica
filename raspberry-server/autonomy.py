import asyncio
import math
import os
import time
from typing import Any, Callable, Awaitable

from arduino_bridge import bridge
from vision import vision_service

FSM_OFF = "OFF"
FSM_IDLE = "IDLE"
FSM_SCAN_TAG_1 = "SCAN_TAG_1"
FSM_ALIGN_TAG_1 = "ALIGN_TAG_1"
FSM_NAV_TO_TAG_1 = "NAV_TO_TAG_1"
FSM_MANUAL_PALLETIZE = "MANUAL_PALLETIZE"
FSM_SCAN_TAG_2 = "SCAN_TAG_2"
FSM_ALIGN_TAG_2 = "ALIGN_TAG_2"
FSM_NAV_TO_TAG_2 = "NAV_TO_TAG_2"
FSM_MANUAL_DEPALLETIZE = "MANUAL_DEPALLETIZE"

FSM_STATES = [
    FSM_OFF,
    FSM_IDLE,
    FSM_SCAN_TAG_1,
    FSM_ALIGN_TAG_1,
    FSM_NAV_TO_TAG_1,
    FSM_MANUAL_PALLETIZE,
    FSM_SCAN_TAG_2,
    FSM_ALIGN_TAG_2,
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

ACTIVE_NAV_STATES = frozenset(
    {
        FSM_SCAN_TAG_1,
        FSM_ALIGN_TAG_1,
        FSM_NAV_TO_TAG_1,
        FSM_SCAN_TAG_2,
        FSM_ALIGN_TAG_2,
        FSM_NAV_TO_TAG_2,
    }
)

MANUAL_CONTROL_STATES = frozenset({FSM_MANUAL_PALLETIZE, FSM_MANUAL_DEPALLETIZE})

CYCLE_STEP_BY_STATE = {
    FSM_IDLE: 0,
    FSM_SCAN_TAG_1: 1,
    FSM_ALIGN_TAG_1: 2,
    FSM_NAV_TO_TAG_1: 3,
    FSM_MANUAL_PALLETIZE: 4,
    FSM_SCAN_TAG_2: 5,
    FSM_ALIGN_TAG_2: 6,
    FSM_NAV_TO_TAG_2: 7,
    FSM_MANUAL_DEPALLETIZE: 8,
}

CYCLE_STEP_TOTAL = 8

NAV_LOST_TAG_TICKS_DEFAULT = 45

SCAN_ROTATE_PHASE_WAIT = "wait"
SCAN_ROTATE_PHASE_TURN = "turn"

ALIGN_ROTATE_PHASE_WAIT = "wait"
ALIGN_ROTATE_PHASE_TURN = "turn"

NAV_PHASE_FORWARD_WAIT = "forward_wait"
NAV_PHASE_FORWARD_MOVE = "forward_move"
NAV_PHASE_REALIGN = "realign"


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
        self.target_distance_m = _env_float("AUTONOMY_TARGET_DISTANCE_M", 0.15)
        self.align_center_threshold_deg = _env_float("AUTONOMY_ALIGN_CENTER_THRESHOLD_DEG", 5.0)
        self.align_wait_s = _env_float("AUTONOMY_ALIGN_WAIT_S", 0.35)
        self.align_pulse_min_s = _env_float("AUTONOMY_ALIGN_PULSE_MIN_S", 0.18)
        self.align_pulse_max_s = _env_float("AUTONOMY_ALIGN_PULSE_MAX_S", 0.5)
        self.nav_forward_pulse_s = _env_float("AUTONOMY_NAV_FORWARD_PULSE_S", 0.4)
        self.nav_forward_wait_s = _env_float("AUTONOMY_NAV_FORWARD_WAIT_S", 0.3)
        self.nav_lost_tag_ticks = _env_int("AUTONOMY_NAV_LOST_TAG_TICKS", NAV_LOST_TAG_TICKS_DEFAULT)
        self.scan_timeout_s = _env_float("AUTONOMY_SCAN_TIMEOUT_S", 60.0)
        self.scan_rotate_interval_s = _env_float("AUTONOMY_SCAN_ROTATE_INTERVAL_S", 0.45)
        self.scan_rotate_duration_s = _env_float("AUTONOMY_SCAN_ROTATE_DURATION_S", 0.6)
        self.loop_hz = _env_int("AUTONOMY_LOOP_HZ", 10)
        self._fsm_state = FSM_OFF
        self._first_tag_id: int | None = None
        self._target_tag_id: int | None = None
        self._current_distance_m: float | None = None
        self._alert: str | None = None
        self._scan_started_at: float | None = None
        self._scan_rotate_phase = SCAN_ROTATE_PHASE_WAIT
        self._scan_rotate_phase_at = 0.0
        self._align_rotate_phase = ALIGN_ROTATE_PHASE_WAIT
        self._align_rotate_phase_at = 0.0
        self._align_pulse_end_at = 0.0
        self._nav_phase = NAV_PHASE_FORWARD_WAIT
        self._nav_phase_at = 0.0
        self._nav_forward_pulse_end_at = 0.0
        self._nav_lost_tag_ticks = 0
        self._nav_recovery_action: str | None = None
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
        self._reset_scan_rotation()
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
        self._reset_scan_rotation()
        self._nav_lost_tag_ticks = 0
        self._nav_recovery_action = None
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
        self._reset_scan_rotation()
        self._reset_align_rotation()
        self._reset_nav_approach()
        self._nav_lost_tag_ticks = 0
        self._nav_recovery_action = None

    def _reset_scan_rotation(self) -> None:
        self._scan_rotate_phase = SCAN_ROTATE_PHASE_WAIT
        self._scan_rotate_phase_at = time.monotonic()

    def _reset_align_rotation(self) -> None:
        self._align_rotate_phase = ALIGN_ROTATE_PHASE_WAIT
        self._align_rotate_phase_at = time.monotonic()
        self._align_pulse_end_at = 0.0

    def _reset_nav_approach(self) -> None:
        self._nav_phase = NAV_PHASE_FORWARD_WAIT
        self._nav_phase_at = time.monotonic()
        self._nav_forward_pulse_end_at = 0.0

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

    def _bearing_deg_from_tag(self, tag: dict) -> float:
        x = float(tag.get("x", 0))
        z = float(tag.get("z", 0))
        if z <= 0.05:
            return 90.0 if x >= 0 else -90.0
        return math.degrees(math.atan2(x, z))

    def _is_tag_centered(self, tag: dict) -> bool:
        return abs(self._bearing_deg_from_tag(tag)) <= self.align_center_threshold_deg

    def _align_pulse_duration_s(self, bearing_deg: float) -> float:
        ratio = min(1.0, abs(bearing_deg) / 35.0)
        return self.align_pulse_min_s + ratio * (self.align_pulse_max_s - self.align_pulse_min_s)

    def _align_turn_action(self, bearing_deg: float) -> str:
        return "turn_right" if bearing_deg > 0 else "turn_left"

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
            await self._tick_scan(tags, exclude_id=None, next_state=FSM_ALIGN_TAG_1, lock_as_first=True)
        elif self._fsm_state == FSM_SCAN_TAG_2:
            await self._tick_scan(
                tags,
                exclude_id=self._first_tag_id,
                next_state=FSM_ALIGN_TAG_2,
                lock_as_first=False,
            )
        elif self._fsm_state == FSM_ALIGN_TAG_1:
            await self._tick_align(tags, nav_state=FSM_NAV_TO_TAG_1, rescan_state=FSM_SCAN_TAG_1)
        elif self._fsm_state == FSM_ALIGN_TAG_2:
            await self._tick_align(tags, nav_state=FSM_NAV_TO_TAG_2, rescan_state=FSM_SCAN_TAG_2)
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
            self._nav_recovery_action = None
            self._scan_started_at = None
            self._reset_scan_rotation()
            self._reset_align_rotation()
            await self._ensure_stop()
            print(f"[autonomy] Tag #{tag_id} detectada → {next_state}")
            return

        if self._scan_started_at is not None:
            elapsed = time.monotonic() - self._scan_started_at
            if elapsed > self.scan_timeout_s:
                self._alert = "Tempo esgotado buscando AprilTag."
                await self._ensure_stop()
                return

        await self._tick_scan_rotation()

    async def _tick_scan_rotation(self) -> None:
        now = time.monotonic()

        if self._scan_rotate_phase == SCAN_ROTATE_PHASE_WAIT:
            await self._ensure_stop()
            if now - self._scan_rotate_phase_at < self.scan_rotate_interval_s:
                return
            await self._send_motor("turn_left")
            self._scan_rotate_phase = SCAN_ROTATE_PHASE_TURN
            self._scan_rotate_phase_at = now
            return

        if now - self._scan_rotate_phase_at >= self.scan_rotate_duration_s:
            await self._ensure_stop()
            self._scan_rotate_phase = SCAN_ROTATE_PHASE_WAIT
            self._scan_rotate_phase_at = now

    async def _tick_align_pulse(self, bearing_deg: float) -> None:
        now = time.monotonic()

        if self._align_rotate_phase == ALIGN_ROTATE_PHASE_WAIT:
            await self._ensure_stop()
            if now - self._align_rotate_phase_at < self.align_wait_s:
                return
            pulse_s = self._align_pulse_duration_s(bearing_deg)
            await self._send_motor(self._align_turn_action(bearing_deg))
            self._align_rotate_phase = ALIGN_ROTATE_PHASE_TURN
            self._align_rotate_phase_at = now
            self._align_pulse_end_at = now + pulse_s
            return

        if now >= self._align_pulse_end_at:
            await self._ensure_stop()
            self._align_rotate_phase = ALIGN_ROTATE_PHASE_WAIT
            self._align_rotate_phase_at = now

    async def _tick_align(self, tags: list[dict], *, nav_state: str, rescan_state: str) -> None:
        tag = self._find_tag_by_id(tags, self._target_tag_id)
        if tag is None:
            self._nav_lost_tag_ticks += 1
            if self._nav_lost_tag_ticks >= self.nav_lost_tag_ticks:
                self._alert = "AprilTag perdida — retomando busca."
                self._fsm_state = rescan_state
                self._scan_started_at = time.monotonic()
                self._reset_scan_rotation()
                self._reset_align_rotation()
                self._nav_lost_tag_ticks = 0
                self._nav_recovery_action = None
                self._current_distance_m = None
                await self._ensure_stop()
                return

            await self._ensure_stop()
            return

        self._nav_lost_tag_ticks = 0
        self._current_distance_m = float(tag.get("distance_m", 999))
        bearing_deg = self._bearing_deg_from_tag(tag)

        if self._is_tag_centered(tag):
            self._fsm_state = nav_state
            self._nav_recovery_action = None
            self._reset_align_rotation()
            self._reset_nav_approach()
            await self._ensure_stop()
            print(f"[autonomy] Tag #{self._target_tag_id} centralizada → {nav_state}")
            return

        await self._tick_align_pulse(bearing_deg)

    async def _tick_nav(self, tags: list[dict], *, rescan_state: str) -> None:
        tag = self._find_tag_by_id(tags, self._target_tag_id)
        if tag is None:
            self._nav_lost_tag_ticks += 1
            if self._nav_lost_tag_ticks >= self.nav_lost_tag_ticks:
                self._alert = "AprilTag perdida — retomando busca."
                self._fsm_state = rescan_state
                self._scan_started_at = time.monotonic()
                self._reset_scan_rotation()
                self._reset_align_rotation()
                self._reset_nav_approach()
                self._nav_lost_tag_ticks = 0
                self._nav_recovery_action = None
                self._current_distance_m = None
                await self._ensure_stop()
                return

            await self._ensure_stop()
            return

        self._nav_lost_tag_ticks = 0
        distance_m = float(tag.get("distance_m", 999))
        self._current_distance_m = distance_m
        bearing_deg = self._bearing_deg_from_tag(tag)
        now = time.monotonic()

        if distance_m <= self.target_distance_m:
            await self._ensure_stop()
            self._reset_nav_approach()
            if self._fsm_state == FSM_NAV_TO_TAG_1:
                self._fsm_state = FSM_MANUAL_PALLETIZE
                print("[autonomy] Destino 1ª tag — aguardando paletização manual.")
            else:
                self._fsm_state = FSM_MANUAL_DEPALLETIZE
                print("[autonomy] Destino 2ª tag — aguardando despaletização manual.")
            self._alert = None
            return

        if self._nav_phase == NAV_PHASE_FORWARD_WAIT:
            await self._ensure_stop()
            if now - self._nav_phase_at < self.nav_forward_wait_s:
                return
            await self._send_motor("move_forward")
            self._nav_phase = NAV_PHASE_FORWARD_MOVE
            self._nav_phase_at = now
            self._nav_forward_pulse_end_at = now + self.nav_forward_pulse_s
            return

        if self._nav_phase == NAV_PHASE_FORWARD_MOVE:
            if now < self._nav_forward_pulse_end_at:
                return
            await self._ensure_stop()
            self._nav_phase = NAV_PHASE_REALIGN
            self._nav_phase_at = now
            self._reset_align_rotation()
            return

        if self._is_tag_centered(tag):
            self._nav_phase = NAV_PHASE_FORWARD_WAIT
            self._nav_phase_at = now
            self._reset_align_rotation()
            return

        await self._tick_align_pulse(bearing_deg)


autonomy_controller = AutonomyController()
