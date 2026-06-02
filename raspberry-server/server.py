import asyncio
import json
import os
from datetime import datetime

from websockets.asyncio.server import ServerConnection, serve

from arduino_bridge import bridge
from telemetry_parser import parse_telemetry_line
from vision import vision_service


HOST = "0.0.0.0"
PORT = 8765
CAMERA_PORT = int(os.environ.get("CAMERA_PORT", "8766"))

connected_clients: set[ServerConnection] = set()


def json_message(message_type: str, **data) -> str:
    return json.dumps({"type": message_type, **data}, ensure_ascii=False)


def parse_bool(value) -> bool | None:
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return bool(value)
    if isinstance(value, str):
        raw = value.strip().lower()
        if raw in ("1", "true", "yes", "on"):
            return True
        if raw in ("0", "false", "no", "off"):
            return False
    return None


async def broadcast_status_to_clients(detail: str) -> None:
    stale: list[ServerConnection] = []
    for websocket in list(connected_clients):
        try:
            await send_status(websocket, "connected", detail)
        except Exception:
            stale.append(websocket)
    for websocket in stale:
        connected_clients.discard(websocket)


async def send_status(websocket: ServerConnection, status: str, detail: str) -> None:
    await websocket.send(
        json_message(
            "status",
            status=status,
            detail=detail,
            connected_clients=len(connected_clients),
            arduino_connected=bridge.connected,
            arduino_simulate=bridge.simulate,
            vision_active=vision_service.active,
            vision_disabled=vision_service.disabled,
            camera_stream_port=CAMERA_PORT,
            server_time=datetime.now().isoformat(timespec="seconds"),
        )
    )


async def broadcast_payload(message_type: str, payload: dict) -> None:
    if not connected_clients:
        return
    message = json_message(message_type, **payload)
    stale: list[ServerConnection] = []
    for websocket in list(connected_clients):
        try:
            await websocket.send(message)
        except Exception:
            stale.append(websocket)
    for websocket in stale:
        connected_clients.discard(websocket)


async def broadcast_telemetry(payload: dict) -> None:
    await broadcast_payload("telemetry", payload)


async def telemetry_forward_loop() -> None:
    queue = bridge.get_line_queue()
    if queue is None:
        return
    while True:
        line = await queue.get()
        if not line.startswith("T"):
            continue
        payload = parse_telemetry_line(line)
        if payload is None:
            print(f"[telemetry] Linha inválida do Arduino: {line}")
            continue
        clients = len(connected_clients)
        print(f"[telemetry] Arduino → Pi ({clients} cliente(s) WS): {line}")
        await broadcast_telemetry(payload)


async def vision_broadcast_loop() -> None:
    last_broadcast_key = ""
    while True:
        await asyncio.sleep(0.25)
        if not connected_clients or not vision_service.active:
            continue
        state = vision_service.get_latest_state()
        broadcast_key = json.dumps(state.get("tags", []), sort_keys=True)
        if broadcast_key != last_broadcast_key:
            last_broadcast_key = broadcast_key
            clients = len(connected_clients)
            if state["tag_count"] > 0:
                summary = ", ".join(
                    f"#{t['id']}@{t['distance_m']:.2f}m" for t in state["tags"]
                )
                print(
                    f"[vision] Pi → WS ({clients} cliente(s)): "
                    f"{state['tag_count']} tag(s) [{summary}]"
                )
            else:
                print(f"[vision] Pi → WS ({clients} cliente(s)): nenhuma tag")
        await broadcast_payload("vision", **state)


async def handle_client(websocket: ServerConnection) -> None:
    connected_clients.add(websocket)
    client = websocket.remote_address
    print(f"Cliente conectado: {client}")

    try:
        await send_status(websocket, "connected", "Conexão WebSocket estabelecida com o Raspberry Pi.")

        async for raw_message in websocket:
            print(f"Mensagem recebida de {client}: {raw_message}")

            try:
                message = json.loads(raw_message)
            except json.JSONDecodeError:
                await websocket.send(json_message("error", detail="Mensagem inválida. Envie JSON."))
                continue

            action = message.get("action", "unknown")

            if action == "set_arduino_simulate":
                enabled = parse_bool(message.get("enabled"))
                if enabled is None:
                    await websocket.send(
                        json_message(
                            "error",
                            received_action=action,
                            detail="Campo 'enabled' (true/false) é obrigatório.",
                            arduino_connected=bridge.connected,
                            arduino_simulate=bridge.simulate,
                        )
                    )
                    continue

                ok, arduino_detail = await asyncio.to_thread(bridge.set_simulate, enabled)
                if not ok:
                    await websocket.send(
                        json_message(
                            "error",
                            received_action=action,
                            detail=arduino_detail or "Falha ao alternar modo do Arduino.",
                            arduino_connected=bridge.connected,
                            arduino_simulate=bridge.simulate,
                        )
                    )
                    continue

                print(f"[arduino] Modo alterado via painel: simulate={bridge.simulate}")
                await websocket.send(
                    json_message(
                        "ack",
                        received_action=action,
                        received_message=message,
                        arduino_response=arduino_detail,
                        arduino_connected=bridge.connected,
                        arduino_simulate=bridge.simulate,
                        detail=arduino_detail,
                    )
                )
                await broadcast_status_to_clients(arduino_detail)
                continue

            ok, arduino_detail = await asyncio.to_thread(bridge.send_action, action)

            if not ok:
                await websocket.send(
                    json_message(
                        "error",
                        received_action=action,
                        detail=arduino_detail or "Falha ao enviar comando ao Arduino.",
                        arduino_connected=bridge.connected,
                        arduino_simulate=bridge.simulate,
                    )
                )
                continue

            await websocket.send(
                json_message(
                    "ack",
                    received_action=action,
                    received_message=message,
                    arduino_response=arduino_detail,
                    arduino_connected=bridge.connected,
                    arduino_simulate=bridge.simulate,
                    detail="Comando encaminhado ao Arduino.",
                )
            )

    except Exception as error:
        print(f"Erro com cliente {client}: {error}")
    finally:
        connected_clients.discard(websocket)
        print(f"Cliente desconectado: {client}")


async def main() -> None:
    loop = asyncio.get_running_loop()
    try:
        bridge.start(loop)
    except RuntimeError as error:
        print(f"[arduino] Aviso: {error}")
        print("[arduino] Comandos WebSocket retornarão erro até a serial estar disponível.")
        print("[arduino] Use ARDUINO_SIMULATE=1 para desenvolver sem hardware.")

    vision_service.start(HOST, CAMERA_PORT)

    telemetry_task = asyncio.create_task(telemetry_forward_loop())
    vision_task = asyncio.create_task(vision_broadcast_loop())

    print(f"Servidor WebSocket rodando em ws://{HOST}:{PORT}")
    if not vision_service.disabled:
        print(f"Stream de câmera em http://<IP>:{CAMERA_PORT}/stream")
    try:
        async with serve(handle_client, HOST, PORT):
            await asyncio.Future()
    finally:
        telemetry_task.cancel()
        vision_task.cancel()
        vision_service.stop()
        bridge.stop()


if __name__ == "__main__":
    asyncio.run(main())
