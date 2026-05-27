export const OFFLINE_TELEMETRY = {
  batteryPercent: 0,
  batteryVoltage: 0,
  motorTempLeft: 0,
  motorTempRight: 0,
  forkHeightPercent: 0,
  position: { x: 0, y: 0, thetaDeg: 0 },
  linearSpeed: 0,
  angularSpeed: 0,
  wifiRssi: 0,
  imuOk: false,
  loadCellKg: 0,
  uptimeSec: 0,
  errors: [],
  alerts: [],
  aprilTagDetected: false,
  aprilTagId: null,
  aprilTagDistanceM: null,
  fsmState: "OFFLINE",
};

export function telemetryFromWebSocketMessage(message) {
  return {
    batteryPercent: Number(message.batteryPercent ?? 0),
    batteryVoltage: Number(message.batteryVoltage ?? 0),
    motorTempLeft: Number(message.motorTempLeft ?? 0),
    motorTempRight: Number(message.motorTempRight ?? 0),
    forkHeightPercent: Number(message.forkHeightPercent ?? 0),
    position: {
      x: Number(message.position?.x ?? 0),
      y: Number(message.position?.y ?? 0),
      thetaDeg: Number(message.position?.thetaDeg ?? 0),
    },
    linearSpeed: Number(message.linearSpeed ?? 0),
    angularSpeed: Number(message.angularSpeed ?? 0),
    wifiRssi: Number(message.wifiRssi ?? 0),
    imuOk: Boolean(message.imuOk),
    loadCellKg: Number(message.loadCellKg ?? 0),
    uptimeSec: Number(message.uptimeSec ?? 0),
    errors: Array.isArray(message.errors) ? message.errors : [],
    alerts: Array.isArray(message.alerts) ? message.alerts : [],
    aprilTagDetected: Boolean(message.aprilTagDetected),
    aprilTagId:
      message.aprilTagId === null || message.aprilTagId === undefined
        ? null
        : Number(message.aprilTagId),
    aprilTagDistanceM:
      message.aprilTagDistanceM === null || message.aprilTagDistanceM === undefined
        ? null
        : Number(message.aprilTagDistanceM),
    fsmState: String(message.fsmState ?? "MANUAL"),
  };
}
