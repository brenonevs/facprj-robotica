import { Link, LoaderCircle, Wifi } from "lucide-react";

export function ConnectionForm({ ip, onIpChange, onConnect, isConnecting }) {
  return (
    <form
      className="card card-network-tile card-connection-target"
      onSubmit={(event) => {
        event.preventDefault();
        onConnect();
      }}
    >
      <div className="card-header card-header--compact">
        <div className="card-header-icon card-header-icon--accent">
          <Wifi size={16} />
        </div>
        <div>
          <span className="card-kicker">Rede</span>
          <h2>Endereço IP</h2>
        </div>
      </div>

      <div className="card-body card-body--network-tile">
        <label className="field-label" htmlFor="raspberry-ip">
          Endereço IP do Raspberry Pi
        </label>
        <input
          id="raspberry-ip"
          className="field-input"
          value={ip}
          onChange={(event) => onIpChange(event.target.value)}
          placeholder="192.168.0.42"
          autoComplete="off"
          spellCheck={false}
        />
        <button className="btn btn-primary btn-full" type="submit" disabled={isConnecting}>
          {isConnecting ? <LoaderCircle className="spin" size={18} /> : <Link size={18} />}
          {isConnecting ? "Conectando" : "Conectar"}
        </button>
        <p className="card-hint network-tile-hint">
          O IP é salvo neste navegador para a próxima sessão.
        </p>
      </div>
    </form>
  );
}
