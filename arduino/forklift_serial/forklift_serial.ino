#include <Stepper.h>

const int LED_PIN = LED_BUILTIN;
const unsigned long TELEMETRY_INTERVAL_MS = 1000;
const unsigned long DRIVE_CONTROL_INTERVAL_MS = 50;

const int FORK_IN1 = 12;
const int FORK_IN2 = 13;
const int FORK_IN3 = 14;
const int FORK_IN4 = 15;
const int FORK_STEPS_PER_REV = 200;
const int FORK_RPM = 80;
const long FORK_STEPS_MIN = 0;
const long FORK_STEPS_MAX = 4000;

const int GND_PIN = 4;
const int VCC_PIN = 5;
const int ENABLE1 = 7;
const int ENABLE2 = 6;
const int IN1 = 8;
const int IN2 = 9;
const int IN3 = 10;
const int IN4 = 11;

const int ENCODER1_A = 22;
const int ENCODER1_B = 24;
const int ENCODER2_A = 26;
const int ENCODER2_B = 28;
const float ENCODER_COUNTS_PER_REV = 720.0f;

const int DEFAULT_DRIVE_PERCENT = 100;
const float MAX_MOTOR_RPM = 120.0f;
const float PID_KP = 2.2f;
const float PID_KI = 0.4f;
const float PID_KD = 0.08f;
const int MIN_DRIVE_PWM = 35;

enum DriveMode {
  DRIVE_STOP,
  DRIVE_FORWARD,
  DRIVE_BACKWARD,
  DRIVE_LEFT,
  DRIVE_RIGHT
};

struct MotorController {
  float targetRpm;
  float measuredRpm;
  float integral;
  float lastError;
  int pwm;
};

Stepper forkMotor(FORK_STEPS_PER_REV, FORK_IN1, FORK_IN2, FORK_IN3, FORK_IN4);

String inputBuffer;
bool autonomous = false;
unsigned long bootMs = 0;
unsigned long lastTelemetryMs = 0;
unsigned long lastDriveControlMs = 0;
unsigned long telemetryTick = 0;
int fsmIndex = 0;
int forkDir = 0;
long forkSteps = 2000;
DriveMode driveMode = DRIVE_STOP;
int drivePercent = DEFAULT_DRIVE_PERCENT;

volatile long encoder1Count = 0;
volatile long encoder2Count = 0;
int encoder1LastState = 0;
int encoder2LastState = 0;
MotorController motor1;
MotorController motor2;

float simX = 1.2f;
float simY = 0.4f;
float simTh = 4.5f;
float simBat = 87.0f;

const int8_t QUADRATURE_TABLE[16] = {
  0, 1, -1, 0,
  -1, 0, 0, 1,
  1, 0, 0, -1,
  0, -1, 1, 0
};

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

void readQuadratureEncoder(int pinA, int pinB, int& lastState, volatile long& count) {
  int state = (digitalRead(pinA) << 1) | digitalRead(pinB);
  int index = (lastState << 2) | state;
  count += QUADRATURE_TABLE[index];
  lastState = state;
}

void setMotor1Direction(bool forward) {
  digitalWrite(IN1, forward ? HIGH : LOW);
  digitalWrite(IN2, forward ? LOW : HIGH);
}

void setMotor2Direction(bool invertedBackward) {
  digitalWrite(IN3, invertedBackward ? LOW : HIGH);
  digitalWrite(IN4, invertedBackward ? HIGH : LOW);
}

void applyMotor1Pwm(bool forward, int pwm) {
  pwm = constrain(pwm, 0, 255);
  if (pwm == 0) {
    analogWrite(ENABLE1, 0);
    return;
  }
  setMotor1Direction(forward);
  analogWrite(ENABLE1, pwm);
}

void applyMotor2Pwm(bool forward, int pwm) {
  pwm = constrain(pwm, 0, 255);
  if (pwm == 0) {
    analogWrite(ENABLE2, 0);
    return;
  }
  setMotor2Direction(forward);
  analogWrite(ENABLE2, pwm);
}

float rpmFromCounts(long counts, float elapsedMs) {
  if (elapsedMs <= 0.0f) {
    return 0.0f;
  }
  return ((float)counts / ENCODER_COUNTS_PER_REV) * 60000.0f / elapsedMs;
}

float targetRpmFromPercent(int percent) {
  return ((float)constrain(percent, 0, 100) / 100.0f) * MAX_MOTOR_RPM;
}

void resetMotorController(MotorController& motor) {
  motor.targetRpm = 0.0f;
  motor.measuredRpm = 0.0f;
  motor.integral = 0.0f;
  motor.lastError = 0.0f;
  motor.pwm = 0;
}

void setDriveTargets(DriveMode mode, int percent) {
  float target = targetRpmFromPercent(percent);
  driveMode = mode;
  drivePercent = percent;

  switch (mode) {
    case DRIVE_FORWARD:
      motor1.targetRpm = target;
      motor2.targetRpm = target;
      break;
    case DRIVE_BACKWARD:
      motor1.targetRpm = -target;
      motor2.targetRpm = -target;
      break;
    case DRIVE_LEFT:
      motor1.targetRpm = -target;
      motor2.targetRpm = target;
      break;
    case DRIVE_RIGHT:
      motor1.targetRpm = target;
      motor2.targetRpm = -target;
      break;
    case DRIVE_STOP:
    default:
      motor1.targetRpm = 0.0f;
      motor2.targetRpm = 0.0f;
      break;
  }
}

int computeMotorPwm(MotorController& motor, float elapsedSec) {
  if (fabs(motor.targetRpm) < 0.5f) {
    motor.integral = 0.0f;
    motor.lastError = 0.0f;
    motor.pwm = 0;
    return 0;
  }

  float error = motor.targetRpm - motor.measuredRpm;
  motor.integral += error * elapsedSec;
  motor.integral = constrain(motor.integral, -80.0f, 80.0f);
  float derivative = (elapsedSec > 0.0f) ? ((error - motor.lastError) / elapsedSec) : 0.0f;
  motor.lastError = error;

  float output = (PID_KP * error) + (PID_KI * motor.integral) + (PID_KD * derivative);
  int pwm = (int)round(fabs(output));
  if (pwm > 0 && pwm < MIN_DRIVE_PWM) {
    pwm = MIN_DRIVE_PWM;
  }
  motor.pwm = constrain(pwm, 0, 255);
  return motor.pwm;
}

void stopDriveMotors() {
  setDriveTargets(DRIVE_STOP, 0);
  resetMotorController(motor1);
  resetMotorController(motor2);
  analogWrite(ENABLE1, 0);
  analogWrite(ENABLE2, 0);
}

void driveForward(int percent) {
  setDriveTargets(DRIVE_FORWARD, percent);
}

void driveBackward(int percent) {
  setDriveTargets(DRIVE_BACKWARD, percent);
}

void driveLeft(int percent) {
  setDriveTargets(DRIVE_LEFT, percent);
}

void driveRight(int percent) {
  setDriveTargets(DRIVE_RIGHT, percent);
}

void updateDriveControl() {
  unsigned long now = millis();
  if (lastDriveControlMs == 0) {
    lastDriveControlMs = now;
    encoder1LastState = (digitalRead(ENCODER1_A) << 1) | digitalRead(ENCODER1_B);
    encoder2LastState = (digitalRead(ENCODER2_A) << 1) | digitalRead(ENCODER2_B);
    return;
  }

  float elapsedMs = (float)(now - lastDriveControlMs);
  if (elapsedMs < (float)DRIVE_CONTROL_INTERVAL_MS) {
    return;
  }

  readQuadratureEncoder(ENCODER1_A, ENCODER1_B, encoder1LastState, encoder1Count);
  readQuadratureEncoder(ENCODER2_A, ENCODER2_B, encoder2LastState, encoder2Count);

  noInterrupts();
  long counts1 = encoder1Count;
  long counts2 = encoder2Count;
  encoder1Count = 0;
  encoder2Count = 0;
  interrupts();

  motor1.measuredRpm = rpmFromCounts(counts1, elapsedMs);
  motor2.measuredRpm = rpmFromCounts(counts2, elapsedMs);

  float elapsedSec = elapsedMs / 1000.0f;
  int pwm1 = computeMotorPwm(motor1, elapsedSec);
  int pwm2 = computeMotorPwm(motor2, elapsedSec);

  applyMotor1Pwm(motor1.targetRpm >= 0.0f, pwm1);
  applyMotor2Pwm(motor2.targetRpm >= 0.0f, pwm2);

  lastDriveControlMs = now;
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

  float lv = 0.0f;
  float av = 0.0f;
  if (driveMode == DRIVE_FORWARD || driveMode == DRIVE_BACKWARD) {
    lv = (motor1.measuredRpm + motor2.measuredRpm) * 0.5f / MAX_MOTOR_RPM * 0.35f;
  } else if (driveMode == DRIVE_LEFT || driveMode == DRIVE_RIGHT) {
    av = (motor2.measuredRpm - motor1.measuredRpm) * 0.5f / MAX_MOTOR_RPM * 0.9f;
  }

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
  Serial.print(fsmName());
  Serial.print(F(" rpm1="));
  Serial.print(motor1.measuredRpm, 1);
  Serial.print(F(" rpm2="));
  Serial.println(motor2.measuredRpm, 1);
}

void handleCommand(String line) {
  line.trim();
  if (line.length() == 0) {
    return;
  }

  if (line == "S") {
    stopDriveMotors();
    forkDir = 0;
    sendOk("S");
    blinkLed(1);
    return;
  }

  if (line == "M F") {
    driveForward(DEFAULT_DRIVE_PERCENT);
    sendOk(line);
    blinkLed(2);
    return;
  }

  if (line == "M B") {
    driveBackward(DEFAULT_DRIVE_PERCENT);
    sendOk(line);
    blinkLed(2);
    return;
  }

  if (line == "M L") {
    driveLeft(DEFAULT_DRIVE_PERCENT);
    sendOk(line);
    blinkLed(2);
    return;
  }

  if (line == "M R") {
    driveRight(DEFAULT_DRIVE_PERCENT);
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

void setupDriveMotors() {
  pinMode(GND_PIN, OUTPUT);
  pinMode(VCC_PIN, OUTPUT);
  pinMode(ENABLE1, OUTPUT);
  pinMode(ENABLE2, OUTPUT);
  pinMode(IN1, OUTPUT);
  pinMode(IN2, OUTPUT);
  pinMode(IN3, OUTPUT);
  pinMode(IN4, OUTPUT);
  pinMode(ENCODER1_A, INPUT);
  pinMode(ENCODER1_B, INPUT);
  pinMode(ENCODER2_A, INPUT);
  pinMode(ENCODER2_B, INPUT);

  digitalWrite(GND_PIN, LOW);
  digitalWrite(VCC_PIN, HIGH);

  encoder1LastState = (digitalRead(ENCODER1_A) << 1) | digitalRead(ENCODER1_B);
  encoder2LastState = (digitalRead(ENCODER2_A) << 1) | digitalRead(ENCODER2_B);

  stopDriveMotors();
}

void setup() {
  pinMode(LED_PIN, OUTPUT);
  Serial.begin(115200);
  inputBuffer.reserve(48);
  forkMotor.setSpeed(FORK_RPM);
  setupDriveMotors();
  bootMs = millis();
  lastTelemetryMs = bootMs;
  lastDriveControlMs = bootMs;
}

void loop() {
  processSerialInput();
  tickForkMotor();
  updateDriveControl();
  processSerialInput();

  unsigned long now = millis();
  if (now - lastTelemetryMs >= TELEMETRY_INTERVAL_MS) {
    lastTelemetryMs = now;
    sendTelemetry();
  }
}
