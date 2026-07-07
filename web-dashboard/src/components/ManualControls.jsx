import { useCallback, useEffect, useRef } from "react";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ChevronsDown,
  ChevronsUp,
  Square,
} from "lucide-react";

const HOLD_REPEAT_MS = 180;

const HOLD_ACTIONS = new Set([
  "move_forward",
  "turn_left",
  "turn_right",
  "move_backward",
  "fork_up",
  "fork_down",
]);

const commands = {
  move_forward: { label: "Frente", icon: ArrowUp },
  turn_left: { label: "Esquerda", icon: ArrowLeft },
  stop: { label: "Parar", icon: Square },
  turn_right: { label: "Direita", icon: ArrowRight },
  move_backward: { label: "Trás", icon: ArrowDown },
};

export function ManualControls({ disabled, stopDisabled = disabled, onCommand, className = "" }) {
  const holdIntervalRef = useRef(null);
  const heldActionRef = useRef(null);

  const clearHold = useCallback(() => {
    if (holdIntervalRef.current != null) {
      clearInterval(holdIntervalRef.current);
      holdIntervalRef.current = null;
    }
    const prev = heldActionRef.current;
    if (prev == null) return;
    heldActionRef.current = null;
    if (HOLD_ACTIONS.has(prev)) {
      onCommand("stop");
    }
  }, [onCommand]);

  useEffect(() => {
    if (disabled) {
      clearHold();
    }
  }, [disabled, clearHold]);

  useEffect(() => {
    const onHidden = () => {
      if (document.visibilityState === "hidden") {
        clearHold();
      }
    };
    document.addEventListener("visibilitychange", onHidden);
    return () => document.removeEventListener("visibilitychange", onHidden);
  }, [clearHold]);

  const startHold = useCallback(
    (action) => (event) => {
      if (disabled || !HOLD_ACTIONS.has(action)) return;
      if (event.pointerType === "mouse" && event.button !== 0) return;
      if (heldActionRef.current != null) return;
      event.preventDefault();
      heldActionRef.current = action;
      onCommand(action);
      holdIntervalRef.current = window.setInterval(() => onCommand(action), HOLD_REPEAT_MS);
      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        //
      }
    },
    [disabled, onCommand],
  );

  const endHold = useCallback(
    (event) => {
      if (heldActionRef.current == null) return;
      try {
        event.currentTarget.releasePointerCapture(event.pointerId);
      } catch {
        //
      }
      clearHold();
    },
    [clearHold],
  );

  return (
    <div className={`manual-controls ${className}`.trim()}>
      <div className={`dpad ${disabled ? "dpad--disabled" : ""}`}>
        <button
          className="dpad-btn dpad-btn--up"
          type="button"
          disabled={disabled}
          onPointerDown={startHold("move_forward")}
          onPointerUp={endHold}
          onPointerCancel={endHold}
          onLostPointerCapture={clearHold}
        >
          <ArrowUp size={22} strokeWidth={2.5} />
          <span>{commands.move_forward.label}</span>
        </button>

        <button
          className="dpad-btn dpad-btn--left"
          type="button"
          disabled={disabled}
          onPointerDown={startHold("turn_left")}
          onPointerUp={endHold}
          onPointerCancel={endHold}
          onLostPointerCapture={clearHold}
        >
          <ArrowLeft size={22} strokeWidth={2.5} />
          <span>{commands.turn_left.label}</span>
        </button>

        <button
          className="dpad-btn dpad-btn--center"
          type="button"
          disabled={stopDisabled}
          onClick={() => onCommand("stop")}
        >
          <Square size={20} fill="currentColor" strokeWidth={0} />
          <span>{commands.stop.label}</span>
        </button>

        <button
          className="dpad-btn dpad-btn--right"
          type="button"
          disabled={disabled}
          onPointerDown={startHold("turn_right")}
          onPointerUp={endHold}
          onPointerCancel={endHold}
          onLostPointerCapture={clearHold}
        >
          <ArrowRight size={22} strokeWidth={2.5} />
          <span>{commands.turn_right.label}</span>
        </button>

        <button
          className="dpad-btn dpad-btn--down"
          type="button"
          disabled={disabled}
          onPointerDown={startHold("move_backward")}
          onPointerUp={endHold}
          onPointerCancel={endHold}
          onLostPointerCapture={clearHold}
        >
          <ArrowDown size={22} strokeWidth={2.5} />
          <span>{commands.move_backward.label}</span>
        </button>
      </div>

      <div className="extra-controls">
        <div className="extra-controls-group">
          <span className="card-kicker">Garfo</span>
          <div className="extra-controls-grid">
            <button
              className="btn btn-secondary"
              type="button"
              disabled={disabled}
              onPointerDown={startHold("fork_up")}
              onPointerUp={endHold}
              onPointerCancel={endHold}
              onLostPointerCapture={clearHold}
            >
              <ChevronsUp size={18} />
              Subir garfo
            </button>
            <button
              className="btn btn-secondary"
              type="button"
              disabled={disabled}
              onPointerDown={startHold("fork_down")}
              onPointerUp={endHold}
              onPointerCancel={endHold}
              onLostPointerCapture={clearHold}
            >
              <ChevronsDown size={18} />
              Descer garfo
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
