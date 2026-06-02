export const WEBSOCKET_PORT = 8765;
export const CAMERA_STREAM_PORT = 8766;

export function createWebSocketUrl(ip) {
  return `ws://${ip}:${WEBSOCKET_PORT}`;
}

export function createCameraStreamUrl(ip) {
  return `http://${ip}:${CAMERA_STREAM_PORT}/stream`;
}

export function createCommandMessage(action) {
  return {
    type: "command",
    action,
    sent_at: new Date().toISOString(),
  };
}
