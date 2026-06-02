import { FlaskConical } from "lucide-react";

export function HeaderArduinoMockToggle({ arduinoSimulate, isConnected, onToggle }) {
  return (
    <div className="header-arduino-mock">
      <div className="header-arduino-mock-icon">
        <FlaskConical size={18} />
      </div>
      <div className="header-arduino-mock-text">
        <span className="header-arduino-mock-kicker">Telemetria</span>
        <span className={`header-arduino-mock-label ${arduinoSimulate ? "header-arduino-mock-label--on" : ""}`}>
          {arduinoSimulate ? "Mock ativo" : "Arduino real"}
        </span>
      </div>
      <button
        className={`btn btn-arduino-mock ${arduinoSimulate ? "btn-arduino-mock--on" : ""}`}
        type="button"
        onClick={onToggle}
        disabled={!isConnected}
        aria-pressed={arduinoSimulate}
        title={
          arduinoSimulate
            ? "Telemetria mock — clique para usar Arduino real"
            : "Arduino real — clique para ativar mock"
        }
      >
        {arduinoSimulate ? "Desativar mock" : "Ativar mock"}
      </button>
    </div>
  );
}
