import { FlaskConical, LoaderCircle, Plug, Power, WifiOff } from "lucide-react";

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

export function HeaderConnectionStatus({
  label,
  status,
  isConnected,
  arduinoSimulate,
  onDisconnect,
  onToggleArduinoSimulate,
}) {
  const config = statusConfig[status] ?? statusConfig.disconnected;
  const Icon = config.icon;

  return (
    <div className={`header-connection header-connection--${config.tone}`}>
      <div className={`header-connection-badge header-connection-badge--${config.tone}`}>
        <Icon size={18} className={status === "connecting" ? "spin" : undefined} />
      </div>
      <div className="header-connection-text">
        <span className="header-connection-kicker">Status da conexão</span>
        <span className={`header-connection-label header-connection-label--${config.tone}`}>
          {label}
        </span>
      </div>
      <button
        className={`btn btn-arduino-mock ${arduinoSimulate ? "btn-arduino-mock--on" : ""}`}
        type="button"
        onClick={onToggleArduinoSimulate}
        disabled={!isConnected}
        aria-pressed={arduinoSimulate}
        title={
          arduinoSimulate
            ? "Telemetria mock ativa — clique para usar Arduino real"
            : "Arduino real — clique para ativar telemetria mock"
        }
      >
        <FlaskConical size={16} />
        {arduinoSimulate ? "Mock ativo" : "Mock off"}
      </button>
      <button
        className="btn btn-danger btn-header-disconnect"
        type="button"
        onClick={onDisconnect}
        disabled={!isConnected}
      >
        <Power size={16} />
        Desconectar
      </button>
    </div>
  );
}
