import { TelemetryLatencySection } from "./TelemetryLatencySection.jsx";
import { FSM_STATE_LABELS } from "../lib/telemetry.js";
import {
  Activity,
  AlertTriangle,
  ArrowUpDown,
  Battery,
  Gauge,
  Scale,
  ShieldAlert,
  Thermometer,
  Workflow,
} from "lucide-react";
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

function PoseStrip({ x, y, thetaDeg }) {
  return (
    <div className="telemetry-pose-bar">
      <div className="telemetry-pose-cell">
        <span className="telemetry-pose-k">Posição X</span>
        <span className="telemetry-pose-v">
          {x.toFixed(2)}
          <span className="telemetry-pose-u"> m</span>
        </span>
      </div>
      <div className="telemetry-pose-cell">
        <span className="telemetry-pose-k">Posição Y</span>
        <span className="telemetry-pose-v">
          {y.toFixed(2)}
          <span className="telemetry-pose-u"> m</span>
        </span>
      </div>
      <div className="telemetry-pose-cell">
        <span className="telemetry-pose-k">Orientação θ</span>
        <span className="telemetry-pose-v">
          {thetaDeg.toFixed(1)}
          <span className="telemetry-pose-u"> °</span>
        </span>
      </div>
    </div>
  );
}

function BatteryBlock({ percent, voltage }) {
  const safe = Math.min(100, Math.max(0, percent));
  const tone =
    safe < 22 ? "telemetry-battery-fill--low" : safe < 45 ? "telemetry-battery-fill--mid" : "telemetry-battery-fill--ok";
  return (
    <div className="telemetry-battery-block">
      <div className="telemetry-battery-head">
        <Battery size={18} />
        <span>Bateria</span>
        <span className="telemetry-battery-pct">{safe.toFixed(0)}%</span>
      </div>
      <div className="telemetry-battery-track">
        <div className={`telemetry-battery-fill ${tone}`} style={{ width: `${safe}%` }} />
      </div>
      <span className="telemetry-battery-volt">{voltage.toFixed(2)} V (estimado)</span>
    </div>
  );
}

function TempBar({ label, celsius }) {
  const ratio = Math.min(1, Math.max(0, (celsius - 28) / (75 - 28)));
  const tone =
    celsius >= 62 ? "telemetry-temp-fill--hot" : celsius >= 50 ? "telemetry-temp-fill--warm" : "telemetry-temp-fill--ok";
  return (
    <div className="telemetry-temp">
      <div className="telemetry-temp-label">
        <Thermometer size={14} />
        {label}
        <span>{celsius.toFixed(1)} °C</span>
      </div>
      <div className="telemetry-temp-track">
        <div className={`telemetry-temp-fill ${tone}`} style={{ width: `${ratio * 100}%` }} />
      </div>
    </div>
  );
}

export function TelemetryDashboard({
  telemetry,
  autonomy,
  connected,
  status,
  handshakeMs,
  firstResponseMs,
  lastRttMs,
}) {
  if (!connected) {
    return (
      <section className="card card-telemetry card-telemetry--idle">
        <div className="card-header">
          <div className="card-header-icon card-header-icon--telemetry">
            <Activity size={18} />
          </div>
          <div>
            <span className="card-kicker">Sensores</span>
            <h2>Telemetria</h2>
          </div>
        </div>
        <div className="telemetry-layout">
          <div className="telemetry-main telemetry-main--full">
            <div className="telemetry-idle-body">
              <p>Conecte ao Raspberry Pi para visualizar os dados dos sensores.</p>
            </div>
            <TelemetryLatencySection
              status={status}
              handshakeMs={handshakeMs}
              firstResponseMs={firstResponseMs}
              lastRttMs={lastRttMs}
            />
          </div>
        </div>
      </section>
    );
  }

  const autonomousMode = autonomy.enabled;
  const { position, alerts, errors } = telemetry;

  return (
    <section className="card card-telemetry">
      <div className="card-header card-header--spread">
        <div className="card-header">
          <div className="card-header-icon card-header-icon--telemetry">
            <Activity size={18} />
          </div>
          <div>
            <span className="card-kicker">Sensores</span>
            <h2>Telemetria</h2>
          </div>
        </div>
        <span className={`telemetry-mode-pill ${autonomousMode ? "telemetry-mode-pill--auto" : ""}`}>
          {autonomousMode ? "Modo autônomo" : "Modo manual"}
        </span>
      </div>

      <div className="telemetry-layout">
        <div className="telemetry-main telemetry-main--full">
          <BatteryBlock percent={telemetry.batteryPercent} voltage={telemetry.batteryVoltage} />

          <div className="telemetry-temps">
            <TempBar label="Motor esquerdo" celsius={telemetry.motorTempLeft} />
            <TempBar label="Motor direito" celsius={telemetry.motorTempRight} />
          </div>

          <div className="telemetry-metrics">
            <div className="telemetry-section">
              <h3 className="telemetry-section-title">Pose no plano</h3>
              <PoseStrip x={position.x} y={position.y} thetaDeg={position.thetaDeg} />
            </div>

            <div className="telemetry-section">
              <h3 className="telemetry-section-title">Movimento instantâneo</h3>
              <div className="telemetry-section-grid telemetry-section-grid--2">
                <Metric
                  label="Velocidade linear"
                  value={telemetry.linearSpeed.toFixed(2)}
                  unit=" m/s"
                  icon={Gauge}
                />
                <Metric
                  label="Velocidade angular"
                  value={telemetry.angularSpeed.toFixed(2)}
                  unit=" rad/s"
                  icon={Gauge}
                />
              </div>
            </div>

            <div className="telemetry-section telemetry-section--cargo">
              <h3 className="telemetry-section-title">Garfo e carga útil</h3>
              <div className="telemetry-section-grid telemetry-section-grid--2">
                <Metric label="Altura do garfo" value={telemetry.forkHeightPercent} unit=" %" icon={ArrowUpDown} />
                <Metric
                  label="Célula de carga"
                  value={telemetry.loadCellKg.toFixed(1)}
                  unit=" kg"
                  icon={Scale}
                />
              </div>
            </div>
          </div>

          {autonomousMode ? (
            <div className="telemetry-auto-strip">
              <div className="telemetry-auto-card">
                <div className="telemetry-auto-card-head">
                  <Workflow size={16} />
                  <span>Máquina de estados</span>
                </div>
                <p className="telemetry-fsm">
                  {FSM_STATE_LABELS[autonomy.fsmState] ?? autonomy.fsmState}
                </p>
              </div>
            </div>
          ) : null}

          <div className="telemetry-alerts-stack">
            {errors.length > 0 ? (
              <div className="telemetry-banner telemetry-banner--error">
                <ShieldAlert size={18} />
                <div>
                  <strong>Erros</strong>
                  <ul>
                    {errors.map((e, i) => (
                      <li key={i}>{e}</li>
                    ))}
                  </ul>
                </div>
              </div>
            ) : null}
            {alerts.length > 0 ? (
              <div className="telemetry-banner telemetry-banner--warn">
                <AlertTriangle size={18} />
                <div>
                  <strong>Alertas</strong>
                  <ul>
                    {alerts.map((a, i) => (
                      <li key={i}>{a}</li>
                    ))}
                  </ul>
                </div>
              </div>
            ) : null}
            {errors.length === 0 && alerts.length === 0 ? (
              <p className="telemetry-all-clear">Nenhum erro ou alerta ativo.</p>
            ) : null}
          </div>

          <TelemetryLatencySection
            status={status}
            handshakeMs={handshakeMs}
            firstResponseMs={firstResponseMs}
            lastRttMs={lastRttMs}
          />
        </div>
      </div>
    </section>
  );
}
