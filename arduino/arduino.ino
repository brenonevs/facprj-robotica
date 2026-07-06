const int LED_PIN = LED_BUILTIN;
const unsigned long TELEMETRY_INTERVAL_MS = 1000;
const unsigned long DRIVE_CONTROL_INTERVAL_MS = 50;

const int FORK_ENABLE = 5;
const int FORK_DIR = 6;
const int FORK_STEP = 7;
const int FORK_STEPS_PER_REV = 200;
const float FORK_LEAD_MM = 19.0f;
const int FORK_RPM = 80;
const long FORK_STEPS_MIN = 0;
const long FORK_STEPS_MAX = 4000;
const unsigned long FORK_STEP_INTERVAL_US = 60000000UL / (FORK_RPM * FORK_STEPS_PER_REV);

const int GND_PIN = 16;
const int VCC_PIN = 17;
const int ENB = 8;
const int IN4 = 9;
const int IN3 = 10;
const int IN2 = 11;
const int IN1 = 12;
const int ENA = 13;

const int ENCODER1_A = 18;
const int ENCODER1_B = 19;
const int ENCODER2_A = 20;
const int ENCODER2_B = 21;
const float ENCODER_COUNTS_PER_REV = 720.0f;
const float WHEEL_DIAMETER_M = 0.05436f;
const float TRACK_WIDTH_M = 0.1427f;
const float WHEEL_CIRCUMFERENCE_M = 3.14159265f * WHEEL_DIAMETER_M;
const float METERS_PER_ENCODER_COUNT = WHEEL_CIRCUMFERENCE_M / ENCODER_COUNTS_PER_REV;
const float RPM_TO_MPS = WHEEL_CIRCUMFERENCE_M / 60.0f;

const int DEFAULT_DRIVE_PERCENT = 70;
const float MAX_MOTOR_RPM = 120.0f;
const float RPM_RAMP_UP_RATE = 140.0f;
const float RPM_RAMP_DOWN_RATE = 220.0f;
const float MIN_RPM_FOR_MIN_PWM = 18.0f;
const float PID_KP = 1.6f;
const float PID_KI = 0.35f;
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
  float commandedRpm;
  float targetRpm;
  float measuredRpm;
  float integral;
  float lastError;
  int pwm;
};

String inputBuffer;
bool autonomous = false;
unsigned long bootMs = 0;
unsigned long lastTelemetryMs = 0;
unsigned long lastDriveControlMs = 0;
int forkDir = 0;
long forkSteps = 2000;
unsigned long lastForkStepUs = 0;
DriveMode driveMode = DRIVE_STOP;
int drivePercent = DEFAULT_DRIVE_PERCENT;

volatile long encoder1Count = 0;
volatile long encoder2Count = 0;
int encoder1LastState = 0;
int encoder2LastState = 0;
MotorController motor1;
MotorController motor2;

float odomX = 0.0f;
float odomY = 0.0f;
float odomThetaDeg = 0.0f;

const int8_t QUADRATURE_TABLE[16] = {
  0, 1, -1, 0,
  -1, 0, 0, 1,
  1, 0, 0, -1,
  0, -1, 1, 0
};

void blinkLed(int times) {
  for (int i = 0; i < times; i++) {
    digitalWrite(LED_PIN, HIGH);
    digitalWrite(LED_PIN, LOW);
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
    digitalWrite(IN1, LOW);
    digitalWrite(IN2, LOW);
    analogWrite(ENA, 255);
    return;
  }
  setMotor1Direction(forward);
  analogWrite(ENA, pwm);
}

void applyMotor2Pwm(bool forward, int pwm) {
  pwm = constrain(pwm, 0, 255);
  if (pwm == 0) {
    digitalWrite(IN3, LOW);
    digitalWrite(IN4, LOW);
    analogWrite(ENB, 255);
    return;
  }
  setMotor2Direction(forward);
  analogWrite(ENB, pwm);
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

float rampRpmToward(float current, float target, float elapsedSec) {
  if (fabs(target - current) < 0.5f) {
    return target;
  }

  float rate = RPM_RAMP_UP_RATE;
  if (fabs(target) < fabs(current) - 0.5f) {
    rate = RPM_RAMP_DOWN_RATE;
  } else if ((current > 0.5f && target < -0.5f) || (current < -0.5f && target > 0.5f)) {
    rate = RPM_RAMP_DOWN_RATE;
  }

  float maxDelta = rate * elapsedSec;
  if (target > current) {
    return min(current + maxDelta, target);
  }
  return max(current - maxDelta, target);
}

void resetMotorController(MotorController& motor) {
  motor.commandedRpm = 0.0f;
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
      motor1.commandedRpm = target;
      motor2.commandedRpm = target;
      break;
    case DRIVE_BACKWARD:
      motor1.commandedRpm = -target;
      motor2.commandedRpm = -target;
      break;
    case DRIVE_LEFT:
      motor1.commandedRpm = -target;
      motor2.commandedRpm = target;
      break;
    case DRIVE_RIGHT:
      motor1.commandedRpm = target;
      motor2.commandedRpm = -target;
      break;
    case DRIVE_STOP:
    default:
      motor1.commandedRpm = 0.0f;
      motor2.commandedRpm = 0.0f;
      break;
  }
}

int computeMotorPwm(MotorController& motor, float elapsedSec, bool& outForward) {
  if (fabs(motor.targetRpm) < 0.5f) {
    motor.integral = 0.0f;
    motor.lastError = motor.measuredRpm;
    motor.pwm = 0;
    outForward = true;
    return 0;
  }

  float error = motor.targetRpm - motor.measuredRpm;
  motor.integral += error * elapsedSec;
  motor.integral = constrain(motor.integral, -80.0f, 80.0f);

  float derivative = (elapsedSec > 0.0f) ? -((motor.measuredRpm - motor.lastError) / elapsedSec) : 0.0f;
  motor.lastError = motor.measuredRpm;

  float feedForward = (motor.targetRpm / MAX_MOTOR_RPM) * 255.0f;

  float output = feedForward + (PID_KP * error) + (PID_KI * motor.integral) + (PID_KD * derivative);

  outForward = (output >= 0.0f);

  int pwm = (int)round(fabs(output));
  if (fabs(motor.targetRpm) >= MIN_RPM_FOR_MIN_PWM) {
    int minPwm = (int)round(
      MIN_DRIVE_PWM * (fabs(motor.targetRpm) / MAX_MOTOR_RPM)
    );
    minPwm = constrain(minPwm, 0, MIN_DRIVE_PWM);
    if (pwm > 0 && pwm < minPwm) {
      pwm = minPwm;
    }
  }
  motor.pwm = constrain(pwm, 0, 255);
  return motor.pwm;
}

void stopDriveMotors() {
  setDriveTargets(DRIVE_STOP, 0);
  resetMotorController(motor1);
  resetMotorController(motor2);
  applyMotor1Pwm(true, 0);
  applyMotor2Pwm(true, 0);
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

void updateOdometry(long countsLeft, long countsRight) {
  float dsLeft = (float)countsLeft * METERS_PER_ENCODER_COUNT;
  float dsRight = (float)countsRight * METERS_PER_ENCODER_COUNT;
  float ds = (dsLeft + dsRight) * 0.5f;
  float dThetaRad = (dsRight - dsLeft) / TRACK_WIDTH_M;
  float thetaRad = odomThetaDeg * (3.14159265f / 180.0f);
  float midThetaRad = thetaRad + dThetaRad * 0.5f;
  odomX += ds * cos(midThetaRad);
  odomY += ds * sin(midThetaRad);
  odomThetaDeg += dThetaRad * (180.0f / 3.14159265f);
  while (odomThetaDeg > 180.0f) {
    odomThetaDeg -= 360.0f;
  }
  while (odomThetaDeg < -180.0f) {
    odomThetaDeg += 360.0f;
  }
}

void updateDriveControl() {
  unsigned long now = millis();
  if (lastDriveControlMs == 0) {
    lastDriveControlMs = now;
    return;
  }

  float elapsedMs = (float)(now - lastDriveControlMs);
  if (elapsedMs < (float)DRIVE_CONTROL_INTERVAL_MS) {
    return;
  }

  noInterrupts();
  long counts1 = encoder1Count;
  long counts2 = encoder2Count;
  encoder1Count = 0;
  encoder2Count = 0;
  interrupts();

  motor1.measuredRpm = rpmFromCounts(counts1, elapsedMs);
  motor2.measuredRpm = rpmFromCounts(counts2, elapsedMs);
  updateOdometry(counts1, counts2);

  float elapsedSec = elapsedMs / 1000.0f;

  motor1.targetRpm = rampRpmToward(motor1.targetRpm, motor1.commandedRpm, elapsedSec);
  motor2.targetRpm = rampRpmToward(motor2.targetRpm, motor2.commandedRpm, elapsedSec);

  bool dir1, dir2;
  int pwm1 = computeMotorPwm(motor1, elapsedSec, dir1);
  int pwm2 = computeMotorPwm(motor2, elapsedSec, dir2);

  applyMotor1Pwm(dir1, pwm1);
  applyMotor2Pwm(dir2, pwm2);

  lastDriveControlMs = now;
}

float forkHeightMm() {
  return (float)(forkSteps - FORK_STEPS_MIN) * FORK_LEAD_MM / (float)FORK_STEPS_PER_REV;
}

float forkTravelMaxMm() {
  return (float)(FORK_STEPS_MAX - FORK_STEPS_MIN) * FORK_LEAD_MM / (float)FORK_STEPS_PER_REV;
}

float forkHeightPercent() {
  float maxMm = forkTravelMaxMm();
  if (maxMm <= 0.0f) {
    return 0.0f;
  }
  float pct = forkHeightMm() * 100.0f / maxMm;
  if (pct < 0.0f) {
    return 0.0f;
  }
  if (pct > 100.0f) {
    return 100.0f;
  }
  return pct;
}

void sendTelemetry() {
  unsigned long upSec = (millis() - bootMs) / 1000UL;

  float vLeft = motor1.measuredRpm * RPM_TO_MPS;
  float vRight = motor2.measuredRpm * RPM_TO_MPS;
  float lv = (vLeft + vRight) * 0.5f;
  float av = (vRight - vLeft) / TRACK_WIDTH_M;

  Serial.print(F("T bat="));
  Serial.print(0, 1);
  Serial.print(F(" v="));
  Serial.print(0, 2);
  Serial.print(F(" tl="));
  Serial.print(0, 1);
  Serial.print(F(" tr="));
  Serial.print(0, 1);
  Serial.print(F(" x="));
  Serial.print(odomX, 2);
  Serial.print(F(" y="));
  Serial.print(odomY, 2);
  Serial.print(F(" th="));
  Serial.print(odomThetaDeg, 1);
  Serial.print(F(" lv="));
  Serial.print(lv, 2);
  Serial.print(F(" av="));
  Serial.print(av, 2);
  Serial.print(F(" fork="));
  Serial.print(forkHeightPercent(), 0);
  Serial.print(F(" fmm="));
  Serial.print(forkHeightMm(), 1);
  Serial.print(F(" load="));
  Serial.print(0, 1);
  Serial.print(F(" up="));
  Serial.print(upSec);
  Serial.print(F(" rssi="));
  Serial.print(0);
  Serial.print(F(" imu="));
  Serial.print(0);
  Serial.print(F(" tag="));
  Serial.print(0);
  Serial.print(F(" tid="));
  Serial.print(-1);
  Serial.print(F(" tdist="));
  Serial.print(-1.0f, 2);
  Serial.print(F(" fsm="));
  Serial.print(F("MANUAL"));
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
    disableForkMotor();
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

void disableForkMotor() {
  digitalWrite(FORK_ENABLE, HIGH);
}

void tickForkMotor() {
  if (forkDir == 0) {
    disableForkMotor();
    return;
  }

  if (forkDir > 0 && forkSteps >= FORK_STEPS_MAX) {
    forkDir = 0;
    disableForkMotor();
    return;
  }

  if (forkDir < 0 && forkSteps <= FORK_STEPS_MIN) {
    forkDir = 0;
    disableForkMotor();
    return;
  }

  digitalWrite(FORK_ENABLE, LOW);
  digitalWrite(FORK_DIR, forkDir > 0 ? HIGH : LOW);

  unsigned long now = micros();
  if (lastForkStepUs != 0 && (now - lastForkStepUs) < FORK_STEP_INTERVAL_US) {
    return;
  }
  lastForkStepUs = now;

  digitalWrite(FORK_STEP, HIGH);
  digitalWrite(FORK_STEP, LOW);
  forkSteps += forkDir;
}

void setupForkMotor() {
  pinMode(FORK_ENABLE, OUTPUT);
  pinMode(FORK_DIR, OUTPUT);
  pinMode(FORK_STEP, OUTPUT);
  digitalWrite(FORK_STEP, LOW);
  digitalWrite(FORK_DIR, LOW);
  disableForkMotor();
}

void setupDriveMotors() {
  pinMode(GND_PIN, OUTPUT);
  pinMode(VCC_PIN, OUTPUT);
  pinMode(ENA, OUTPUT);
  pinMode(ENB, OUTPUT);
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
  setupForkMotor();
  setupDriveMotors();
  bootMs = millis();
  lastTelemetryMs = bootMs;
  lastDriveControlMs = bootMs;
}

void loop() {
  readQuadratureEncoder(ENCODER1_A, ENCODER1_B, encoder1LastState, encoder1Count);
  readQuadratureEncoder(ENCODER2_A, ENCODER2_B, encoder2LastState, encoder2Count);

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