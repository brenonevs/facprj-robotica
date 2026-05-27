import asyncio
import json
import os

import websockets

from arduino_bridge import bridge


async def main() -> None:
    uri = os.environ.get("WS_URI", "ws://127.0.0.1:8765")
    loop = asyncio.get_running_loop()
    try:
        bridge.start(loop)
    except RuntimeError as error:
        print(f"Aviso Arduino: {error}")

    async with websockets.connect(uri) as ws:
        print("←", await ws.recv())
        for action in ("move_forward", "stop", "fork_up"):
            msg = json.dumps({"type": "command", "action": action})
            await ws.send(msg)
            print("→", msg)
            print("←", await ws.recv())

    bridge.stop()


if __name__ == "__main__":
    asyncio.run(main())
