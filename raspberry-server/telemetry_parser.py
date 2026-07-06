import math

FSM_STATES = [
    "OFF",
    "IDLE",
    "SCAN_TAG_1",
    "NAV_TO_TAG_1",
    "MANUAL_PALLETIZE",
    "SCAN_TAG_2",
    "NAV_TO_TAG_2",
    "MANUAL_DEPALLETIZE",
]


def _parse_kv_tokens(rest: str) -> dict[str, str]:
    out: dict[str, str] = {}
    for token in rest.split():
        if "=" not in token:
            continue
        key, value = token.split("=", 1)
        out[key.strip()] = value.strip()
    return out


def _float(kv: dict[str, str], key: str, default: float = 0.0) -> float:
    raw = kv.get(key)
    if raw is None:
        return default
    try:
        return float(raw)
    except ValueError:
        return default


def _int(kv: dict[str, str], key: str, default: int = 0) -> int:
    raw = kv.get(key)
    if raw is None:
        return default
    try:
        return int(float(raw))
    except ValueError:
        return default


def _bool01(kv: dict[str, str], key: str, default: bool = False) -> bool:
    raw = kv.get(key)
    if raw is None:
        return default
    return raw in ("1", "true", "True", "yes")


def _split_list(raw: str | None) -> list[str]:
    if not raw:
        return []
    return [part.strip() for part in raw.split("|") if part.strip()]


def parse_telemetry_line(line: str) -> dict | None:
    stripped = line.strip()
    if not stripped.startswith("T"):
        return None
    rest = stripped[1:].strip()
    if not rest:
        return None
    kv = _parse_kv_tokens(rest)

    tag_detected = _bool01(kv, "tag")
    tid_raw = kv.get("tid")
    april_id = None if tid_raw in (None, "", "-1") else _int(kv, "tid", 0)
    tdist_raw = kv.get("tdist")
    april_dist = None if tdist_raw in (None, "", "-1") else _float(kv, "tdist", 0.0)

    fsm = kv.get("fsm", "MANUAL")

    return {
        "batteryPercent": _float(kv, "bat", 0.0),
        "batteryVoltage": _float(kv, "v", 0.0),
        "motorTempLeft": _float(kv, "tl", 0.0),
        "motorTempRight": _float(kv, "tr", 0.0),
        "forkHeightPercent": _float(kv, "fork", 0.0),
        "forkHeightMm": _float(kv, "fmm", 0.0),
        "position": {
            "x": _float(kv, "x", 0.0),
            "y": _float(kv, "y", 0.0),
            "thetaDeg": _float(kv, "th", 0.0),
        },
        "linearSpeed": _float(kv, "lv", 0.0),
        "angularSpeed": _float(kv, "av", 0.0),
        "wifiRssi": _int(kv, "rssi", 0),
        "imuOk": _bool01(kv, "imu", False),
        "loadCellKg": _float(kv, "load", 0.0),
        "uptimeSec": _int(kv, "up", 0),
        "errors": _split_list(kv.get("err")),
        "alerts": _split_list(kv.get("alt")),
        "aprilTagDetected": tag_detected,
        "aprilTagId": april_id,
        "aprilTagDistanceM": april_dist,
        "fsmState": fsm,
    }


def build_simulated_telemetry_line(tick: int, autonomous: bool = False) -> str:
    t = tick
    bat = 87.0 + math.sin(t / 17.0) * 2.5
    v = 20.0 + (bat / 100.0) * 5.2
    tl = 36.0 + math.sin(t / 7.0) * 4.0
    tr = 35.0 + math.cos(t / 8.0) * 3.5
    x = 1.2 + math.sin(t / 13.0) * 0.35
    y = 0.4 + math.cos(t / 11.0) * 0.28
    th = 4.5 + math.sin(t / 9.0) * 12.0
    fork = 42.0 + math.sin(t / 11.0) * 18.0
    load = max(0.0, 8.0 + math.sin(t / 5.0) * 6.0)
    rssi = int(-52 + math.sin(t / 9.0) * 6.0)
    imu = 0 if t % 47 == 0 else 1
    lv = math.sin(t / 4.0) * 0.12
    av = math.cos(t / 5.0) * 0.08

    tag = 0
    tid = -1
    tdist = -1.0
    fsm = "MANUAL"
    alt = ""

    if autonomous:
        fsm = FSM_STATES[(t // 5) % len(FSM_STATES)]
        if t % 3 != 0:
            tag = 1
            tid = [0, 1, 2, 7, 12, 24, 36][t % 7]
            tdist = 0.55 + (t % 10) * 0.12
        if fsm.startswith("SCAN_TAG") and tag == 0:
            alt = "Buscando AprilTag no campo de visão…"

    if tl > 62 or tr > 60:
        alt = (alt + "|" if alt else "") + "Temperatura dos motores elevada — reduza carga ou aguarde resfriamento."
    if bat < 22:
        alt = (alt + "|" if alt else "") + "Bateria baixa — considere recarregar em breve."

    err = "Falha transitória no encoder da roda esquerda (sim)." if t % 83 == 0 and t > 0 else ""

    return (
        f"T bat={bat:.1f} v={v:.2f} tl={tl:.1f} tr={tr:.1f} "
        f"x={x:.2f} y={y:.2f} th={th:.1f} lv={lv:.2f} av={av:.2f} "
        f"fork={fork:.0f} load={load:.1f} up={t} rssi={rssi} imu={imu} "
        f"tag={tag} tid={tid} tdist={tdist:.2f} fsm={fsm}"
        + (f" alt={alt}" if alt else "")
        + (f" err={err}" if err else "")
    )
