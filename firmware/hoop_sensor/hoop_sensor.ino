// Pins
const int SENSOR1 = 13;   // top beam
const int SENSOR2 = 10;   // bottom beam
const int LED = 3;

// Diagnostic output is ignored by the website bridge (only SCORE counts).
const bool DEBUG_SENSORS = true;
const int BEAM_BROKEN_LEVEL = LOW;  // Confirm with the raw readings before changing.

// Tuning
const unsigned long TIMEOUT_MS = 1000;   // max time between beam 1 and beam 2
const unsigned long LED_FLASH_MS = 500;  // how long LED stays on after a score

// State machine
enum State { IDLE, WAIT_FOR_S2, WAIT_CLEAR };
State state = IDLE;

unsigned long s1BrokenAt = 0;
unsigned long ledOnAt = 0;
bool ledActive = false;
int score = 0;

bool beamBroken(int pin) {
  return digitalRead(pin) == BEAM_BROKEN_LEVEL;
}

void setup() {
  Serial.begin(9600);
  pinMode(SENSOR1, INPUT_PULLUP);
  pinMode(SENSOR2, INPUT_PULLUP);
  pinMode(LED, OUTPUT);
  digitalWrite(LED, LOW);
  Serial.println("Ready. Score: 0");
}

void loop() {
  int raw1 = digitalRead(SENSOR1);
  int raw2 = digitalRead(SENSOR2);
  bool s1 = raw1 == BEAM_BROKEN_LEVEL;
  bool s2 = raw2 == BEAM_BROKEN_LEVEL;

  // Print at startup and whenever either reading changes, not on every loop.
  static int lastRaw1 = -1;
  static int lastRaw2 = -1;
  if (DEBUG_SENSORS && (raw1 != lastRaw1 || raw2 != lastRaw2)) {
    Serial.print("Sensors: TOP raw=");
    Serial.print(raw1);
    Serial.print(s1 ? " BROKEN" : " CLEAR");
    Serial.print(" | BOTTOM raw=");
    Serial.print(raw2);
    Serial.println(s2 ? " BROKEN" : " CLEAR");
    lastRaw1 = raw1;
    lastRaw2 = raw2;
  }
  unsigned long now = millis();

  switch (state) {
    case IDLE:
      // Only start a shot when sensor 1 breaks FIRST (sensor 2 must be clear)
      if (s1 && !s2) {
        s1BrokenAt = now;
        state = WAIT_FOR_S2;
      }
      break;

    case WAIT_FOR_S2:
      if (now - s1BrokenAt > TIMEOUT_MS) {
        Serial.println("Miss (timeout) - clear both beams before retrying");
        state = WAIT_CLEAR;
      } else if (s2) {
        // Ball passed through both, in the right order
        score++;
        // One machine-readable event per basket for the Node.js bridge.
        Serial.println("SCORE");
        Serial.print("SCORE! Total: ");
        Serial.println(score);
        digitalWrite(LED, HIGH);
        ledOnAt = now;
        ledActive = true;
        state = WAIT_CLEAR;
      }
      break;

    case WAIT_CLEAR:
      // Wait until both beams are clear before allowing another shot
      if (!s1 && !s2) {
        state = IDLE;
      }
      break;
  }

  // Non-blocking LED turn-off
  if (ledActive && now - ledOnAt >= LED_FLASH_MS) {
    digitalWrite(LED, LOW);
    ledActive = false;
  }
}
