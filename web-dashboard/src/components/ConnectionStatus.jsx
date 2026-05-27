import { Power } from "lucide-react";

export function ConnectionStatus({ icon: Icon, label, isConnected, onDisconnect }) {
  return (
    <section className="status-panel">
      <div className="status-copy">
        <div className={isConnected ? "status-icon connected" : "status-icon"}>
          <Icon size={22} />
        </div>
        <div>
          <span className="section-kicker">Status</span>
          <strong className={isConnected ? "connected-text" : "disconnected-text"}>{label}</strong>
        </div>
      </div>
      <button type="button" onClick={onDisconnect} disabled={!isConnected}>
        <Power size={18} />
        Desconectar
      </button>
    </section>
  );
}
