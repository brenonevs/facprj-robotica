export function MessageLog({ logs }) {
  if (logs.length === 0) {
    return <p className="empty-log">Nenhuma mensagem ainda.</p>;
  }

  return (
    <ol className="message-log">
      {logs.map((log) => (
        <li key={log.id} className={log.variant}>
          <time>{log.time}</time>
          <span>{log.message}</span>
        </li>
      ))}
    </ol>
  );
}
