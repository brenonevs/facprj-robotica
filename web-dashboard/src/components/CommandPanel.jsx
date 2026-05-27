import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Square } from "lucide-react";

const commands = [
  { action: "move_forward", label: "Frente", icon: ArrowUp },
  { action: "turn_left", label: "Esquerda", icon: ArrowLeft },
  { action: "stop", label: "Parar", icon: Square },
  { action: "turn_right", label: "Direita", icon: ArrowRight },
  { action: "move_backward", label: "Trás", icon: ArrowDown },
];

export function CommandPanel({ disabled, onCommand }) {
  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <span className="section-kicker">Teste</span>
          <h2>Comandos</h2>
        </div>
      </div>

      <div className="command-grid">
        {commands.map(({ action, label, icon: Icon }) => (
          <button key={action} type="button" disabled={disabled} onClick={() => onCommand(action)}>
            <Icon size={20} />
            {label}
          </button>
        ))}
      </div>
    </section>
  );
}
