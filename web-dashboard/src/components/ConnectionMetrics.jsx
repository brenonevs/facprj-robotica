import { Timer } from "lucide-react";

function formatMs(value) {
  if (value == null || Number.isNaN(value)) {
    return "—";
  }
  return `${value} ms`;
}

export function ConnectionMetrics({ status, handshakeMs, firstResponseMs, lastRttMs }) {
  const connected = status === "connected";
  const show = connected;

  return (
    <aside className="card card-latency">
      <div className="card-header">
        <div className="card-header-icon card-header-icon--latency">
          <Timer size={18} />
        </div>
        <div>
          <span className="card-kicker">Latência</span>
          <h2>Canal WebSocket</h2>
        </div>
      </div>
      <dl className="latency-metrics">
        <div className="latency-row">
          <dt>Abertura do canal</dt>
          <dd>{show ? formatMs(handshakeMs) : "—"}</dd>
        </div>
        <div className="latency-row">
          <dt>Primeira resposta</dt>
          <dd>{show ? formatMs(firstResponseMs) : "—"}</dd>
        </div>
        <div className="latency-row">
          <dt>Último RTT (comando)</dt>
          <dd>{show && lastRttMs != null ? formatMs(lastRttMs) : "—"}</dd>
        </div>
      </dl>
    </aside>
  );
}
