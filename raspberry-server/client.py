import asyncio
import json
import websockets
async def main():
    uri = "ws://127.0.0.1:8765"
    async with websockets.connect(uri) as ws:
        print("←", await ws.recv())
        msg = json.dumps({"action": "test"})
        await ws.send(msg)
        print("→", msg)
        print("←", await ws.recv())
asyncio.run(main())