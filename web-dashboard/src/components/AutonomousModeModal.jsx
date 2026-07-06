import {
  Bot,
  CheckCircle2,
  Play,
  Crosshair,
  ScanLine,
  Truck,
  PackageOpen,
  Package,
  XCircle,
} from "lucide-react";
import { CameraFeed } from "./CameraFeed.jsx";
import { FSM_STATE_LABELS } from "../lib/telemetry.js";

const STEPS = [
  { key: 1, label: "Buscar tag 1", icon: ScanLine },
  { key: 2, label: "Alinhar tag 1", icon: Crosshair },
  { key: 3, label: "Chegar", icon: Truck },
  { key: 4, label: "Paletizar", icon: Package },
  { key: 5, label: "Buscar tag 2", icon: ScanLine },
  { key: 6, label: "Alinhar tag 2", icon: Crosshair },
  { key: 7, label: "Chegar", icon: Truck },
  { key: 8, label: "Despaletizar", icon: PackageOpen },
];

function formatDistance(value) {
  if (value == null || Number.isNaN(value)) {
    return "—";
  }
  return `${Number(value).toFixed(2)} m`;
}

export function AutonomousModeModal({ autonomy, disabled, onCommand, ip, connected }) {
  const { enabled, fsmState, targetTagId, targetDistanceM, currentDistanceM, manualControlAllowed, cycleStep, alert } =
    autonomy;

  if (!enabled) {
    return null;
  }

  const stateLabel = FSM_STATE_LABELS[fsmState] ?? fsmState;
  const showStart = fsmState === "IDLE";
  const showPalletizeDone = fsmState === "MANUAL_PALLETIZE";
  const showDepalletizeDone = fsmState === "MANUAL_DEPALLETIZE";

  return (
    <div className="autonomy-modal-backdrop" role="presentation">
      <section
        className="autonomy-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="autonomy-modal-title"
      >
        <header className="autonomy-modal-header">
          <div className="autonomy-modal-brand">
            <div className="autonomy-modal-icon">
              <Bot size={22} strokeWidth={2.2} />
            </div>
            <div>
              <span className="card-kicker">Autonomia</span>
              <h2 id="autonomy-modal-title">Modo Autônomo</h2>
            </div>
          </div>
          <span className="autonomy-modal-state">{stateLabel}</span>
        </header>

        <div className="autonomy-modal-body">
          <div className="autonomy-modal-camera">
            <CameraFeed ip={ip} connected={connected} autonomousMode />
          </div>

          <div className="autonomy-modal-panel">
            <div className="autonomy-stepper">
              {STEPS.map((step) => {
                const Icon = step.icon;
                const isActive = cycleStep === step.key;
                const isDone = cycleStep > step.key;
                return (
                  <div
                    key={step.key}
                    className={`autonomy-step ${isActive ? "autonomy-step--active" : ""} ${isDone ? "autonomy-step--done" : ""}`}
                  >
                    <div className="autonomy-step-marker">
                      <Icon size={14} strokeWidth={2.2} />
                    </div>
                    <span className="autonomy-step-label">{step.label}</span>
                  </div>
                );
              })}
            </div>

            <div className="autonomy-modal-metrics">
              <div className="autonomy-metric">
                <span className="autonomy-metric-k">Tag alvo</span>
                <span className="autonomy-metric-v">{targetTagId != null ? `#${targetTagId}` : "—"}</span>
              </div>
              <div className="autonomy-metric">
                <span className="autonomy-metric-k">Distância atual</span>
                <span className="autonomy-metric-v">{formatDistance(currentDistanceM)}</span>
              </div>
              <div className="autonomy-metric">
                <span className="autonomy-metric-k">Distância alvo</span>
                <span className="autonomy-metric-v">{formatDistance(targetDistanceM)}</span>
              </div>
            </div>

            {alert ? <p className="autonomy-modal-alert">{alert}</p> : null}

            {!manualControlAllowed && fsmState !== "IDLE" ? (
              <p className="autonomy-modal-hint">Controles manuais bloqueados durante navegação autônoma.</p>
            ) : null}

            {manualControlAllowed ? (
              <p className="autonomy-modal-hint autonomy-modal-hint--ok">
                Controles manuais disponíveis para esta etapa.
              </p>
            ) : null}
          </div>
        </div>

        <div className="autonomy-modal-actions">
          {showStart ? (
            <button
              className="btn btn-autonomous btn-full"
              type="button"
              disabled={disabled}
              onClick={() => onCommand("start_autonomous_cycle")}
            >
              <Play size={18} />
              Iniciar
            </button>
          ) : null}
          {showPalletizeDone ? (
            <button
              className="btn btn-autonomous btn-full"
              type="button"
              disabled={disabled}
              onClick={() => onCommand("confirm_palletize_done")}
            >
              <CheckCircle2 size={18} />
              Paletização concluída
            </button>
          ) : null}
          {showDepalletizeDone ? (
            <button
              className="btn btn-autonomous btn-full"
              type="button"
              disabled={disabled}
              onClick={() => onCommand("confirm_depalletize_done")}
            >
              <CheckCircle2 size={18} />
              Despaletização concluída
            </button>
          ) : null}
          <button
            className="btn btn-danger btn-full"
            type="button"
            disabled={disabled}
            onClick={() => onCommand("stop_autonomous_mode")}
          >
            <XCircle size={18} />
            Parar modo autônomo
          </button>
        </div>
      </section>
    </div>
  );
}
