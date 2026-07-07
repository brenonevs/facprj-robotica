import { useEffect, useRef, useState } from "react";

const FSM_STATES = [
  "OFF",
  "IDLE",
  "SCAN_TAG_1",
  "UNDO_SCAN_TAG_1",
  "MOVE_CATETO_TAG_1",
  "TURN_TO_TAG_1",
  "NAV_TO_TAG_1",
  "MANUAL_PALLETIZE",
  "SCAN_TAG_2",
  "UNDO_SCAN_TAG_2",
  "MOVE_CATETO_TAG_2",
  "TURN_TO_TAG_2",
  "NAV_TO_TAG_2",
  "MANUAL_DEPALLETIZE",
];

const OFFLINE_TELEMETRY = {
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

function clamp(n, lo, hi) {
  return Math.min(hi, Math.max(lo, n));
}

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function useMockTelemetry(isActive, autonomousMode) {
  const tickRef = useRef(0);
  const posRef = useRef({ x: 1.2, y: 0.4, theta: 0.08 });
  const fsmIndexRef = useRef(0);
  const [data, setData] = useState(OFFLINE_TELEMETRY);

  useEffect(() => {
    if (!isActive) {
      tickRef.current = 0;
      posRef.current = { x: 1.2, y: 0.4, theta: 0.08 };
      fsmIndexRef.current = 0;
      setData(OFFLINE_TELEMETRY);
      return;
    }

    setData({
      batteryPercent: 87,
      batteryVoltage: 24.6,
      motorTempLeft: 38,
      motorTempRight: 36,
      forkHeightPercent: 42,
      position: { x: 1.2, y: 0.4, thetaDeg: 4.6 },
      linearSpeed: 0,
      angularSpeed: 0,
      wifiRssi: -52,
      imuOk: true,
      loadCellKg: 0,
      uptimeSec: 0,
      errors: [],
      alerts: [],
      aprilTagDetected: false,
      aprilTagId: null,
      aprilTagDistanceM: null,
      fsmState: autonomousMode ? FSM_STATES[0] : "MANUAL",
    });

    const id = setInterval(() => {
      tickRef.current += 1;
      const t = tickRef.current;
      const p = posRef.current;

      p.x += (Math.random() - 0.48) * 0.02;
      p.y += (Math.random() - 0.5) * 0.015;
      p.theta += (Math.random() - 0.5) * 0.01;
      p.x = clamp(p.x, -0.5, 4.5);
      p.y = clamp(p.y, -0.5, 3.5);
      p.theta = clamp(p.theta, -3.14, 3.14);

      const linearSpeed = (Math.random() - 0.5) * 0.35;
      const angularSpeed = (Math.random() - 0.5) * 0.25;

      setData((prev) => {
        const batteryPercent = clamp(
          prev.batteryPercent + (Math.random() - 0.52) * 0.15,
          18,
          100,
        );
        const batteryVoltage = 20 + (batteryPercent / 100) * 5.2 + (Math.random() - 0.5) * 0.06;

        const motorTempLeft = clamp(34 + Math.sin(t / 7) * 4 + Math.random() * 2, 28, 72);
        const motorTempRight = clamp(33 + Math.cos(t / 8) * 3.5 + Math.random() * 2, 28, 70);

        const forkHeightPercent = clamp(
          35 + Math.sin(t / 11) * 22 + (Math.random() - 0.5) * 3,
          0,
          100,
        );

        const wifiRssi = clamp(-40 + Math.sin(t / 9) * 8 + (Math.random() - 0.5) * 4, -78, -35);
        const imuOk = t % 47 !== 0;
        const loadCellKg = clamp(Math.max(0, 12 + Math.sin(t / 5) * 8 + (Math.random() - 0.5) * 2), 0, 120);

        const errors = [];
        const alerts = [];
        if (motorTempLeft > 62 || motorTempRight > 60) {
          alerts.push("Temperatura dos motores elevada — reduza carga ou aguarde resfriamento.");
        }
        if (batteryPercent < 22) {
          alerts.push("Bateria baixa — considere recarregar em breve.");
        }
        if (wifiRssi < -68) {
          alerts.push("Sinal Wi‑Fi fraco — risco de latência no controle.");
        }
        if (t % 83 === 0 && Math.random() > 0.55) {
          errors.push("Falha transitória no encoder da roda esquerda (mock).");
        }

        let aprilTagDetected = false;
        let aprilTagId = null;
        let aprilTagDistanceM = null;
        let fsmState = "MANUAL";

        if (autonomousMode) {
          if (t % 5 === 0) {
            fsmIndexRef.current = (fsmIndexRef.current + 1) % FSM_STATES.length;
          }
          fsmState = FSM_STATES[fsmIndexRef.current];
          if (Math.random() > 0.28) {
            aprilTagDetected = true;
            aprilTagId = pick([0, 1, 2, 7, 12, 24, 36]);
            aprilTagDistanceM = clamp(0.35 + Math.random() * 1.8, 0.2, 3);
          }
          if (fsmState.startsWith("SCAN_TAG") && !aprilTagDetected) {
            alerts.push("Buscando AprilTag no campo de visão…");
          }
        }

        return {
          batteryPercent,
          batteryVoltage: Number(batteryVoltage.toFixed(2)),
          motorTempLeft: Number(motorTempLeft.toFixed(1)),
          motorTempRight: Number(motorTempRight.toFixed(1)),
          forkHeightPercent: Number(forkHeightPercent.toFixed(0)),
          position: {
            x: Number(p.x.toFixed(2)),
            y: Number(p.y.toFixed(2)),
            thetaDeg: Number(((p.theta * 180) / Math.PI).toFixed(1)),
          },
          linearSpeed: Number(linearSpeed.toFixed(2)),
          angularSpeed: Number(angularSpeed.toFixed(2)),
          wifiRssi: Math.round(wifiRssi),
          imuOk,
          loadCellKg: Number(loadCellKg.toFixed(1)),
          uptimeSec: t,
          errors,
          alerts,
          aprilTagDetected,
          aprilTagId,
          aprilTagDistanceM:
            aprilTagDistanceM == null ? null : Number(aprilTagDistanceM.toFixed(2)),
          fsmState,
        };
      });
    }, 900);

    return () => clearInterval(id);
  }, [isActive, autonomousMode]);

  return data;
}
