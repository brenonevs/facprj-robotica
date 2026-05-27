import asyncio
import os
import threading
import time
from collections import deque

ACTION_TO_LINE = {
    "stop": "S",
    "move_forward": "M F",
    "move_backward": "M B",
    "turn_left": "M L",
    "turn_right": "M R",
    "fork_up": "F U",
    "fork_down": "F D",
    "start_autonomous_mode": "A 1",
    "stop_autonomous_mode": "A 0",
}


def _env_bool(name: str, default: bool = False) -> bool:
    raw = os.environ.get(name, "").strip().lower()
    if not raw:
        return default
    return raw in ("1", "true", "yes", "on")


class ArduinoBridge:
    def __init__(self) -> None:
        self.port = os.environ.get("ARDUINO_PORT", "/dev/ttyACM0")
        self.baud = int(os.environ.get("ARDUINO_BAUD", "115200"))
        self._simulate = _env_bool("ARDUINO_SIMULATE", False)
        self._serial = None
        self._loop: asyncio.AbstractEventLoop | None = None
        self._line_queue: asyncio.Queue[str] | None = None
        self._reader_thread: threading.Thread | None = None
        self._stop_event = threading.Event()
        self._write_lock = threading.Lock()
        self._connected = False
        self._recent_lines: deque[str] = deque(maxlen=32)

    @property
    def connected(self) -> bool:
        return self._connected

    @property
    def simulate(self) -> bool:
        return self._simulate

    def start(self, loop: asyncio.AbstractEventLoop) -> None:
        if self._reader_thread is not None and self._reader_thread.is_alive():
            return
        self._loop = loop
        self._line_queue = asyncio.Queue()
        self._stop_event.clear()
        if self._simulate:
            self._connected = True
            print("[arduino] Modo simulado (ARDUINO_SIMULATE=1)")
            return
        try:
            import serial
        except ImportError as error:
            raise RuntimeError("Instale pyserial: pip install pyserial") from error
        try:
            self._serial = serial.Serial(self.port, self.baud, timeout=0.05)
            time.sleep(2.0)
            self._connected = True
            print(f"[arduino] Conectado em {self.port} @ {self.baud}")
        except Exception as error:
            self._connected = False
            self._serial = None
            raise RuntimeError(f"Falha ao abrir {self.port}: {error}") from error
        self._reader_thread = threading.Thread(target=self._read_loop, name="arduino-serial-read", daemon=True)
        self._reader_thread.start()

    def stop(self) -> None:
        self._stop_event.set()
        self._connected = False
        if self._reader_thread is not None:
            self._reader_thread.join(timeout=2.0)
            self._reader_thread = None
        with self._write_lock:
            if self._serial is not None and self._serial.is_open:
                self._serial.close()
            self._serial = None

    def send_action(self, action: str) -> tuple[bool, str | None]:
        line = ACTION_TO_LINE.get(action)
        if line is None:
            return False, f"Ação desconhecida: {action}"
        if self._simulate:
            response = f"OK {line}"
            self._push_line(response)
            print(f"[arduino:sim] >> {line}  << {response}")
            return True, response
        if not self._connected or self._serial is None:
            return False, "Arduino não conectado"
        try:
            with self._write_lock:
                self._recent_lines.clear()
                payload = (line + "\n").encode("ascii")
                self._serial.write(payload)
                self._serial.flush()
            response = self.pop_recent_line("OK", timeout=0.5)
            if response is None:
                err = self.pop_recent_line("ERR", timeout=0.05)
                if err:
                    return False, err
            return True, response
        except Exception as error:
            self._connected = False
            return False, str(error)

    def get_line_queue(self) -> asyncio.Queue[str] | None:
        return self._line_queue

    def pop_recent_line(self, prefix: str, timeout: float = 0.35) -> str | None:
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            for stored in list(self._recent_lines):
                if stored.startswith(prefix):
                    return stored
            time.sleep(0.02)
        return None

    def _read_loop(self) -> None:
        while not self._stop_event.is_set():
            if self._serial is None or not self._serial.is_open:
                break
            try:
                raw = self._serial.readline()
            except Exception as error:
                print(f"[arduino] Erro na leitura: {error}")
                self._connected = False
                break
            if not raw:
                continue
            line = raw.decode("ascii", errors="replace").strip()
            if line:
                self._push_line(line)
                print(f"[arduino] << {line}")

    def _push_line(self, line: str) -> None:
        self._recent_lines.append(line)
        if self._loop is None or self._line_queue is None:
            return

        def put_nowait() -> None:
            try:
                self._line_queue.put_nowait(line)
            except asyncio.QueueFull:
                pass

        self._loop.call_soon_threadsafe(put_nowait)


bridge = ArduinoBridge()
