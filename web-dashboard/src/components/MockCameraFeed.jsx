import { Video } from "lucide-react";

export function MockCameraFeed({ autonomousMode }) {
  return (
    <div className={`mock-camera ${autonomousMode ? "mock-camera--auto" : ""}`}>
      <div className="mock-camera-noise" aria-hidden />
      <div className="mock-camera-grid" aria-hidden />
      <div className="mock-camera-scan" aria-hidden />
      <div className="mock-camera-overlay">
        <span className="mock-camera-badge">
          <Video size={14} />
          AO VIVO (mock)
        </span>
        <span className="mock-camera-meta">
          {autonomousMode ? "640×480 · detecção simulada" : "640×480 · câmera frontal"}
        </span>
      </div>
    </div>
  );
}
