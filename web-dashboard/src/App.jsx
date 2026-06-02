import { useCallback, useMemo, useRef, useState } from "react";
import { Activity, Bot, LayoutDashboard, Trash2 } from "lucide-react";
import { CommandPanel } from "./components/CommandPanel.jsx";
import { ConnectionForm } from "./components/ConnectionForm.jsx";
import { ConnectionMetrics } from "./components/ConnectionMetrics.jsx";
import { ConnectionStatus } from "./components/ConnectionStatus.jsx";
import { MessageLog } from "./components/MessageLog.jsx";
import { TelemetryDashboard } from "./components/TelemetryDashboard.jsx";
import { OFFLINE_TELEMETRY, telemetryFromWebSocketMessage } from "./lib/telemetry.js";
import { createCommandMessage, createWebSocketUrl } from "./services/websocket.js";

const savedIp = localStorage.getItem("raspberry_ip") ?? "";

export function App() {
  const socketRef = useRef(null);
  const connectT0Ref = useRef(null);
  const openAtRef = useRef(null);
  const firstMsgRecordedRef = useRef(false);
  const pendingRttRef = useRef(null);
  const lastVisionLogRef = useRef("");

  const [ip, setIp] = useState(savedIp);
  const [status, setStatus] = useState("disconnected");
  const [logs, setLogs] = useState([]);
  const [autonomousMode, setAutonomousMode] = useState(false);
  const [activeTab, setActiveTab] = useState("operation");
  const [handshakeMs, setHandshakeMs] = useState(null);
  const [firstResponseMs, setFirstResponseMs] = useState(null);
  const [lastRttMs, setLastRttMs] = useState(null);
  const [telemetry, setTelemetry] = useState(OFFLINE_TELEMETRY);

  const isConnected = status === "connected";
  const statusLabel = useMemo(() => {
    const labels = {
      disconnected: "Desconectado",
      connecting: "Conectando",
      connected: "Conectado",
    };
    return labels[status] ?? "Desconectado";
  }, [status]);

  const resetLatency = useCallback(() => {
    connectT0Ref.current = null;
    openAtRef.current = null;
    firstMsgRecordedRef.current = false;
    pendingRttRef.current = null;
    setHandshakeMs(null);
    setFirstResponseMs(null);
    setLastRttMs(null);
  }, []);

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
    setAutonomousMode(false);
    setTelemetry(OFFLINE_TELEMETRY);
    resetLatency();
    socketRef.current?.close();
    socketRef.current = null;
  }, [resetLatency]);

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
    resetLatency();
    connectT0Ref.current = performance.now();

    const socket = new WebSocket(url);
    socketRef.current = socket;

    socket.addEventListener("open", () => {
      const t = performance.now();
      openAtRef.current = t;
      if (connectT0Ref.current != null) {
        setHandshakeMs(Math.round(t - connectT0Ref.current));
      }
      setStatus("connected");
      addLog("Conexão aberta com o Raspberry Pi.", "success");
    });

    socket.addEventListener("message", (event) => {
      const t = performance.now();
      if (openAtRef.current != null && !firstMsgRecordedRef.current) {
        firstMsgRecordedRef.current = true;
        setFirstResponseMs(Math.round(t - openAtRef.current));
      }
      if (pendingRttRef.current != null) {
        setLastRttMs(Math.round(t - pendingRttRef.current));
        pendingRttRef.current = null;
      }
      try {
        const parsed = JSON.parse(event.data);
        if (parsed.type === "telemetry") {
          setTelemetry(telemetryFromWebSocketMessage(parsed));
          return;
        }
        if (parsed.type === "vision") {
          const tags = Array.isArray(parsed.tags) ? parsed.tags : [];
          const primary = tags[0];
          setTelemetry((current) => ({
            ...current,
            aprilTagDetected: tags.length > 0,
            aprilTagId: primary ? Number(primary.id) : null,
            aprilTagDistanceM: primary ? Number(primary.distance_m) : null,
          }));
          const visionKey = JSON.stringify(tags);
          if (visionKey !== lastVisionLogRef.current) {
            lastVisionLogRef.current = visionKey;
            if (tags.length > 0) {
              const summary = tags
                .map((tag) => `ID ${tag.id} @ ${Number(tag.distance_m).toFixed(2)} m`)
                .join(", ");
              addLog(`[Visão] ${tags.length} AprilTag(s): ${summary}`, "success");
            } else {
              addLog("[Visão] Nenhuma AprilTag no frame", "neutral");
            }
          }
          return;
        }
      } catch {
        /* não é JSON de telemetria */
      }
      addLog(`Recebido: ${event.data}`, "incoming");
    });

    socket.addEventListener("error", () => {
      addLog("Erro na conexão. Confira IP, rede e servidor WebSocket.", "error");
    });

    socket.addEventListener("close", () => {
      setStatus("disconnected");
      setAutonomousMode(false);
      setTelemetry(OFFLINE_TELEMETRY);
      resetLatency();
      addLog("Conexão encerrada.");
      if (socketRef.current === socket) {
        socketRef.current = null;
      }
    });
  }, [addLog, disconnect, ip, resetLatency]);

  const sendCommand = useCallback(
    (action) => {
      const socket = socketRef.current;
      if (!socket || socket.readyState !== WebSocket.OPEN) {
        addLog("Não há conexão aberta para enviar comando.", "error");
        return;
      }

      const message = createCommandMessage(action);
      pendingRttRef.current = performance.now();
      socket.send(JSON.stringify(message));
      addLog(`Enviado: ${JSON.stringify(message)}`, "outgoing");
      if (action === "start_autonomous_mode") {
        setAutonomousMode(true);
      }
      if (action === "stop_autonomous_mode") {
        setAutonomousMode(false);
      }
    },
    [addLog],
  );

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <div className="brand">
          <div className="brand-icon">
            <Bot size={22} strokeWidth={2.2} />
          </div>
          <div>
            <p className="brand-kicker">Faculdade · Robótica</p>
            <h1>Empilhadeira Robótica</h1>
          </div>
        </div>
        <p className="header-subtitle">
          Painel de controle remoto via WebSocket para o Raspberry Pi
        </p>
      </header>

      <nav className="dashboard-tabs" role="tablist" aria-label="Seções do painel">
        <button
          type="button"
          role="tab"
          className={`dashboard-tab ${activeTab === "operation" ? "dashboard-tab--active" : ""}`}
          aria-selected={activeTab === "operation"}
          id="tab-operation"
          onClick={() => setActiveTab("operation")}
        >
          <LayoutDashboard size={17} strokeWidth={2.1} />
          Operação
        </button>
        <button
          type="button"
          role="tab"
          className={`dashboard-tab ${activeTab === "telemetry" ? "dashboard-tab--active" : ""}`}
          aria-selected={activeTab === "telemetry"}
          id="tab-telemetry"
          onClick={() => setActiveTab("telemetry")}
        >
          <Activity size={17} strokeWidth={2.1} />
          Telemetria
        </button>
      </nav>

      {activeTab === "operation" ? (
        <div
          className="tab-panel"
          role="tabpanel"
          aria-labelledby="tab-operation"
          id="panel-operation"
        >
          <div className="dashboard-grid">
            <ConnectionForm
              ip={ip}
              onIpChange={setIp}
              onConnect={connect}
              isConnecting={status === "connecting"}
            />

            <ConnectionStatus
              label={statusLabel}
              status={status}
              isConnected={isConnected}
              onDisconnect={disconnect}
            />

            <ConnectionMetrics
              status={status}
              handshakeMs={handshakeMs}
              firstResponseMs={firstResponseMs}
              lastRttMs={lastRttMs}
            />

            <CommandPanel
              disabled={!isConnected}
              onCommand={sendCommand}
              autonomousActive={autonomousMode}
            />

            <section className="card card-console">
              <div className="card-header card-header--spread">
                <div className="card-header">
                  <div className="card-header-icon card-header-icon--console">
                    <span className="console-dots">
                      <span />
                      <span />
                      <span />
                    </span>
                  </div>
                  <div>
                    <span className="card-kicker">Console</span>
                    <h2>Mensagens</h2>
                  </div>
                </div>
                <button
                  className="btn btn-ghost btn-icon"
                  type="button"
                  onClick={() => setLogs([])}
                  aria-label="Limpar mensagens"
                >
                  <Trash2 size={17} />
                </button>
              </div>
              <MessageLog logs={logs} />
            </section>
          </div>
        </div>
      ) : (
        <div
          className="tab-panel tab-panel--telemetry"
          role="tabpanel"
          aria-labelledby="tab-telemetry"
          id="panel-telemetry"
        >
          <TelemetryDashboard
            telemetry={telemetry}
            autonomousMode={autonomousMode}
            connected={isConnected}
            raspberryIp={ip}
          />
        </div>
      )}
    </div>
  );
}
