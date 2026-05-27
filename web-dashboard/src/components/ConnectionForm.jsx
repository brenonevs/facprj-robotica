import { Link, LoaderCircle } from "lucide-react";

export function ConnectionForm({ ip, onIpChange, onConnect, isConnecting }) {
  return (
    <form
      className="connection-card"
      onSubmit={(event) => {
        event.preventDefault();
        onConnect();
      }}
    >
      <label htmlFor="raspberry-ip">IP do Raspberry Pi</label>
      <div className="connection-row">
        <input
          id="raspberry-ip"
          value={ip}
          onChange={(event) => onIpChange(event.target.value)}
          placeholder="Ex: 192.168.0.42"
          autoComplete="off"
        />
        <button type="submit" disabled={isConnecting}>
          {isConnecting ? <LoaderCircle className="spin" size={18} /> : <Link size={18} />}
          {isConnecting ? "Conectando" : "Conectar"}
        </button>
      </div>
      <p>O servidor precisa estar rodando no Raspberry antes da conexão.</p>
    </form>
  );
}
