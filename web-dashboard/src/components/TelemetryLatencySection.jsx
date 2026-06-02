import { Timer } from "lucide-react";

function Metric({ label, value, unit, icon: Icon }) {
  return (
    <div className="telemetry-metric telemetry-metric--card">
      {Icon ? (
        <div className="telemetry-metric-icon">
          <Icon size={17} />
        </div>
      ) : null}
      <div className="telemetry-metric-body">
        <span className="telemetry-metric-label">{label}</span>
        <span className="telemetry-metric-value">
          {value}
          {unit ? <span className="telemetry-metric-unit">{unit}</span> : null}
        </span>
      </div>
    </div>
  );
}

function latencyValue(connected, ms) {
  if (!connected || ms == null || Number.isNaN(ms)) {
    return "—";
  }
  return String(Math.round(ms));
}

export function TelemetryLatencySection({ status, handshakeMs, firstResponseMs, lastRttMs }) {
  const connected = status === "connected";

  return (
    <div className="telemetry-section telemetry-section--latency">
      <h3 className="telemetry-section-title">Latência do canal</h3>
      <div className="telemetry-section-grid telemetry-section-grid--3">
        <Metric
          label="Abertura do canal"
          value={latencyValue(connected, handshakeMs)}
          unit={connected && handshakeMs != null ? " ms" : ""}
          icon={Timer}
        />
        <Metric
          label="Primeira resposta"
          value={latencyValue(connected, firstResponseMs)}
          unit={connected && firstResponseMs != null ? " ms" : ""}
          icon={Timer}
        />
        <Metric
          label="Último RTT"
          value={latencyValue(connected, lastRttMs)}
          unit={connected && lastRttMs != null ? " ms" : ""}
          icon={Timer}
        />
      </div>
    </div>
  );
}
