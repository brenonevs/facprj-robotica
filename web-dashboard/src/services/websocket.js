export const WEBSOCKET_PORT = 8765;
export const CAMERA_STREAM_PORT = 8766;

function normalizeHost(input) {
  let host = input.trim();
  host = host.replace(/^wss?:\/\//i, "");
  host = host.replace(/^https?:\/\//i, "");
  host = host.split("/")[0];
  host = host.replace(/:\d+$/, "");
  return host;
}

function isLocalHost(host) {
  return host === "localhost" || /^\d{1,3}(\.\d{1,3}){3}$/.test(host);
}

export function createWebSocketUrl(ip) {
  const host = normalizeHost(ip);
  if (isLocalHost(host)) {
    return `ws://${host}:${WEBSOCKET_PORT}`;
  }
  return `wss://${host}`;
}

export function createCameraStreamUrl(ip) {
  return `http://${ip}:${CAMERA_STREAM_PORT}/stream`;
}

export function createCommandMessage(action, options = {}) {
  const message = {
    type: "command",
    action,
    sent_at: new Date().toISOString(),
  };
  if (options.tagId != null && options.tagId !== "") {
    message.tagId = Number(options.tagId);
  }
  if (options.scanRotateDurationS != null && options.scanRotateDurationS !== "") {
    message.scanRotateDurationS = Number(options.scanRotateDurationS);
  }
  if (options.scanRotateIntervalS != null && options.scanRotateIntervalS !== "") {
    message.scanRotateIntervalS = Number(options.scanRotateIntervalS);
  }
  if (options.scanForwardPulseS != null && options.scanForwardPulseS !== "") {
    message.scanForwardPulseS = Number(options.scanForwardPulseS);
  }
  return message;
}
