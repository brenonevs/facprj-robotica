import { Inbox } from "lucide-react";

const variantLabels = {
  incoming: "RX",
  outgoing: "TX",
  success: "OK",
  error: "ERR",
  neutral: "LOG",
};

export function MessageLog({ logs }) {
  if (logs.length === 0) {
    return (
      <div className="console-empty">
        <Inbox size={28} strokeWidth={1.5} />
        <p>Nenhuma mensagem ainda.</p>
        <span>As trocas com o Raspberry Pi aparecerão aqui.</span>
      </div>
    );
  }

  return (
    <ol className="message-log">
      {logs.map((log) => (
        <li key={log.id} className={`log-entry log-entry--${log.variant}`}>
          <div className="log-meta">
            <time>{log.time}</time>
            <span className="log-tag">{variantLabels[log.variant] ?? "LOG"}</span>
          </div>
          <span className="log-message">{log.message}</span>
        </li>
      ))}
    </ol>
  );
}
