#include <Stepper.h>

const int LED_PIN = LED_BUILTIN;
const unsigned long TELEMETRY_INTERVAL_MS = 1000;

const int FORK_IN1 = 10;
const int FORK_IN2 = 11;
const int FORK_IN3 = 12;
const int FORK_IN4 = 13;
const int FORK_STEPS_PER_REV = 200;
const int FORK_RPM = 80;
const long FORK_STEPS_MIN = 0;
const long FORK_STEPS_MAX = 4000;

Stepper forkMotor(FORK_STEPS_PER_REV, FORK_IN1, FORK_IN2, FORK_IN3, FORK_IN4);

String inputBuffer;
bool autonomous = false;
unsigned long bootMs = 0;
unsigned long lastTelemetryMs = 0;
unsigned long telemetryTick = 0;
int fsmIndex = 0;
int forkDir = 0;
long forkSteps = 2000;

float simX = 1.2f;
float simY = 0.4f;
float simTh = 4.5f;
float simBat = 87.0f;

void blinkLed(int times) {
  for (int i = 0; i < times; i++) {
    digitalWrite(LED_PIN, HIGH);
    delay(80);
    digitalWrite(LED_PIN, LOW);
    delay(80);
  }
}

void sendOk(const String& command) {
  Serial.print(F("OK "));
  Serial.println(command);
}

void sendErr(const char* reason) {
  Serial.print(F("ERR "));
  Serial.println(reason);
}

float forkHeightPercent() {
  if (FORK_STEPS_MAX <= FORK_STEPS_MIN) {
    return 0.0f;
  }
  float pct = (float)(forkSteps - FORK_STEPS_MIN) * 100.0f / (float)(FORK_STEPS_MAX - FORK_STEPS_MIN);
  if (pct < 0.0f) {
    return 0.0f;
  }
  if (pct > 100.0f) {
    return 100.0f;
  }
  return pct;
}

const char* fsmName() {
  const char* states[] = {
    "IDLE", "SCAN_TAGS", "NAV_TO_WAYPOINT", "ALIGN_FORK",
    "LIFT_PALLET", "TRANSPORT", "DROP_PALLET"
  };
  const int count = 7;
  if (!autonomous) {
    return "MANUAL";
  }
  return states[fsmIndex % count];
}

void sendTelemetry() {
  telemetryTick++;
  unsigned long upSec = (millis() - bootMs) / 1000UL;

  simX += 0.008f;
  simY += 0.006f;
  simTh += 0.4f;
  if (simTh > 180.0f) {
    simTh -= 360.0f;
  }
  simBat += (telemetryTick % 2 == 0) ? -0.05f : 0.04f;
  if (simBat < 18.0f) {
    simBat = 18.0f;
  }
  if (simBat > 100.0f) {
    simBat = 100.0f;
  }

  float v = 20.0f + (simBat / 100.0f) * 5.2f;
  float tl = 36.0f + (telemetryTick % 10) * 0.35f;
  float tr = 35.0f + (telemetryTick % 8) * 0.32f;
  float load = autonomous ? 14.5f + (telemetryTick % 5) : 0.0f;
  int rssi = -52 - (int)(telemetryTick % 7);
  int imu = (telemetryTick % 47 == 0) ? 0 : 1;
  float lv = (telemetryTick % 4 == 0) ? 0.15f : 0.0f;
  float av = (telemetryTick % 5 == 0) ? 0.08f : 0.0f;

  int tag = 0;
  int tid = -1;
  float tdist = -1.0f;

  if (autonomous) {
    if (telemetryTick % 5 == 0) {
      fsmIndex = (fsmIndex + 1) % 7;
    }
    if (telemetryTick % 3 != 0) {
      tag = 1;
      tid = (int)(telemetryTick % 7);
      tdist = 0.55f + (telemetryTick % 10) * 0.12f;
    }
  }

  Serial.print(F("T bat="));
  Serial.print(simBat, 1);
  Serial.print(F(" v="));
  Serial.print(v, 2);
  Serial.print(F(" tl="));
  Serial.print(tl, 1);
  Serial.print(F(" tr="));
  Serial.print(tr, 1);
  Serial.print(F(" x="));
  Serial.print(simX, 2);
  Serial.print(F(" y="));
  Serial.print(simY, 2);
  Serial.print(F(" th="));
  Serial.print(simTh, 1);
  Serial.print(F(" lv="));
  Serial.print(lv, 2);
  Serial.print(F(" av="));
  Serial.print(av, 2);
  Serial.print(F(" fork="));
  Serial.print(forkHeightPercent(), 0);
  Serial.print(F(" load="));
  Serial.print(load, 1);
  Serial.print(F(" up="));
  Serial.print(upSec);
  Serial.print(F(" rssi="));
  Serial.print(rssi);
  Serial.print(F(" imu="));
  Serial.print(imu);
  Serial.print(F(" tag="));
  Serial.print(tag);
  Serial.print(F(" tid="));
  Serial.print(tid);
  Serial.print(F(" tdist="));
  Serial.print(tdist, 2);
  Serial.print(F(" fsm="));
  Serial.println(fsmName());
}

void handleCommand(String line) {
  line.trim();
  if (line.length() == 0) {
    return;
  }

  if (line == "S") {
    forkDir = 0;
    sendOk("S");
    blinkLed(1);
    return;
  }

  if (line == "M F" || line == "M B" || line == "M L" || line == "M R") {
    sendOk(line);
    blinkLed(2);
    return;
  }

  if (line == "F U") {
    forkDir = 1;
    sendOk(line);
    return;
  }

  if (line == "F D") {
    forkDir = -1;
    sendOk(line);
    return;
  }

  if (line == "A 1") {
    autonomous = true;
    fsmIndex = 0;
    sendOk(line);
    blinkLed(4);
    return;
  }

  if (line == "A 0") {
    autonomous = false;
    sendOk(line);
    blinkLed(4);
    return;
  }

  sendErr("UNKNOWN");
}

void processSerialInput() {
  while (Serial.available() > 0) {
    char c = Serial.read();
    if (c == '\n' || c == '\r') {
      if (inputBuffer.length() > 0) {
        handleCommand(inputBuffer);
        inputBuffer = "";
      }
    } else {
      inputBuffer += c;
    }
  }
}

void tickForkMotor() {
  if (forkDir == 0) {
    return;
  }

  if (forkDir > 0 && forkSteps >= FORK_STEPS_MAX) {
    forkDir = 0;
    return;
  }

  if (forkDir < 0 && forkSteps <= FORK_STEPS_MIN) {
    forkDir = 0;
    return;
  }

  forkMotor.step(forkDir);
  forkSteps += forkDir;
}

void setup() {
  pinMode(LED_PIN, OUTPUT);
  Serial.begin(115200);
  inputBuffer.reserve(48);
  forkMotor.setSpeed(FORK_RPM);
  bootMs = millis();
  lastTelemetryMs = bootMs;
}

void loop() {
  processSerialInput();
  tickForkMotor();
  processSerialInput();

  unsigned long now = millis();
  if (now - lastTelemetryMs >= TELEMETRY_INTERVAL_MS) {
    lastTelemetryMs = now;
    sendTelemetry();
  }
}
