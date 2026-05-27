import { LoaderCircle, Plug, Power, WifiOff } from "lucide-react";

const statusConfig = {
  disconnected: {
    icon: WifiOff,
    tone: "danger",
  },
  connecting: {
    icon: LoaderCircle,
    tone: "warning",
  },
  connected: {
    icon: Plug,
    tone: "success",
  },
};

export function ConnectionStatus({ label, status, isConnected, onDisconnect }) {
  const config = statusConfig[status] ?? statusConfig.disconnected;
  const Icon = config.icon;

  return (
    <section className={`card card-status card-status--${config.tone}`}>
      <div className="card-header card-header--spread">
        <div className="card-header">
          <div className={`status-badge status-badge--${config.tone}`}>
            <Icon size={22} className={status === "connecting" ? "spin" : undefined} />
          </div>
          <div>
            <span className="card-kicker">Status</span>
            <h2 className={`status-label status-label--${config.tone}`}>{label}</h2>
          </div>
        </div>
        <span className={`status-pill status-pill--${config.tone}`}>
          {isConnected ? "Online" : status === "connecting" ? "Aguardando" : "Offline"}
        </span>
      </div>

      <div className="card-body">
        <button
          className="btn btn-danger btn-full"
          type="button"
          onClick={onDisconnect}
          disabled={!isConnected}
        >
          <Power size={18} />
          Desconectar
        </button>
      </div>
    </section>
  );
}
