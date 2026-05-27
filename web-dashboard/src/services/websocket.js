export const WEBSOCKET_PORT = 8765;

export function createWebSocketUrl(ip) {
  return `ws://${ip}:${WEBSOCKET_PORT}`;
}

export function createCommandMessage(action) {
  return {
    type: "command",
    action,
    sent_at: new Date().toISOString(),
  };
}
