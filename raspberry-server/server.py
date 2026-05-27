import asyncio
import json
from datetime import datetime

from websockets.asyncio.server import ServerConnection, serve

from arduino_bridge import bridge
from telemetry_parser import parse_telemetry_line


HOST = "0.0.0.0"
PORT = 8765

connected_clients: set[ServerConnection] = set()


def json_message(message_type: str, **data) -> str:
    return json.dumps({"type": message_type, **data}, ensure_ascii=False)


async def send_status(websocket: ServerConnection, status: str, detail: str) -> None:
    await websocket.send(
        json_message(
            "status",
            status=status,
            detail=detail,
            connected_clients=len(connected_clients),
            arduino_connected=bridge.connected,
            arduino_simulate=bridge.simulate,
            server_time=datetime.now().isoformat(timespec="seconds"),
        )
    )


async def broadcast_telemetry(payload: dict) -> None:
    if not connected_clients:
        return
    message = json_message("telemetry", **payload)
    stale: list[ServerConnection] = []
    for websocket in list(connected_clients):
        try:
            await websocket.send(message)
        except Exception:
            stale.append(websocket)
    for websocket in stale:
        connected_clients.discard(websocket)


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
            continue
        await broadcast_telemetry(payload)


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

            ok, arduino_detail = await asyncio.to_thread(bridge.send_action, action)

            if not ok:
                await websocket.send(
                    json_message(
                        "error",
                        received_action=action,
                        detail=arduino_detail or "Falha ao enviar comando ao Arduino.",
                        arduino_connected=bridge.connected,
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

    telemetry_task = asyncio.create_task(telemetry_forward_loop())

    print(f"Servidor WebSocket rodando em ws://{HOST}:{PORT}")
    try:
        async with serve(handle_client, HOST, PORT):
            await asyncio.Future()
    finally:
        telemetry_task.cancel()
        bridge.stop()


if __name__ == "__main__":
    asyncio.run(main())
