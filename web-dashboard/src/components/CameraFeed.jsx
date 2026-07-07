import { useEffect, useRef, useState } from "react";
import { Video, VideoOff } from "lucide-react";
import { createCameraStreamUrl } from "../services/websocket.js";

export function CameraFeed({ ip, connected, autonomousMode, streamEnabled = true }) {
  const [streamError, setStreamError] = useState(false);
  const errorReportedRef = useRef(false);
  const streamUrl =
    connected && ip.trim() && streamEnabled ? createCameraStreamUrl(ip.trim()) : null;

  useEffect(() => {
    setStreamError(false);
    errorReportedRef.current = false;
  }, [ip, connected, streamEnabled]);

  const showStream = streamUrl && !streamError;

  return (
    <div className={`camera-feed ${autonomousMode ? "camera-feed--auto" : ""}`}>
      <div className="camera-feed-frame">
        {showStream ? (
          <img
            className="camera-feed-img"
            src={streamUrl}
            alt="Câmera da empilhadeira"
            decoding="async"
            onError={() => {
              if (errorReportedRef.current) {
                return;
              }
              errorReportedRef.current = true;
              setStreamError(true);
            }}
          />
        ) : (
          <div className="camera-feed-placeholder">
            <VideoOff size={28} strokeWidth={1.8} />
            <p>
              {!streamEnabled
                ? "Stream no modal de autonomia"
                : connected
                  ? "Stream indisponível"
                  : "Conecte ao Raspberry Pi"}
            </p>
          </div>
        )}
        <div className="camera-feed-overlay">
          <span className="camera-feed-badge">
            <Video size={14} />
            {showStream ? "AO VIVO" : "OFFLINE"}
          </span>
          <span className="camera-feed-meta">
            {showStream ? "MJPEG · visão computacional" : "http://IP:8766/stream"}
          </span>
        </div>
      </div>
    </div>
  );
}
