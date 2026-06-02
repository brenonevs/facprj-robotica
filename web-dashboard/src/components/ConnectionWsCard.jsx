import { Radio } from "lucide-react";
import { createWebSocketUrl, WEBSOCKET_PORT } from "../services/websocket.js";

function formatMs(value) {
  if (value == null || Number.isNaN(value)) {
    return "—";
  }
  return `${value} ms`;
}

export function ConnectionWsCard({ ip, connected, handshakeMs, lastRttMs }) {
  const trimmedIp = ip.trim();
  const wsUrl = trimmedIp ? createWebSocketUrl(trimmedIp) : null;

  return (
    <section className="card card-network-tile">
      <div className="card-header card-header--compact">
        <div className="card-header-icon card-header-icon--channels">
          <Radio size={16} />
        </div>
        <div>
          <span className="card-kicker">Rede</span>
          <h2>Comandos</h2>
        </div>
      </div>
      <div className="card-body card-body--network-tile">
        <div className={`connection-channel ${connected ? "connection-channel--on" : ""}`}>
          <div className="connection-channel-head">
            <span>WebSocket</span>
            <span className="connection-channel-port">:{WEBSOCKET_PORT}</span>
          </div>
          <code className="connection-channel-url">{wsUrl ?? `ws://<ip>:${WEBSOCKET_PORT}`}</code>
        </div>
        <dl className="network-tile-metrics">
          <div className="network-tile-metric">
            <dt>Abertura</dt>
            <dd>{connected ? formatMs(handshakeMs) : "—"}</dd>
          </div>
          <div className="network-tile-metric">
            <dt>Último RTT</dt>
            <dd>{connected && lastRttMs != null ? formatMs(lastRttMs) : "—"}</dd>
          </div>
        </dl>
        <p className="card-hint network-tile-hint">
          {connected ? "Canal de comandos ativo." : "Conecte para enviar ordens ao Pi."}
        </p>
      </div>
    </section>
  );
}
