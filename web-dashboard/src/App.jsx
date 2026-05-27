import { useCallback, useMemo, useRef, useState } from "react";
import { Cable, CircleStop, Plug, Send, Trash2, WifiOff } from "lucide-react";
import { CommandPanel } from "./components/CommandPanel.jsx";
import { ConnectionForm } from "./components/ConnectionForm.jsx";
import { ConnectionStatus } from "./components/ConnectionStatus.jsx";
import { MessageLog } from "./components/MessageLog.jsx";
import { createCommandMessage, createWebSocketUrl } from "./services/websocket.js";

const savedIp = localStorage.getItem("raspberry_ip") ?? "";

export function App() {
  const socketRef = useRef(null);
  const [ip, setIp] = useState(savedIp);
  const [status, setStatus] = useState("disconnected");
  const [logs, setLogs] = useState([]);

  const isConnected = status === "connected";
  const statusLabel = useMemo(() => {
    const labels = {
      disconnected: "Desconectado",
      connecting: "Conectando",
      connected: "Conectado",
    };
    return labels[status] ?? "Desconectado";
  }, [status]);

  const addLog = useCallback((message, variant = "neutral") => {
    setLogs((currentLogs) => [
      {
        id: crypto.randomUUID(),
        time: new Date().toLocaleTimeString(),
        message,
        variant,
      },
      ...currentLogs.slice(0, 59),
    ]);
  }, []);

  const disconnect = useCallback(() => {
    socketRef.current?.close();
    socketRef.current = null;
  }, []);

  const connect = useCallback(() => {
    const trimmedIp = ip.trim();
    if (!trimmedIp) {
      addLog("Digite o IP do Raspberry Pi.", "error");
      return;
    }

    disconnect();
    localStorage.setItem("raspberry_ip", trimmedIp);

    const url = createWebSocketUrl(trimmedIp);
    addLog(`Tentando conectar em ${url}...`);
    setStatus("connecting");

    const socket = new WebSocket(url);
    socketRef.current = socket;

    socket.addEventListener("open", () => {
      setStatus("connected");
      addLog("Conexão aberta com o Raspberry Pi.", "success");
    });

    socket.addEventListener("message", (event) => {
      addLog(`Recebido: ${event.data}`, "incoming");
    });

    socket.addEventListener("error", () => {
      addLog("Erro na conexão. Confira IP, rede e servidor WebSocket.", "error");
    });

    socket.addEventListener("close", () => {
      setStatus("disconnected");
      addLog("Conexão encerrada.");
      if (socketRef.current === socket) {
        socketRef.current = null;
      }
    });
  }, [addLog, disconnect, ip]);

  const sendCommand = useCallback(
    (action) => {
      const socket = socketRef.current;
      if (!socket || socket.readyState !== WebSocket.OPEN) {
        addLog("Não há conexão aberta para enviar comando.", "error");
        return;
      }

      const message = createCommandMessage(action);
      socket.send(JSON.stringify(message));
      addLog(`Enviado: ${JSON.stringify(message)}`, "outgoing");
    },
    [addLog],
  );

  return (
    <main className="app-shell">
      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">Empilhadeira Robótica</p>
          <h1>Conectar ao Raspberry Pi</h1>
          <p>
            Informe o IP do Raspberry na rede para abrir o canal WebSocket e testar
            a comunicação inicial do projeto.
          </p>
        </div>

        <ConnectionForm
          ip={ip}
          onIpChange={setIp}
          onConnect={connect}
          isConnecting={status === "connecting"}
        />
      </section>

      <section className="workspace">
        <ConnectionStatus
          icon={isConnected ? Plug : WifiOff}
          label={statusLabel}
          isConnected={isConnected}
          onDisconnect={disconnect}
        />

        <CommandPanel disabled={!isConnected} onCommand={sendCommand} />

        <section className="panel">
          <div className="panel-header">
            <div>
              <span className="section-kicker">Console</span>
              <h2>Mensagens</h2>
            </div>
            <button className="icon-button" type="button" onClick={() => setLogs([])} aria-label="Limpar mensagens">
              <Trash2 size={18} />
            </button>
          </div>
          <MessageLog logs={logs} />
        </section>
      </section>

      <footer className="footer-strip">
        <span>
          <Cable size={16} />
          WebSocket em <strong>porta 8765</strong>
        </span>
        <span>
          <Send size={16} />
          Comandos em JSON
        </span>
        <span>
          <CircleStop size={16} />
          Resposta esperada: ack
        </span>
      </footer>
    </main>
  );
}
