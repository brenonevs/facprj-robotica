export const OFFLINE_AUTONOMY = {
  enabled: false,
  fsmState: "OFF",
  targetTagId: null,
  firstTagId: null,
  targetDistanceM: 0.22,
  currentDistanceM: null,
  manualControlAllowed: false,
  cycleStep: 0,
  cycleStepTotal: 8,
  scanRotateDurationS: 0.4,
  scanRotateIntervalS: 0.45,
  scanForwardPulseS: 1.0,
  scanPulsesPer360: 25,
  scanSweepEstimatedS: 21.25,
  scanPhase: "rotate",
  scanTurnPulsesCompleted: 0,
  alert: null,
};

export const FSM_STATE_LABELS = {
  OFF: "Desligado",
  IDLE: "Aguardando início",
  SCAN_TAG_1: "Buscando tag de paletização",
  ALIGN_TAG_1: "Alinhando tag de paletização",
  NAV_TO_TAG_1: "Navegando até paletização",
  MANUAL_PALLETIZE: "Paletização manual",
  SCAN_TAG_2: "Buscando tag de despaletização",
  ALIGN_TAG_2: "Alinhando tag de despaletização",
  NAV_TO_TAG_2: "Navegando até despaletização",
  MANUAL_DEPALLETIZE: "Despaletização manual",
};

export function autonomyFromWebSocketMessage(message) {
  return {
    enabled: Boolean(message.enabled),
    fsmState: String(message.fsmState ?? "OFF"),
    targetTagId:
      message.targetTagId === null || message.targetTagId === undefined
        ? null
        : Number(message.targetTagId),
    firstTagId:
      message.firstTagId === null || message.firstTagId === undefined
        ? null
        : Number(message.firstTagId),
    targetDistanceM: Number(message.targetDistanceM ?? 0.22),
    currentDistanceM:
      message.currentDistanceM === null || message.currentDistanceM === undefined
        ? null
        : Number(message.currentDistanceM),
    manualControlAllowed: Boolean(message.manualControlAllowed),
    cycleStep: Number(message.cycleStep ?? 0),
    cycleStepTotal: Number(message.cycleStepTotal ?? 8),
    scanRotateDurationS: Number(message.scanRotateDurationS ?? 0.4),
    scanRotateIntervalS: Number(message.scanRotateIntervalS ?? 0.45),
    scanForwardPulseS: Number(message.scanForwardPulseS ?? 1.0),
    scanPulsesPer360: Number(message.scanPulsesPer360 ?? 25),
    scanSweepEstimatedS: Number(message.scanSweepEstimatedS ?? 21.25),
    scanPhase: String(message.scanPhase ?? "rotate"),
    scanTurnPulsesCompleted: Number(message.scanTurnPulsesCompleted ?? 0),
    alert: message.alert ?? null,
  };
}

export const OFFLINE_TELEMETRY = {
  batteryPercent: 0,
  batteryVoltage: 0,
  motorTempLeft: 0,
  motorTempRight: 0,
  forkHeightPercent: 0,
  forkHeightMm: 0,
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
    forkHeightMm: Number(message.forkHeightMm ?? 0),
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
