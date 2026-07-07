import json
import math
import os
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any

import cv2
import numpy as np
from pupil_apriltags import Detector

FX = 818.035048081
FY = 818.035048081
CX = 362.333072996
CY = 212.410243815

CAMERA_MATRIX = np.array([[FX, 0, CX], [0, FY, CY], [0, 0, 1]], dtype=np.float64)

DIST_COEFFS = np.array(
    [-0.245766726354, 3.02541650022, -0.019545346502, 0.00572149972098, -7.19033666473]
)

TAG_SIZE = 0.04
AXIS_LENGTH = TAG_SIZE * 1.5
AXIS_POINTS = np.array(
    [[0, 0, 0], [AXIS_LENGTH, 0, 0], [0, AXIS_LENGTH, 0], [0, 0, AXIS_LENGTH]],
    dtype=np.float32,
)

AT_DETECTOR = Detector(families="tag25h9")


def _env_int(name: str, default: int) -> int:
    raw = os.environ.get(name, "").strip()
    if not raw:
        return default
    try:
        return int(raw)
    except ValueError:
        return default


def _env_bool(name: str, default: bool = False) -> bool:
    raw = os.environ.get(name, "").strip().lower()
    if not raw:
        return default
    return raw in ("1", "true", "yes", "on")


def _tag_payload(result) -> dict[str, Any]:
    t = result.pose_t
    x = float(t[0][0])
    y = float(t[1][0])
    z = float(t[2][0])
    distancia = math.sqrt(x**2 + y**2 + z**2)
    R = result.pose_R
    pitch = math.atan2(R[2, 1], R[2, 2])
    yaw = math.atan2(-R[2, 0], math.sqrt(R[2, 1] ** 2 + R[2, 2] ** 2))
    roll = math.atan2(R[1, 0], R[0, 0])
    pitch_deg = math.degrees(pitch)
    yaw_deg = math.degrees(yaw)
    roll_deg = math.degrees(roll)
    return {
        "id": int(result.tag_id),
        "x": x,
        "y": y,
        "z": z,
        "distance_m": distancia,
        "pitch_deg": pitch_deg,
        "yaw_deg": yaw_deg,
        "roll_deg": roll_deg,
    }


def _draw_tags(frame: np.ndarray, results, new_camera_matrix: np.ndarray) -> None:
    if len(results) == 0:
        cv2.putText(frame, "NO TAG", (20, 40), cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 0, 255), 2)
        return

    for r in results:
        payload = _tag_payload(r)
        distancia = payload["distance_m"]
        pitch_deg = payload["pitch_deg"]
        yaw_deg = payload["yaw_deg"]
        roll_deg = payload["roll_deg"]

        corners = r.corners
        for i in range(4):
            pt1 = (int(corners[i][0]), int(corners[i][1]))
            pt2 = (int(corners[(i + 1) % 4][0]), int(corners[(i + 1) % 4][1]))
            cv2.line(frame, pt1, pt2, (0, 255, 0), 2)

        R = r.pose_R
        rvec, _ = cv2.Rodrigues(R)
        tvec = r.pose_t
        img_points, _ = cv2.projectPoints(
            AXIS_POINTS, rvec, tvec, new_camera_matrix, np.zeros(5)
        )
        centro = (int(img_points[0].ravel()[0]), int(img_points[0].ravel()[1]))
        eixo_x = (int(img_points[1].ravel()[0]), int(img_points[1].ravel()[1]))
        eixo_y = (int(img_points[2].ravel()[0]), int(img_points[2].ravel()[1]))
        eixo_z = (int(img_points[3].ravel()[0]), int(img_points[3].ravel()[1]))
        cv2.line(frame, centro, eixo_x, (0, 0, 255), 2)
        cv2.line(frame, centro, eixo_y, (0, 255, 0), 2)
        cv2.line(frame, centro, eixo_z, (255, 0, 0), 2)

        text_x = int(corners[0][0])
        text_y = int(corners[0][1])
        cv2.putText(
            frame,
            f"ID: {r.tag_id} | D: {distancia:.2f}m",
            (text_x, text_y - 30),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.5,
            (255, 255, 0),
            2,
        )
        cv2.putText(
            frame,
            f"P:{pitch_deg:.1f} Y:{yaw_deg:.1f} R:{roll_deg:.1f}",
            (text_x, text_y - 10),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.4,
            (0, 255, 255),
            1,
        )


def _log_tags(tags: list[dict[str, Any]], had_tags: bool) -> bool:
    if not tags:
        if had_tags:
            print("[vision] Nenhuma AprilTag no frame")
        return False

    for tag in tags:
        print(
            f"[vision] TAG[{tag['id']}] -> X={tag['x']:.2f}m Y={tag['y']:.2f}m Z={tag['z']:.2f}m | "
            f"Dist={tag['distance_m']:.2f}m | P={tag['pitch_deg']:.1f} "
            f"Y={tag['yaw_deg']:.1f} R={tag['roll_deg']:.1f}"
        )
    return True


class VisionService:
    def __init__(self) -> None:
        self._disabled = _env_bool("VISION_DISABLE", False)
        self._camera_index = int(os.environ.get("VISION_CAMERA_INDEX", "0"))
        self._capture_width = _env_int("VISION_CAPTURE_WIDTH", 640)
        self._capture_height = _env_int("VISION_CAPTURE_HEIGHT", 480)
        self._stream_fps = _env_int("VISION_STREAM_FPS", 15)
        self._jpeg_quality = _env_int("VISION_JPEG_QUALITY", 55)
        self._lock = threading.Lock()
        self._stop = threading.Event()
        self._latest_jpeg: bytes | None = None
        self._latest_state: dict[str, Any] = {"tags": [], "tag_count": 0}
        self._capture_thread: threading.Thread | None = None
        self._http_thread: threading.Thread | None = None
        self._http_server: ThreadingHTTPServer | None = None
        self._active = False
        self._had_tags = False

    @property
    def active(self) -> bool:
        return self._active

    @property
    def disabled(self) -> bool:
        return self._disabled

    def get_latest_jpeg(self) -> bytes | None:
        with self._lock:
            return self._latest_jpeg

    def get_latest_state(self) -> dict[str, Any]:
        with self._lock:
            return {
                "tags": list(self._latest_state.get("tags", [])),
                "tag_count": int(self._latest_state.get("tag_count", 0)),
            }

    def start(self, host: str = "0.0.0.0", stream_port: int = 8766) -> None:
        if self._disabled:
            print("[vision] Desabilitado (VISION_DISABLE=1)")
            return
        if self._capture_thread and self._capture_thread.is_alive():
            return
        self._stop.clear()
        self._capture_thread = threading.Thread(target=self._capture_loop, daemon=True)
        self._capture_thread.start()
        self._http_thread = threading.Thread(
            target=self._run_http_server,
            args=(host, stream_port),
            daemon=True,
        )
        self._http_thread.start()

    def stop(self) -> None:
        self._stop.set()
        if self._http_server:
            self._http_server.shutdown()
        self._active = False

    def _capture_loop(self) -> None:
        cap = cv2.VideoCapture(self._camera_index)
        if not cap.isOpened():
            print("[vision] ERRO: Câmera não encontrada.")
            return

        cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
        cap.set(cv2.CAP_PROP_FRAME_WIDTH, self._capture_width)
        cap.set(cv2.CAP_PROP_FRAME_HEIGHT, self._capture_height)

        self._active = True
        frame_interval = 1.0 / max(1, self._stream_fps)
        print(
            f"[vision] Câmera aberta (índice {self._camera_index}, "
            f"{self._capture_width}x{self._capture_height} @ {self._stream_fps} fps)"
        )
        new_camera_matrix: np.ndarray | None = None
        next_frame_at = time.monotonic()

        try:
            while not self._stop.is_set():
                now = time.monotonic()
                if now < next_frame_at:
                    time.sleep(min(0.01, next_frame_at - now))
                    continue
                next_frame_at = now + frame_interval

                ret, frame = cap.read()
                if not ret:
                    print("[vision] ERRO: Falha ao capturar frame.")
                    time.sleep(0.1)
                    continue

                h, w = frame.shape[:2]
                if new_camera_matrix is None:
                    new_camera_matrix, _ = cv2.getOptimalNewCameraMatrix(
                        CAMERA_MATRIX, DIST_COEFFS, (w, h), 1, (w, h)
                    )

                undistorted = cv2.undistort(
                    frame, CAMERA_MATRIX, DIST_COEFFS, None, new_camera_matrix
                )
                gray = cv2.cvtColor(undistorted, cv2.COLOR_BGR2GRAY)
                results = AT_DETECTOR.detect(
                    gray,
                    estimate_tag_pose=True,
                    camera_params=[
                        new_camera_matrix[0, 0],
                        new_camera_matrix[1, 1],
                        new_camera_matrix[0, 2],
                        new_camera_matrix[1, 2],
                    ],
                    tag_size=TAG_SIZE,
                )

                tags = [_tag_payload(r) for r in results]
                state = {"tags": tags, "tag_count": len(tags)}
                state_key = json.dumps(tags, sort_keys=True)

                with self._lock:
                    prev_key = json.dumps(
                        self._latest_state.get("tags", []), sort_keys=True
                    )
                    self._latest_state = state
                    if state_key != prev_key:
                        self._had_tags = _log_tags(tags, self._had_tags)

                _draw_tags(undistorted, results, new_camera_matrix)
                ok, encoded = cv2.imencode(
                    ".jpg",
                    undistorted,
                    [int(cv2.IMWRITE_JPEG_QUALITY), self._jpeg_quality],
                )
                if ok:
                    jpeg_bytes = encoded.tobytes()
                    with self._lock:
                        self._latest_jpeg = jpeg_bytes
        finally:
            cap.release()
            self._active = False
            print("[vision] Captura encerrada.")

    def _run_http_server(self, host: str, port: int) -> None:
        service = self

        class MjpegHandler(BaseHTTPRequestHandler):
            def log_message(self, format: str, *args: Any) -> None:
                return

            def do_GET(self) -> None:
                path = self.path.split("?", 1)[0]
                if path not in ("/stream", "/stream/"):
                    self.send_error(404)
                    return

                self.send_response(200)
                self.send_header("Age", "0")
                self.send_header("Cache-Control", "no-cache, private")
                self.send_header("Pragma", "no-cache")
                self.send_header(
                    "Content-Type", "multipart/x-mixed-replace; boundary=frame"
                )
                self.end_headers()

                try:
                    frame_interval = 1.0 / max(1, service._stream_fps)
                    while not service._stop.is_set():
                        jpeg = service.get_latest_jpeg()
                        if jpeg is None:
                            time.sleep(0.05)
                            continue
                        self.wfile.write(b"--frame\r\n")
                        self.wfile.write(b"Content-Type: image/jpeg\r\n")
                        self.wfile.write(f"Content-Length: {len(jpeg)}\r\n\r\n".encode())
                        self.wfile.write(jpeg)
                        self.wfile.write(b"\r\n")
                        time.sleep(frame_interval)
                except (BrokenPipeError, ConnectionResetError, OSError):
                    pass

        server = ThreadingHTTPServer((host, port), MjpegHandler)
        self._http_server = server
        print(f"[vision] Stream MJPEG em http://{host}:{port}/stream")
        server.serve_forever(poll_interval=0.5)


def run_standalone() -> None:
    service = VisionService()
    service.start()
    window = "Tracking"
    try:
        while service.active and not service._stop.is_set():
            jpeg = service.get_latest_jpeg()
            if jpeg is None:
                time.sleep(0.02)
                continue
            frame = cv2.imdecode(np.frombuffer(jpeg, dtype=np.uint8), cv2.IMREAD_COLOR)
            if frame is not None:
                cv2.imshow(window, frame)
            if (cv2.waitKey(1) & 0xFF) == ord("q"):
                break
    finally:
        service.stop()
        cv2.destroyAllWindows()


vision_service = VisionService()
