import asyncio
import json
from datetime import datetime

from websockets.asyncio.server import ServerConnection, serve


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
            server_time=datetime.now().isoformat(timespec="seconds"),
        )
    )


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

            await websocket.send(
                json_message(
                    "ack",
                    received_action=action,
                    received_message=message,
                    detail="Comando recebido pelo servidor do Raspberry Pi.",
                )
            )

    except Exception as error:
        print(f"Erro com cliente {client}: {error}")
    finally:
        connected_clients.discard(websocket)
        print(f"Cliente desconectado: {client}")


async def main() -> None:
    print(f"Servidor WebSocket rodando em ws://{HOST}:{PORT}")
    async with serve(handle_client, HOST, PORT):
        await asyncio.Future()


if __name__ == "__main__":
    asyncio.run(main())
