const int LED_PIN = LED_BUILTIN;

String inputBuffer;

void blinkLed(int times) {
  for (int i = 0; i < times; i++) {
    digitalWrite(LED_PIN, HIGH);
    delay(80);
    digitalWrite(LED_PIN, LOW);
    delay(80);
  }
}

void sendOk(const String& command) {
  Serial.print("OK ");
  Serial.println(command);
}

void sendErr(const char* reason) {
  Serial.print("ERR ");
  Serial.println(reason);
}

void handleCommand(const String& line) {
  line.trim();
  if (line.length() == 0) {
    return;
  }

  if (line == "S") {
    sendOk("S");
    blinkLed(1);
    return;
  }

  if (line == "M F" || line == "M B" || line == "M L" || line == "M R") {
    sendOk(line);
    blinkLed(2);
    return;
  }

  if (line == "F U" || line == "F D") {
    sendOk(line);
    blinkLed(3);
    return;
  }

  if (line == "A 1" || line == "A 0") {
    sendOk(line);
    blinkLed(4);
    return;
  }

  sendErr("UNKNOWN");
}

void setup() {
  pinMode(LED_PIN, OUTPUT);
  Serial.begin(115200);
  inputBuffer.reserve(32);
}

void loop() {
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
