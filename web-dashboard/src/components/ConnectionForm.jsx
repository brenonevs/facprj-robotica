import { Link, LoaderCircle, Wifi } from "lucide-react";

export function ConnectionForm({ ip, onIpChange, onConnect, isConnecting }) {
  return (
    <form
      className="card card-connection"
      onSubmit={(event) => {
        event.preventDefault();
        onConnect();
      }}
    >
      <div className="card-header">
        <div className="card-header-icon card-header-icon--accent">
          <Wifi size={18} />
        </div>
        <div>
          <span className="card-kicker">Rede</span>
          <h2>Conexão</h2>
        </div>
      </div>

      <div className="card-body">
        <label className="field-label" htmlFor="raspberry-ip">
          Endereço IP do Raspberry Pi
        </label>
        <div className="field-row">
          <input
            id="raspberry-ip"
            className="field-input"
            value={ip}
            onChange={(event) => onIpChange(event.target.value)}
            placeholder="192.168.0.42"
            autoComplete="off"
            spellCheck={false}
          />
          <button className="btn btn-primary" type="submit" disabled={isConnecting}>
            {isConnecting ? <LoaderCircle className="spin" size={18} /> : <Link size={18} />}
            {isConnecting ? "Conectando" : "Conectar"}
          </button>
        </div>
        <p className="card-hint">WebSocket no Raspberry (porta 8765) precisa estar ativo.</p>
      </div>
    </form>
  );
}
