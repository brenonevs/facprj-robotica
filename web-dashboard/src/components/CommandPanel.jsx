import { Bot, Gamepad2 } from "lucide-react";
import { ManualControls } from "./ManualControls.jsx";

export function CommandPanel({ disabled, onCommand, autonomousActive, manualControlAllowed }) {
  const manualBlocked = autonomousActive && !manualControlAllowed;
  const controlsDisabled = disabled || manualBlocked;

  return (
    <section className="card card-commands">
      <div className="card-header">
        <div className="card-header-icon card-header-icon--commands">
          <Gamepad2 size={18} />
        </div>
        <div>
          <span className="card-kicker">Controle</span>
          <h2>Comandos</h2>
        </div>
      </div>

      <div className="card-body">
        <ManualControls disabled={controlsDisabled} stopDisabled={disabled} onCommand={onCommand} />

        <div className="extra-controls">
          {!autonomousActive ? (
            <div className="extra-controls-group">
              <span className="card-kicker">Autonomia</span>
              <button
                className="btn btn-autonomous btn-full"
                type="button"
                disabled={disabled}
                onClick={() => onCommand("start_autonomous_mode")}
              >
                <Bot size={18} />
                Modo Autônomo
              </button>
            </div>
          ) : null}
        </div>
        {!disabled ? (
          manualBlocked ? (
            <p className="card-hint card-hint--center card-hint--muted">
              Controles manuais bloqueados durante navegação autônoma.
            </p>
          ) : autonomousActive && manualControlAllowed ? (
            <p className="card-hint card-hint--center">
              Controle manual disponível para paletização ou despaletização.
            </p>
          ) : (
            <p className="card-hint card-hint--center">
              Mantenha pressionado direção ou garfo para repetir o comando; ao soltar, envia parar.
            </p>
          )
        ) : (
          <p className="card-hint card-hint--center card-hint--muted">
            Conecte ao Raspberry Pi para habilitar os comandos.
          </p>
        )}
      </div>
    </section>
  );
}
