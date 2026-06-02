import { Tag, Video } from "lucide-react";
import { CAMERA_STREAM_PORT, createCameraStreamUrl } from "../services/websocket.js";

export function ConnectionStreamCard({
  ip,
  connected,
  aprilTagDetected,
  aprilTagId,
  aprilTagDistanceM,
  autonomousMode,
}) {
  const trimmedIp = ip.trim();
  const streamUrl = trimmedIp ? createCameraStreamUrl(trimmedIp) : null;

  return (
    <section className="card card-network-tile">
      <div className="card-header card-header--compact">
        <div className="card-header-icon card-header-icon--camera">
          <Video size={16} />
        </div>
        <div>
          <span className="card-kicker">Rede</span>
          <h2>Vídeo</h2>
        </div>
      </div>
      <div className="card-body card-body--network-tile">
        <div className={`connection-channel ${connected ? "connection-channel--on" : ""}`}>
          <div className="connection-channel-head">
            <span>MJPEG</span>
            <span className="connection-channel-port">:{CAMERA_STREAM_PORT}</span>
          </div>
          <code className="connection-channel-url">
            {streamUrl ?? `http://<ip>:${CAMERA_STREAM_PORT}/stream`}
          </code>
        </div>
        <div className="network-tile-vision">
          <div className="network-tile-vision-head">
            <Tag size={14} />
            <span>AprilTag (visão)</span>
          </div>
          {connected && aprilTagDetected ? (
            <p className="network-tile-vision-detail">
              Tag <strong>#{aprilTagId}</strong> a{" "}
              <strong>{aprilTagDistanceM?.toFixed(2)} m</strong>
            </p>
          ) : (
            <p className="network-tile-vision-detail network-tile-vision-detail--muted">
              {connected ? "Nenhuma tag no frame" : "Aguardando conexão"}
            </p>
          )}
        </div>
        <p className="card-hint network-tile-hint">
          {connected
            ? `Stream ao vivo${autonomousMode ? " · modo autônomo" : ""}.`
            : "O vídeo aparece após conectar."}
        </p>
      </div>
    </section>
  );
}
