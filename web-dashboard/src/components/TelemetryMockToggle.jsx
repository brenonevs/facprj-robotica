import { FlaskConical, Radio } from "lucide-react";

export function TelemetryMockToggle({ enabled, disabled, onChange }) {
  return (
    <div className="telemetry-mock-toggle">
      <button
        type="button"
        className={`telemetry-mock-btn ${!enabled ? "telemetry-mock-btn--active" : ""}`}
        disabled={disabled}
        onClick={() => onChange(false)}
      >
        <Radio size={15} />
        Arduino real
      </button>
      <button
        type="button"
        className={`telemetry-mock-btn ${enabled ? "telemetry-mock-btn--active" : ""}`}
        disabled={disabled}
        onClick={() => onChange(true)}
      >
        <FlaskConical size={15} />
        Mock
      </button>
    </div>
  );
}
