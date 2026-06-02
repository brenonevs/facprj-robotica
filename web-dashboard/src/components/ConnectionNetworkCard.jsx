import { Server, Terminal } from "lucide-react";
import { CAMERA_STREAM_PORT, WEBSOCKET_PORT } from "../services/websocket.js";

export function ConnectionNetworkCard({ ip, connected, arduinoSimulate }) {
  const trimmedIp = ip.trim();

  return (
    <section className="card card-network-tile">
      <div className="card-header card-header--compact">
        <div className="card-header-icon card-header-icon--network">
          <Server size={16} />
        </div>
        <div>
          <span className="card-kicker">Rede</span>
          <h2>Servidor Pi</h2>
        </div>
      </div>
      <div className="card-body card-body--network-tile">
        <ul className="network-tile-list">
          <li>
            <span>Comandos (WS)</span>
            <span className="network-tile-list-v">:{WEBSOCKET_PORT}</span>
          </li>
          <li>
            <span>Câmera (HTTP)</span>
            <span className="network-tile-list-v">:{CAMERA_STREAM_PORT}</span>
          </li>
        </ul>
        <div className="network-tile-host">
          <span className="network-tile-host-k">Host configurado</span>
          <code className="network-tile-host-v">{trimmedIp || "—"}</code>
        </div>
        <div className="network-tile-tip">
          <Terminal size={14} />
          <p>No Raspberry, use <code>hostname -I</code> para descobrir o IP na rede.</p>
        </div>
        <p className="card-hint network-tile-hint">
          {connected
            ? arduinoSimulate
              ? "Telemetria Arduino em modo mock."
              : "Telemetria Arduino pela serial real."
            : "Confira IP, Wi‑Fi e se o server.py está rodando."}
        </p>
      </div>
    </section>
  );
}
