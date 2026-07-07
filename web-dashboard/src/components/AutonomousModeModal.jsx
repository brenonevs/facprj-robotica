import { useEffect, useState } from "react";
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
import { ManualControls } from "./ManualControls.jsx";
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

function parseTagId(value) {
  const trimmed = String(value).trim();
  if (!trimmed) {
    return null;
  }
  const parsed = Number.parseInt(trimmed, 10);
  if (!Number.isInteger(parsed) || parsed < 0) {
    return null;
  }
  return parsed;
}

function parseScanSetting(value, { min, max }) {
  const trimmed = String(value).trim();
  if (!trimmed) {
    return null;
  }
  const parsed = Number.parseFloat(trimmed);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
    return null;
  }
  return parsed;
}

const SCAN_DURATION_LIMITS = { min: 0.1, max: 3 };
const SCAN_INTERVAL_LIMITS = { min: 0, max: 5 };

function ScanSettingsFields({ idPrefix, duration, interval, disabled, onDurationChange, onIntervalChange }) {
  return (
    <div className="autonomy-scan-settings autonomy-modal-actions-span">
      <span className="card-kicker">Busca da tag</span>
      <div className="autonomy-scan-settings-grid">
        <label className="autonomy-tag-field" htmlFor={`${idPrefix}-scan-duration`}>
          <span className="autonomy-tag-field-label">Duração de cada giro (s)</span>
          <input
            id={`${idPrefix}-scan-duration`}
            className="field-input"
            type="number"
            min={SCAN_DURATION_LIMITS.min}
            max={SCAN_DURATION_LIMITS.max}
            step="0.05"
            inputMode="decimal"
            placeholder="0.6"
            value={duration}
            disabled={disabled}
            onChange={(event) => onDurationChange(event.target.value)}
          />
        </label>
        <label className="autonomy-tag-field" htmlFor={`${idPrefix}-scan-interval`}>
          <span className="autonomy-tag-field-label">Pausa entre giros (s)</span>
          <input
            id={`${idPrefix}-scan-interval`}
            className="field-input"
            type="number"
            min={SCAN_INTERVAL_LIMITS.min}
            max={SCAN_INTERVAL_LIMITS.max}
            step="0.05"
            inputMode="decimal"
            placeholder="0.45"
            value={interval}
            disabled={disabled}
            onChange={(event) => onIntervalChange(event.target.value)}
          />
        </label>
      </div>
    </div>
  );
}

export function AutonomousModeModal({ autonomy, disabled, onCommand, ip, connected }) {
  const {
    enabled,
    fsmState,
    targetTagId,
    firstTagId,
    targetDistanceM,
    currentDistanceM,
    manualControlAllowed,
    cycleStep,
    scanRotateDurationS,
    scanRotateIntervalS,
    alert,
  } = autonomy;
  const [palletizeTagId, setPalletizeTagId] = useState("");
  const [depalletizeTagId, setDepalletizeTagId] = useState("");
  const [scanDuration, setScanDuration] = useState("0.6");
  const [scanInterval, setScanInterval] = useState("0.45");

  const showStart = fsmState === "IDLE";
  const showPalletizeDone = fsmState === "MANUAL_PALLETIZE";
  const showDepalletizeDone = fsmState === "MANUAL_DEPALLETIZE";

  useEffect(() => {
    if (!enabled || (!showStart && !showPalletizeDone)) {
      return;
    }
    setScanDuration(String(scanRotateDurationS));
    setScanInterval(String(scanRotateIntervalS));
  }, [enabled, showStart, showPalletizeDone, scanRotateDurationS, scanRotateIntervalS]);

  if (!enabled) {
    return null;
  }

  const stateLabel = FSM_STATE_LABELS[fsmState] ?? fsmState;
  const parsedPalletizeTagId = parseTagId(palletizeTagId);
  const parsedDepalletizeTagId = parseTagId(depalletizeTagId);
  const parsedScanDuration = parseScanSetting(scanDuration, SCAN_DURATION_LIMITS);
  const parsedScanInterval = parseScanSetting(scanInterval, SCAN_INTERVAL_LIMITS);
  const scanSettingsValid = parsedScanDuration != null && parsedScanInterval != null;
  const scanOptions = {
    scanRotateDurationS: parsedScanDuration,
    scanRotateIntervalS: parsedScanInterval,
  };

  return (
    <div className="autonomy-modal-backdrop" role="presentation">
      <section
        className={`autonomy-modal ${manualControlAllowed ? "autonomy-modal--manual" : ""}`}
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
              {firstTagId != null ? (
                <div className="autonomy-metric">
                  <span className="autonomy-metric-k">Tag paletização</span>
                  <span className="autonomy-metric-v">#{firstTagId}</span>
                </div>
              ) : null}
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

            {manualControlAllowed ? (
              <ManualControls
                disabled={disabled}
                onCommand={onCommand}
                className="autonomy-modal-controls"
              />
            ) : null}

            {!manualControlAllowed && fsmState !== "IDLE" ? (
              <p className="autonomy-modal-hint">Controles manuais bloqueados durante navegação autônoma.</p>
            ) : null}
          </div>
        </div>

        <div className="autonomy-modal-actions">
          {showStart ? (
            <>
              <ScanSettingsFields
                idPrefix="palletize"
                duration={scanDuration}
                interval={scanInterval}
                disabled={disabled}
                onDurationChange={setScanDuration}
                onIntervalChange={setScanInterval}
              />
              <label className="autonomy-tag-field autonomy-modal-actions-span" htmlFor="palletize-tag-id">
                <span className="autonomy-tag-field-label">ID da AprilTag para paletização</span>
                <input
                  id="palletize-tag-id"
                  className="field-input"
                  type="number"
                  min="0"
                  step="1"
                  inputMode="numeric"
                  placeholder="Ex.: 0"
                  value={palletizeTagId}
                  disabled={disabled}
                  onChange={(event) => setPalletizeTagId(event.target.value)}
                />
              </label>
              <button
                className="btn btn-autonomous btn-full autonomy-modal-actions-span"
                type="button"
                disabled={disabled || parsedPalletizeTagId == null || !scanSettingsValid}
                onClick={() =>
                  onCommand("start_autonomous_cycle", { tagId: parsedPalletizeTagId, ...scanOptions })
                }
              >
                <Play size={18} />
                Iniciar
              </button>
            </>
          ) : null}
          {showPalletizeDone ? (
            <>
              <ScanSettingsFields
                idPrefix="depalletize"
                duration={scanDuration}
                interval={scanInterval}
                disabled={disabled}
                onDurationChange={setScanDuration}
                onIntervalChange={setScanInterval}
              />
              <label className="autonomy-tag-field autonomy-modal-actions-span" htmlFor="depalletize-tag-id">
                <span className="autonomy-tag-field-label">ID da AprilTag para despaletização</span>
                <input
                  id="depalletize-tag-id"
                  className="field-input"
                  type="number"
                  min="0"
                  step="1"
                  inputMode="numeric"
                  placeholder="Ex.: 1"
                  value={depalletizeTagId}
                  disabled={disabled}
                  onChange={(event) => setDepalletizeTagId(event.target.value)}
                />
              </label>
              <button
                className="btn btn-autonomous btn-full autonomy-modal-actions-span"
                type="button"
                disabled={disabled || parsedDepalletizeTagId == null || !scanSettingsValid}
                onClick={() =>
                  onCommand("confirm_palletize_done", { tagId: parsedDepalletizeTagId, ...scanOptions })
                }
              >
                <CheckCircle2 size={18} />
                Paletização concluída
              </button>
            </>
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
