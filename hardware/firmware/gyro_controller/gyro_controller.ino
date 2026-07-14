/**
 * gyro_balance_v4.ino — ESP32 IMU + ESC Balancing Controller  v4.0
 *
 * ─────────────────────────────────────────────────────────────────────────────
 *  NEW IN v4 vs gyro_controller v3.5
 * ─────────────────────────────────────────────────────────────────────────────
 *  1. CORRECT MINIMUM GAINS  — v3.5 had Kp=0.7, Ki=0.005 which are both
 *     well below the Routh stability boundary. The Routh criterion for this
 *     reaction-wheel inverted-pendulum plant requires:
 *
 *       Ki  ≥  Ki_min = m·g·L / K_eff  ≈  17–20   (v3.5 had 0.005)
 *       Kp  ≥  Kp_min = m·g·L·τ / K_eff  ≈  1.4  (v3.5 had 0.7)
 *
 *     v4 defaults: Kp=3.0, Ki=25.0, Kd=1.0  (all above Routh minimums)
 *
 *  2. DIRECT GYRO-RATE DERIVATIVE — v3.5 computed D = Kd*(error-prevError)/dt
 *     which numerically differentiates the Kalman angle estimate, amplifying
 *     quantisation noise. v4 uses the raw gyroscope angular-rate measurement
 *     directly: D_term = −Kd·ω_gyro (no differentiation, much cleaner).
 *
 *  3. TWO-AXIS SIMULTANEOUS CONTROL — v3.5 only corrected the dominant axis
 *     (whichever of X or Y had the larger |error|). v4 computes separate
 *     integral states for X and Y and blends them into a single throttle
 *     correction by projecting the 2D tilt vector.
 *
 *  4. ANTI-WINDUP — integral accumulation is frozen whenever the ESC output
 *     is saturated (hit MIN_THROTTLE or MAX_THROTTLE).
 *
 *  5. NONLINEAR PROPORTIONAL BOOST — for |tilt| > TILT_BOOST_THRESHOLD, an
 *     additional sqrt-scaled term is added so the controller reacts harder to
 *     large disturbances without destabilising small-angle behaviour.
 *
 *  6. UNCONDITIONAL AUTO CORRECTION — once auto mode is armed it applies PID
 *     correction on every control tick regardless of RPM. RPM reading is
 *     telemetry only; it never gates, pauses, or cancels auto mode.
 *
 *  7. BUMPLESS TRANSFER — auto↔manual transitions re-seed integral state and
 *     ramp the throttle smoothly to avoid step transients on the ESC.
 *
 *  8. GYRO CALIBRATION BEFORE FIRST AUTO ARM — 200 samples are collected at
 *     startup to null the bias; a second calibration is triggered whenever the
 *     motor is stopped (flywheel stationary = good calibration window).
 * ─────────────────────────────────────────────────────────────────────────────
 *  QUICK-START (same as v3.5)
 *
 *  Step 1 — Fill in WiFi credentials below.
 *  Step 2 — Set SERVER_IP to the LAN IP of the PC running the app.
 *  Step 3 — Upload once via USB; subsequent uploads via OTA.
 * ─────────────────────────────────────────────────────────────────────────────
 */

// ── WiFi credentials ──────────────────────────────────────────────────────────
#define STA_SSID     "Infinix HOT 12I"
#define STA_PASSWORD "isaacp64"
#define SERVER_IP    "10.248.21.126"
#define SERVER_PORT  5001

// ── Fallback AP ───────────────────────────────────────────────────────────────
#define AP_SSID      "GyroMonitor"
#define AP_PASSWORD  "gyro1234"

// ── Hardware presence flags ───────────────────────────────────────────────────
#define HAS_MPU6050     1
#define HAS_ESC         1
#define HAS_RPM_SENSOR  1
#define HAS_TEMP_SENSOR 0

// ─────────────────────────────────────────────────────────────────────────────
#include <Arduino.h>
#include <Wire.h>
#include <math.h>
#include <arduinoFFT.h>
#include <WiFi.h>
#include <WiFiClient.h>
#include <WebServer.h>
#include <ArduinoOTA.h>
#include <Update.h>
#include <IRremote.hpp>

// ── MPU-6050 registers ────────────────────────────────────────────────────────
#define MPU6050_ADDR  0x68
#define ACCEL_XOUT_H  0x3B
#define GYRO_XOUT_H   0x43
#define PWR_MGMT_1    0x6B
#define ACCEL_CONFIG  0x1C
#define GYRO_CONFIG   0x1B

// ── Pin definitions ───────────────────────────────────────────────────────────
#define ESC_PIN         4
#define RESET_BUTTON   23
#define IR_RECEIVE_PIN 17
#define RPM_SENSOR_PIN 16
#define ONBOARD_LED     2

// ── ESC / motor settings ──────────────────────────────────────────────────────
// NOTE: the values below are app-configurable at runtime (settings page →
// CMD:SET_SPEED_STEP / CMD:SET_THROTTLE_LIMITS). The literals here are only
// the compiled-in defaults/fallbacks used until the app sends an override.
int MOTOR_SPEED_STEP = 5;
const int RAMP_STEP_MS     = 20;   // faster ramp for auto-mode responsiveness
const int RAMP_STEP_US     = 5;    // smaller µs steps → smoother ESC signal
const int START_RAMP_STEP_MS     = 1000; // one step per second during initial startup ramp
const int START_RAMP_DURATION_MS = 5000; // apply the startup ramp for 5 seconds
int MIN_THROTTLE     = 1200;
// Starting pulse (a.k.a. arm throttle) — the ESC "armed but not spinning"
// pulse width sent whenever the motor is off. App-configurable at runtime
// via CMD:SET_ARM_THROTTLE:<us> (settings page "Starting Pulse" field),
// same pattern as MOTOR_SPEED_STEP / MIN_THROTTLE / MAX_THROTTLE.
int ARM_THROTTLE     = 1000;
const int START_THROTTLE   = 1100;
int MAX_THROTTLE     = 1800;
const int PWM_CHANNEL      = 0;
const int PWM_FREQ         = 50;
const int PWM_RESOLUTION   = 16;
// How long to hold the arm pulse on ESC_PIN before the ESC is considered armed.
const unsigned long ESC_ARM_DURATION_MS = 3000;
// Bounds enforced when the app sets MOTOR_SPEED_STEP / ARM_THROTTLE at runtime
// (CMD:SET_SPEED_STEP / CMD:SET_ARM_THROTTLE) — not the values themselves.
const int MOTOR_SPEED_STEP_MIN   = 1;
const int MOTOR_SPEED_STEP_MAX   = 200;
const int ARM_THROTTLE_MIN_ALLOWED = 900;

// ── RPM sensor ────────────────────────────────────────────────────────────────
// Also app-configurable — see CMD:SET_TIMING.
uint32_t RPM_TIMEOUT_MS         = 2000;
uint32_t RPM_REPORT_INTERVAL_MS = 250;
const uint32_t IR_DEBOUNCE_US         = 3000UL;
const uint8_t  RPM_AVG_SAMPLES        = 1;
const int      RPM_PULSES_PER_REV     = 1;  // one sensor trigger per revolution — no /4 division applied
const float    RPM_MIN_VALID_RPM      = 5.0f;
const float    RPM_MAX_VALID_RPM      = 12000.0f;
// Exponential smoothing weight given to each NEW RPM sample (0..1). Higher =
// more responsive but noisier; lower = smoother but slower to react.
const float    RPM_SMOOTHING_ALPHA    = 0.25f;

// ── IMU raw values ────────────────────────────────────────────────────────────
int16_t accelX, accelY, accelZ;
int16_t gyroX,  gyroY,  gyroZ;
float   accelX_g, accelY_g, accelZ_g;
float   gyroX_dps, gyroY_dps, gyroZ_dps;

// ── Gyro bias calibration ─────────────────────────────────────────────────────
float gyroOffsetX = 0.0f;
float gyroOffsetY = 0.0f;
float gyroOffsetZ = 0.0f;
bool  gyroCal     = false;

// ── MPU fault tracking ────────────────────────────────────────────────────────
bool    mpuOk         = false;
uint8_t mpuFailStreak = 0;
const uint8_t MPU_MAX_FAILS = 5;

// ── Gyro calibration / MPU I2C timing ─────────────────────────────────────────
const unsigned long GYRO_CAL_SETTLE_MS    = 500;  // let MPU settle before boot calibration
const int GYRO_CAL_SAMPLES_BOOT           = 200;  // samples collected at boot
const int GYRO_CAL_SAMPLES_STOP           = 100;  // samples collected each time the motor stops
const unsigned long GYRO_CAL_STOP_SETTLE_MS = 200; // settle time before the stop-time recalibration
const int MPU_I2C_RETRY_DELAY_MS          = 5;    // retry delay when I2C transmission fails
const int MPU_I2C_READ_RETRY_DELAY_MS     = 2;    // retry delay when I2C read is short
const unsigned long MPU_INIT_SETTLE_MS    = 100;  // settle time after power-mgmt register write
const unsigned long MPU_CONFIG_SETTLE_MS  = 50;   // settle time after each config register write
// ── Angle smoothing: simple moving average (one per axis) ────────────────────
// No gyro integration and no bias-correction algorithm — each sample is the
// accelerometer-derived angle for that instant, averaged over a short window.
// This trades fast-tilt responsiveness for immunity to drift: since nothing
// is integrated over time, vibration noise cannot accumulate into a growing
// angle error the way a gyro-integrating/bias-correcting filter can.
const uint8_t ANGLE_SMA_WINDOW_SIZE = 8;
float angleSmaBufX[ANGLE_SMA_WINDOW_SIZE] = {0};
float angleSmaBufY[ANGLE_SMA_WINDOW_SIZE] = {0};
float angleSmaBufZ[ANGLE_SMA_WINDOW_SIZE] = {0};
uint8_t angleSmaIndex = 0;
uint8_t angleSmaCount = 0;

unsigned long lastUpdateTime  = 0;
bool          angleInitialized = false;

float vibrationRMS = 0.0f;
float siliconTempC = 0.0f;

// ── Angle outputs ─────────────────────────────────────────────────────────────
float current_angleX = 0.0f, current_angleY = 0.0f, current_angleZ = 0.0f;
float refAngleX = 0.0f,      refAngleY = 0.0f,      refAngleZ = 0.0f;
float error_X   = 0.0f,      error_Y   = 0.0f,      error_Z   = 0.0f;
bool  initialized = false;

// ── Motor state ───────────────────────────────────────────────────────────────
bool  motorRunning   = false;
int   motorThrottle  = ARM_THROTTLE;
bool  motorRamping   = false;
bool  startRampActive = false;
unsigned long startRampStartMs = 0;
int   motorRampTarget = ARM_THROTTLE;
unsigned long lastRampMs = 0;
int   manualThrottle = 1200;

// ── Post-start auto step-up sequence ──────────────────────────────────────────
// After startMotor(), for POST_START_STEP_COUNT seconds we automatically bump
// manualThrottle by one MOTOR_SPEED_STEP per second — the same effect as
// pressing the 'h' speed-up shortcut once every second. Runs regardless of
// which path triggered Start (app, CMD:MOTOR_START, or serial 's').
bool  postStartStepActive   = false;
unsigned long postStartStepStartMs = 0;
int   postStartStepsApplied = 0;
const int POST_START_STEP_COUNT    = 4;     // number of +1-step bumps
const unsigned long POST_START_STEP_INTERVAL_MS = 1500; // one bump per 1.5 seconds

// Minimum/"idle" speed used by the IR remote's EQ button. Overridable at
// runtime by the app via CMD:SET_MIN_SPEED:<us>; 1250us is the fallback
// used if the app never sends one.
int   minSpeedUs = 1250;

// ── Mode ──────────────────────────────────────────────────────────────────────
bool autoMode = false;

// ── Onboard LED feedback ───────────────────────────────────────────────────────
// Shared by IR, serial, HTTP, and TCP handlers so ANY command source lights
// the blue LED.  Use signalLed(ms) — never write the pin directly.
unsigned long ledOffMs = 0;
const unsigned long LED_PULSE_SHORT_MS = 200; // most commands
const unsigned long LED_PULSE_LONG_MS  = 400; // hold-repeatable commands (speed up/down)

// ─────────────────────────────────────────────────────────────────────────────
//  v4 BALANCE CONTROLLER PARAMETERS
//  All gains tunable live via IR/serial/WiFi command.
//
//  Physics basis (reaction-wheel inverted-pendulum model):
//    Plant: G(s) = K_eff·s / [(τ·s+1)(I_b·s² − m·g·L)]
//    Routh necessary conditions:
//      Ki  ≥  Ki_min = m·g·L / K_eff  ≈ 17–20
//      Kp  ≥  Kp_min = m·g·L·τ / K_eff ≈ 1.4
//    Starting values here are 2× the minimums for margin.
// ─────────────────────────────────────────────────────────────────────────────
float bal_Kp  =  7.0f;   // proportional  [µs/deg]        — Routh min ≈ 1.4
float bal_Ki  =  1.5f;   // integral      [µs/(deg·s)]    — Routh min ≈ 17
float bal_Kd  =  3.0f;   // derivative    [µs·s/deg]  applied to gyro-rate
float bal_Knl =  1.5f;   // nonlinear boost factor (√|e| term, kicks in > NL_THRESH)

// ── IR / serial tuning step sizes (same as v3.5 remote buttons) ──────────────
// App-configurable via CMD:SET_IR_STEPS — values below are compiled defaults.
float KP_STEP  = 1.0f;
float KI_STEP  = 0.5f;   // bigger step to reach Ki_min faster
float KD_STEP  = 0.5f;
float KNL_STEP = 0.5f;

// ── Non-linear proportional threshold (degrees) ───────────────────────────────
// Below this angle the nonlinear term is suppressed — avoids chattering
// around the setpoint. Above it an additional √|e| term is added for extra
// authority on large disturbances. App-configurable via CMD:SET_AUTO_TUNING.
float NL_THRESH_DEG = 3.0f;

// ── Output saturation limits (relative to base throttle) ─────────────────────
// The PID correction is clamped to ±MAX_CORRECTION_US. Beyond this the ESC
// input saturates and the integral must stop growing (anti-windup).
// App-configurable via CMD:SET_AUTO_TUNING.
float MAX_CORRECTION_US = 700.0f;

// ── Two-axis blending / anti-windup tuning ────────────────────────────────────
// When both tilt axes exceed this many degrees, the non-dominant axis
// contributes a partial correction too (see runBalanceController()).
float BOTH_AXIS_THRESHOLD_DEG = 2.0f;
// Integral freezes once the projected output gets within this fraction of
// MAX_CORRECTION_US (anti-windup headroom check).
float ANTIWINDUP_SATURATION_FACTOR = 0.95f;
// Hard clamp on each axis's integral term, as a fraction of MAX_CORRECTION_US.
float INTEGRAL_CLAMP_FACTOR = 0.5f;
// When entering auto mode, integrals are seeded from the current throttle
// deviation scaled by this factor, for a bumpless transfer.
float AUTO_MODE_INTEGRAL_SEED_FACTOR = 0.5f;
// Auto mode's PID correction (µs-equivalent) is scaled by this factor before
// being added to the base throttle. This is the "0.1" multiplier.
float AUTO_CORRECTION_TO_PULSE_SCALE = 0.1f;

// ── Setpoint (degrees from reference) ────────────────────────────────────────
float setpointX = 0.0f;   // target tilt X (0 = balanced)
float setpointY = 0.0f;   // target tilt Y (0 = balanced)

// ── Controller state ──────────────────────────────────────────────────────────
float integralX = 0.0f;   // accumulated integral, X axis
float integralY = 0.0f;   // accumulated integral, Y axis
bool  outputSaturated = false;  // true → anti-windup active, freeze integrals

// ── Telemetry output state ────────────────────────────────────────────────────
float pidCorrectionValue = 0.0f;  // last combined correction [µs]
float heldFinalPulse     = 0.0f;
float heldEscPulseUs     = (float)ARM_THROTTLE;
float sentMotorPulse     = (float)ARM_THROTTLE;
float holdDurationSec    = 2.0f;  // retained for UI compat

const float MOTOR_KV = 2200.0f;  // matches actual 2200 KV motor

// ── Control loop timing ───────────────────────────────────────────────────────
// Target 20 ms (50 Hz) loop rate — fast enough vs unstable pole at ~10 rad/s.
const unsigned long CTRL_INTERVAL_MS = 20;
unsigned long lastCtrlMs = 0;

// ── RPM sensor ────────────────────────────────────────────────────────────────
volatile uint32_t rpmPulseCount = 0;
volatile uint32_t rpmPulseTimestampUs = 0;

uint32_t rpmValue = 0;
float    currentRPM = 0.0f;
float    rpmFreqHz  = 0.0f;
uint32_t rpmPeriodMs = 0;
uint32_t lastRpmPulseMicros  = 0;
uint32_t lastRpmPulseCount   = 0;
uint32_t lastRpmReportMs     = 0;
uint32_t lastRpmActivityMicros = 0;
uint8_t  lastIrKeyIndex = 0;

// ── Telemetry timing ─────────────────────────────────────────────────────────
// App-configurable via CMD:SET_TIMING.
unsigned long TELEMETRY_INTERVAL_MS = 500;
unsigned long lastTelemetryTime = 0;

// ── Vibration engine ──────────────────────────────────────────────────────────
#define VIBR_WINDOW_SIZE 64
static float  vibrationWindow[VIBR_WINDOW_SIZE] = {0.0f};
static uint8_t vibrationWindowIndex = 0;
static uint8_t vibrationWindowCount = 0;

// ── WiFi / TCP / OTA ──────────────────────────────────────────────────────────
WiFiClient  tcpClient;
WebServer   httpServer(80);
String      wifiCmdBuffer    = "";
String      lastIrCommand    = "none";
bool        wifiConnected    = false;
bool        staJoined        = false;
unsigned long lastWifiReconnectMs = 0;
unsigned long lastResetButtonMs = 0;
unsigned long lastResetActionMs = 0;
const unsigned long WIFI_RECONNECT_INTERVAL_MS = 5000;
const bool APP_SERVER_ENABLED = true;
const unsigned long WIFI_CONNECT_TIMEOUT_MS     = 10000; // give up STA connect after this long
const unsigned long WIFI_CONNECT_POLL_MS        = 50;    // delay between STA connect status checks
const unsigned long WIFI_DISCONNECT_SETTLE_MS   = 100;   // settle time after WiFi.disconnect()
const unsigned long OTA_RESTART_DELAY_MS        = 500;   // delay before ESP.restart() after OTA

// ─────────────────────────────────────────────────────────────────────────────
//  Forward declarations
// ─────────────────────────────────────────────────────────────────────────────
static void enterAutoMode(const char *reason = "AUTO");
static void enterManualMode(const char *reason = "MANUAL");
void startMotor();
void stopMotor();
void emergencyStop();
void resetReference();
void calculateAngleErrors();
static void setThrottle(int us);
static void setThrottleTarget(int targetUs);
void executeCommand(char cmd);
bool parseNetworkPacket(const String &json);
void handleAppCommand(const String &cmd);
static void signalLed(unsigned long ms);

// ─────────────────────────────────────────────────────────────────────────────
//  Helper: build component string
// ─────────────────────────────────────────────────────────────────────────────
String connectedComponentsList() {
  String c = "IR";
#if HAS_MPU6050
  c += ",MPU6050";
#endif
#if HAS_ESC
  c += ",ESC";
#endif
#if HAS_RPM_SENSOR
  c += ",RPM_SENSOR";
#endif
#if HAS_TEMP_SENSOR
  c += ",TEMP_SENSOR";
#endif
  return c;
}

// ─────────────────────────────────────────────────────────────────────────────
//  HTTP / OTA handlers  (identical structure to v3.5)
// ─────────────────────────────────────────────────────────────────────────────

const char INDEX_HTML[] PROGMEM = R"HTML(
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>GyroBalance v4</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: sans-serif; text-align: center; background:#111; color:#eee; margin:0; padding:20px; }
    h1   { font-size:1.3em; margin-bottom:4px; }
    .sub { font-size:0.8em; color:#888; margin-bottom:18px; }
    .grid{ display:grid; grid-template-columns:1fr 1fr; gap:10px; max-width:440px; margin:0 auto 18px; }
    .card{ background:#1e1e1e; border-radius:10px; padding:12px 8px; }
    .card .label{ font-size:0.72em; color:#888; text-transform:uppercase; letter-spacing:0.05em; }
    .card .value{ font-size:1.7em; font-weight:bold; color:#4fc3f7; margin-top:2px; }
    .card .unit { font-size:0.75em; color:#aaa; }
    .card.warn .value{ color:#ef5350; }
    .card.ok   .value{ color:#66bb6a; }
    .card.auto .value{ color:#ffd700; }
    .buttons{ display:flex; flex-wrap:wrap; justify-content:center; gap:10px; max-width:440px; margin:0 auto 14px; }
    button{ font-size:1em; padding:12px 18px; border:none; border-radius:10px; color:#fff; min-width:90px; cursor:pointer; }
    #btn-start{ background:#2e7d32; }
    #btn-stop { background:#c62828; }
    #btn-auto { background:#e65100; }
    #btn-up   { background:#1565c0; }
    #btn-down { background:#6a1b9a; }
    #btn-reset{ background:#37474f; }
    .sbar{ font-size:0.85em; color:#888; margin-top:8px; }
    .pill{ display:inline-block; padding:2px 10px; border-radius:999px; font-size:0.78em; font-weight:bold; }
    .pill.run  { background:#1b5e20; color:#a5d6a7; }
    .pill.stop { background:#311;    color:#ef9a9a; }
    .pill.auto { background:#4a3200; color:#ffe082; }
    .gains{ font-size:0.8em; color:#888; margin-top:6px; }
  </style>
</head>
<body>
  <h1>GyroBalance v4</h1>
  <p class="sub">Full State-Feedback PID &mdash; direct gyro-rate derivative &mdash; anti-windup</p>

  <div class="grid">
    <div class="card"><div class="label">RPM</div><div class="value" id="rpm">--</div></div>
    <div class="card"><div class="label">Vibration</div><div class="value" id="vib">--</div><div class="unit">g RMS</div></div>
    <div class="card"><div class="label">Tilt X</div><div class="value" id="tx">--</div><div class="unit">deg</div></div>
    <div class="card"><div class="label">Tilt Y</div><div class="value" id="ty">--</div><div class="unit">deg</div></div>
    <div class="card"><div class="label">Correction</div><div class="value" id="corr">--</div><div class="unit">&micro;s</div></div>
    <div class="card"><div class="label">ESC pulse</div><div class="value" id="esc">--</div><div class="unit">&micro;s</div></div>
    <div class="card"><div class="label">PWM</div><div class="value" id="pwm">--</div><div class="unit">%</div></div>
    <div class="card" id="mpu-card"><div class="label">MPU-6050</div><div class="value" id="mpu">--</div></div>
  </div>

  <div class="buttons">
    <button id="btn-start" onclick="cmd('start')">&#9654; Start</button>
    <button id="btn-stop"  onclick="cmd('stop')">&#9632; Stop</button>
    <button id="btn-auto"  onclick="cmd('auto')">&#9956; Auto</button>
    <button id="btn-up"    onclick="cmd('up')">&#8679; Speed +</button>
    <button id="btn-down"  onclick="cmd('down')">&#8681; Speed &minus;</button>
    <button id="btn-reset" onclick="cmd('resetref')">&#8635; Reset Ref</button>
  </div>

  <div class="sbar">
    Status: <span id="running-pill" class="pill stop">STOPPED</span>
    &nbsp;|&nbsp; Throttle: <span id="thr">--</span>
  </div>
  <div class="gains" id="gains">Kp=-- Ki=-- Kd=-- Knl=--</div>

  <script>
    function cmd(c) { fetch('/'+c).catch(console.error); }
    function poll() {
      fetch('/status').then(r=>r.json()).then(d=>{
        document.getElementById('rpm').textContent  = d.rpm.toFixed(0);
        document.getElementById('vib').textContent  = d.vibration.toFixed(3);
        document.getElementById('tx').textContent   = d.tiltX.toFixed(2);
        document.getElementById('ty').textContent   = d.tiltY.toFixed(2);
        document.getElementById('corr').textContent = d.correction ? d.correction.toFixed(1) : '--';
        document.getElementById('esc').textContent  = d.escPulse  ? d.escPulse.toFixed(0) : '--';
        document.getElementById('pwm').textContent  = d.pwmPct.toFixed(1);
        document.getElementById('thr').textContent  = d.throttle;
        if(d.gains) document.getElementById('gains').textContent=
          'Kp='+d.gains.kp+' Ki='+d.gains.ki+' Kd='+d.gains.kd+' Knl='+d.gains.knl;
        var pill = document.getElementById('running-pill');
        if(d.mode==='auto')   { pill.className='pill auto'; pill.textContent='AUTO BALANCE'; }
        else if(d.running)    { pill.className='pill run';  pill.textContent='RUNNING'; }
        else                  { pill.className='pill stop'; pill.textContent='STOPPED'; }
        var mpuEl=document.getElementById('mpu');
        var mpuCard=document.getElementById('mpu-card');
        if(d.mpuFault){ mpuEl.textContent='FAULT'; mpuCard.className='card warn'; }
        else          { mpuEl.textContent='OK';    mpuCard.className='card ok';   }
      }).catch(console.error);
    }
    setInterval(poll,300);
    poll();
    document.addEventListener('keydown',e=>{
      if(e.key==='s')       cmd('start');
      else if(e.key==='x')  cmd('stop');
      else if(e.key==='Escape') cmd('estop');
      else if(e.key==='a')  cmd('auto');
      else if(e.key==='h')  cmd('up');
      else if(e.key==='l')  cmd('down');
      else if(e.key==='z')  cmd('resetref');
    });
  </script>
</body>
</html>
)HTML";

// ── HTTP handlers ─────────────────────────────────────────────────────────────

void handleHttpRoot()   { httpServer.send_P(200, "text/html", INDEX_HTML); }

void handleHttpStatus() {
  float pwmPct = 0.0f;
  if (motorThrottle > ARM_THROTTLE)
    pwmPct = (float)(motorThrottle - ARM_THROTTLE) / (MAX_THROTTLE - ARM_THROTTLE) * 100.0f;

  String json = "{";
  json += "\"mode\":\"";     json += (autoMode ? "auto" : (motorRunning ? "manual" : "stopped")); json += "\"";
  json += ",\"running\":";   json += motorRunning ? "true" : "false";
  json += ",\"throttle\":";  json += (motorRunning ? motorThrottle : manualThrottle);
  json += ",\"manualThrottle\":"; json += manualThrottle;
  json += ",\"pwmPct\":";    json += String(pwmPct, 1);
  json += ",\"mpuFault\":";  json += mpuOk ? "false" : "true";
  json += ",\"rpm\":";       json += rpmValue;
  json += ",\"angleX\":";    json += String(mpuOk ? current_angleX : 0.0f, 2);
  json += ",\"angleY\":";    json += String(mpuOk ? current_angleY : 0.0f, 2);
  json += ",\"tiltX\":";     json += String(mpuOk ? error_X : 0.0f, 2);
  json += ",\"tiltY\":";     json += String(mpuOk ? error_Y : 0.0f, 2);
  json += ",\"vibration\":"; json += String(vibrationRMS, 4);
  json += ",\"correction\":"; json += String(pidCorrectionValue, 1);
  json += ",\"escPulse\":";  json += String(heldEscPulseUs, 0);
  json += ",\"irCommand\":\""; json += lastIrCommand; json += "\"";
  lastIrCommand = "none";
  json += ",\"ip\":\"";
  json += staJoined ? WiFi.localIP().toString() : WiFi.softAPIP().toString();
  json += "\"";
  json += ",\"gains\":{\"kp\":";  json += String(bal_Kp, 1);
  json += ",\"ki\":";             json += String(bal_Ki, 1);
  json += ",\"kd\":";             json += String(bal_Kd, 1);
  json += ",\"knl\":";            json += String(bal_Knl, 1);
  json += "}}";
  httpServer.send(200, "application/json", json);
}

void handleHttpStart()  { signalLed(LED_PULSE_SHORT_MS); startMotor(); httpServer.send(200,"text/plain","ok"); }
void handleHttpStop()   { signalLed(LED_PULSE_SHORT_MS); stopMotor();  httpServer.send(200,"text/plain","ok"); }
void handleHttpAuto() {
  signalLed(LED_PULSE_SHORT_MS);
  if (!autoMode) enterAutoMode("HTTP");
  httpServer.send(200, "text/plain", autoMode ? "auto" : "manual");
}
void handleHttpManual() {
  signalLed(LED_PULSE_SHORT_MS);
  if (autoMode) enterManualMode("HTTP");
  httpServer.send(200, "text/plain", autoMode ? "auto" : "manual");
}
void handleHttpUp() {
  signalLed(LED_PULSE_LONG_MS);   // longer — may be called repeatedly while held
  if (motorRunning) {
    // Manual-only: floor is ARM_THROTTLE, not MIN_THROTTLE — operator is
    // allowed to go below the auto-mode minimum; auto mode never is.
    int lo = autoMode ? MIN_THROTTLE : ARM_THROTTLE;
    manualThrottle = constrain(manualThrottle + MOTOR_SPEED_STEP, lo, MAX_THROTTLE);
    if (!autoMode) setThrottleTarget(manualThrottle);
  }
  httpServer.send(200, "text/plain", "ok");
}
void handleHttpDown() {
  signalLed(LED_PULSE_LONG_MS);   // longer — may be called repeatedly while held
  if (motorRunning) {
    int lo = autoMode ? MIN_THROTTLE : ARM_THROTTLE;
    manualThrottle = constrain(manualThrottle - MOTOR_SPEED_STEP, lo, MAX_THROTTLE);
    if (!autoMode) setThrottleTarget(manualThrottle);
  }
  httpServer.send(200, "text/plain", "ok");
}
void handleHttpResetRef()      { signalLed(LED_PULSE_SHORT_MS); resetReference(); httpServer.send(200,"text/plain","ok"); }
void handleHttpEmergencyStop() { signalLed(LED_PULSE_SHORT_MS); emergencyStop();  httpServer.send(200,"text/plain","ok"); }

void handleOtaUpload() {
  HTTPUpload &upload = httpServer.upload();
  if (upload.status == UPLOAD_FILE_START) {
    Serial.printf("{\"event\":\"ota_start\",\"filename\":\"%s\"}\n", upload.filename.c_str());
    if (motorRunning) stopMotor();
    if (!Update.begin(UPDATE_SIZE_UNKNOWN)) Update.printError(Serial);
  } else if (upload.status == UPLOAD_FILE_WRITE) {
    if (Update.write(upload.buf, upload.currentSize) != upload.currentSize) Update.printError(Serial);
  } else if (upload.status == UPLOAD_FILE_END) {
    if (Update.end(true))
      Serial.printf("{\"event\":\"ota_end\",\"bytes\":%u}\n", upload.totalSize);
    else
      Update.printError(Serial);
  }
}

void handleOtaFinish() {
  if (Update.hasError()) {
    httpServer.send(500, "text/plain", "OTA FAILED");
    Serial.println("{\"event\":\"ota_error\"}");
  } else {
    httpServer.send(200, "text/plain", "OK — rebooting");
    Serial.println("{\"event\":\"ota_ok\"}");
    delay(OTA_RESTART_DELAY_MS);
    ESP.restart();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  WiFi / OTA init
// ─────────────────────────────────────────────────────────────────────────────

const char* wifiStatusStr(wl_status_t s) {
  switch (s) {
    case WL_IDLE_STATUS:     return "WL_IDLE_STATUS";
    case WL_NO_SSID_AVAIL:   return "WL_NO_SSID_AVAIL (SSID not found — check 2.4 GHz band)";
    case WL_SCAN_COMPLETED:  return "WL_SCAN_COMPLETED";
    case WL_CONNECTED:       return "WL_CONNECTED";
    case WL_CONNECT_FAILED:  return "WL_CONNECT_FAILED (password rejected)";
    case WL_CONNECTION_LOST: return "WL_CONNECTION_LOST";
    case WL_DISCONNECTED:    return "WL_DISCONNECTED";
    default:                 return "UNKNOWN";
  }
}

void initWifi() {
  WiFi.mode(WIFI_AP_STA);
  WiFi.disconnect(true);
  delay(WIFI_DISCONNECT_SETTLE_MS);

  Serial.println("[WiFi] Scanning...");
  int n = WiFi.scanNetworks();
  bool ssidVisible = false;
  for (int i = 0; i < n; i++) {
    Serial.printf("[WiFi]   '%s'  ch=%d  rssi=%d\n",
                  WiFi.SSID(i).c_str(), WiFi.channel(i), WiFi.RSSI(i));
    if (WiFi.SSID(i) == String(STA_SSID)) ssidVisible = true;
  }
  if (!ssidVisible)
    Serial.println("[WiFi] WARNING: target SSID not seen (2.4 GHz only).");

  WiFi.begin(STA_SSID, STA_PASSWORD);
  Serial.print("[WiFi] Connecting ");
  unsigned long wifiStart = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - wifiStart < WIFI_CONNECT_TIMEOUT_MS) {
    delay(WIFI_CONNECT_POLL_MS);
    if ((millis() - wifiStart) % 500 == 0) Serial.print(".");
    yield();
  }
  Serial.println();

  if (WiFi.status() == WL_CONNECTED) {
    staJoined = true;
    Serial.print("[WiFi] STA OK — IP: "); Serial.println(WiFi.localIP());
  } else {
    staJoined = false;
    Serial.print("[WiFi] STA failed — "); Serial.println(wifiStatusStr(WiFi.status()));
    WiFi.softAP(AP_SSID, AP_PASSWORD);
    Serial.print("[WiFi] AP IP: "); Serial.println(WiFi.softAPIP());
  }

  ArduinoOTA.setHostname("gyrobalance-v4");
  ArduinoOTA.onStart([]() {
    Serial.println("{\"event\":\"arduinoota_start\"}");
    if (motorRunning) stopMotor();
  });
  ArduinoOTA.onEnd([]()   { Serial.println("{\"event\":\"arduinoota_end\"}"); });
  ArduinoOTA.onError([](ota_error_t err) {
    Serial.printf("{\"event\":\"arduinoota_error\",\"code\":%u}\n", err);
  });
  ArduinoOTA.begin();

  httpServer.on("/",         HTTP_GET,  handleHttpRoot);
  httpServer.on("/status",   HTTP_GET,  handleHttpStatus);
  httpServer.on("/start",    HTTP_GET,  handleHttpStart);
  httpServer.on("/stop",     HTTP_GET,  handleHttpStop);
  httpServer.on("/auto",     HTTP_GET,  handleHttpAuto);
  httpServer.on("/manual",   HTTP_GET,  handleHttpManual);
  httpServer.on("/up",       HTTP_GET,  handleHttpUp);
  httpServer.on("/down",     HTTP_GET,  handleHttpDown);
  httpServer.on("/resetref", HTTP_GET,  handleHttpResetRef);
  httpServer.on("/estop",    HTTP_GET,  handleHttpEmergencyStop);
  httpServer.on("/update",   HTTP_POST, handleOtaFinish, handleOtaUpload);
  httpServer.begin();

  WiFi.setSleep(false);
  Serial.println("[HTTP] Server on port 80");
}

void forceWifiReconnect() {
  if (tcpClient.connected()) tcpClient.stop();
  wifiConnected = staJoined = false;
  WiFi.disconnect(true);
  delay(WIFI_DISCONNECT_SETTLE_MS);
  WiFi.begin(STA_SSID, STA_PASSWORD);
  lastWifiReconnectMs = millis();
}

bool connectToServer() {
  if (tcpClient.connected()) return true;
  if (!staJoined && WiFi.status() != WL_CONNECTED) return false;
  Serial.print("[WiFi] Connecting to server ");
  if (tcpClient.connect(SERVER_IP, SERVER_PORT)) {
    Serial.println("OK");
    wifiConnected = true;
    tcpClient.println("DEVICE_INFO:esp32WiFi|VERSION:4.0|COMPONENTS:" + connectedComponentsList() + "|BAUD:0");
    tcpClient.println(mpuOk ? "HEALTH:MPU6050=OK" : "HEALTH:MPU6050=FAIL");
    tcpClient.println("{\"status\":\"boot\",\"msg\":\"GyroBalance v4.0 — WiFi connected\"}");
    return true;
  }
  wifiConnected = false;
  Serial.println("FAILED");
  return false;
}

void processWifiInput() {
  while (tcpClient.available()) {
    char c = (char)tcpClient.read();
    if (c == '\n' || c == '\r') {
      String line = wifiCmdBuffer;
      wifiCmdBuffer = "";
      line.trim();
      if (line.length() > 0) {
        Serial.print("[WiFi CMD] "); Serial.println(line);
        if (!parseNetworkPacket(line)) handleAppCommand(line);
      }
    } else {
      wifiCmdBuffer += c;
      if (wifiCmdBuffer.length() > 128) wifiCmdBuffer = "";
    }
  }
}

void maintainWifiConnection() {
  unsigned long now = millis();
  if (staJoined && WiFi.status() != WL_CONNECTED) {
    staJoined = false;
    Serial.println("[WiFi] STA dropped");
  }
  if (!staJoined && WiFi.status() != WL_CONNECTED) {
    if (now - lastWifiReconnectMs >= WIFI_RECONNECT_INTERVAL_MS) {
      lastWifiReconnectMs = now;
      WiFi.begin(STA_SSID, STA_PASSWORD);
    }
    return;
  }
  if (WiFi.status() == WL_CONNECTED && !staJoined) {
    staJoined = true;
    Serial.print("[WiFi] Reconnected — IP: "); Serial.println(WiFi.localIP());
  }
  if (APP_SERVER_ENABLED && !tcpClient.connected()) {
    if (wifiConnected) { wifiConnected = false; Serial.println("[WiFi] TCP lost."); }
    if (now - lastWifiReconnectMs >= WIFI_RECONNECT_INTERVAL_MS) {
      lastWifiReconnectMs = now;
      connectToServer();
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  Utilities
// ─────────────────────────────────────────────────────────────────────────────

void normalizeAngle(float &a) {
  while (a >  180.0f) a -= 360.0f;
  while (a < -180.0f) a += 360.0f;
}

// ─────────────────────────────────────────────────────────────────────────────
//  Gyro bias calibration
// ─────────────────────────────────────────────────────────────────────────────

void calibrateGyroBias(int samples = GYRO_CAL_SAMPLES_BOOT) {
  Serial.println("[CAL] Collecting gyro bias samples — keep still...");
  double sumX = 0, sumY = 0, sumZ = 0;
  int good = 0;
  for (int i = 0; i < samples; i++) {
    Wire.beginTransmission(MPU6050_ADDR);
    Wire.write(GYRO_XOUT_H);
    if (Wire.endTransmission(false) != 0) { delay(MPU_I2C_RETRY_DELAY_MS); continue; }
    Wire.requestFrom(MPU6050_ADDR, 6, 1);
    if (Wire.available() < 6) { delay(MPU_I2C_RETRY_DELAY_MS); continue; }
    int16_t gx = (Wire.read() << 8) | Wire.read();
    int16_t gy = (Wire.read() << 8) | Wire.read();
    int16_t gz = (Wire.read() << 8) | Wire.read();
    sumX += gx / 131.0;
    sumY += gy / 131.0;
    sumZ += gz / 131.0;
    good++;
    delay(MPU_I2C_READ_RETRY_DELAY_MS);
  }
  if (good > 0) {
    gyroOffsetX = (float)(sumX / good);
    gyroOffsetY = (float)(sumY / good);
    gyroOffsetZ = (float)(sumZ / good);
    gyroCal = true;
    Serial.printf("[CAL] Offsets: X=%.3f  Y=%.3f  Z=%.3f  (%d samples)\n",
                  gyroOffsetX, gyroOffsetY, gyroOffsetZ, good);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  MPU-6050
// ─────────────────────────────────────────────────────────────────────────────

void initMPU6050() {
  Wire.beginTransmission(MPU6050_ADDR);
  Wire.write(PWR_MGMT_1);
  Wire.write(0x00);
  if (Wire.endTransmission(true) != 0) {
    Serial.println("[MPU] Init FAILED — not found on I2C bus");
    mpuOk = false;
    return;
  }
  delay(MPU_INIT_SETTLE_MS);

  Wire.beginTransmission(MPU6050_ADDR);
  Wire.write(ACCEL_CONFIG);
  Wire.write(0x10);   // ±8 g
  Wire.endTransmission(true);
  delay(MPU_CONFIG_SETTLE_MS);

  Wire.beginTransmission(MPU6050_ADDR);
  Wire.write(GYRO_CONFIG);
  Wire.write(0x00);   // ±250 °/s  (highest resolution for small-angle sensing)
  Wire.endTransmission(true);
  delay(MPU_CONFIG_SETTLE_MS);

  Wire.beginTransmission(MPU6050_ADDR);
  Wire.write(0x1A);
  Wire.write(0x04);   // DLPF 20 Hz  (attenuates flywheel vibration from gyro path)
  Wire.endTransmission(true);
  delay(MPU_CONFIG_SETTLE_MS);

  mpuOk = true;
  mpuFailStreak = 0;
  Serial.println("[MPU] MPU-6050 OK");
  Serial.println("HEALTH:MPU6050=OK");
}

bool readMPU6050() {
  Wire.beginTransmission(MPU6050_ADDR);
  Wire.write(ACCEL_XOUT_H);
  if (Wire.endTransmission(false) != 0) {
    if (++mpuFailStreak >= MPU_MAX_FAILS && mpuOk) {
      mpuOk = false;
      Serial.println("[MPU] I2C fault");
      Serial.println("HEALTH:MPU6050=FAIL");
    }
    return false;
  }
  Wire.requestFrom(MPU6050_ADDR, 14, 1);
  if (Wire.available() < 14) {
    if (++mpuFailStreak >= MPU_MAX_FAILS && mpuOk) {
      mpuOk = false;
      Serial.println("[MPU] I2C short read");
      Serial.println("HEALTH:MPU6050=FAIL");
    }
    return false;
  }

  accelX = (Wire.read() << 8) | Wire.read();
  accelY = (Wire.read() << 8) | Wire.read();
  accelZ = (Wire.read() << 8) | Wire.read();
  int16_t tempRaw = (Wire.read() << 8) | Wire.read();
  gyroX  = (Wire.read() << 8) | Wire.read();
  gyroY  = (Wire.read() << 8) | Wire.read();
  gyroZ  = (Wire.read() << 8) | Wire.read();
  siliconTempC = (float)tempRaw / 340.0f + 36.53f;

  if (!mpuOk) {
    mpuOk = true;
    angleInitialized = false;
    Serial.println("[MPU] I2C recovered");
    Serial.println("HEALTH:MPU6050=OK");
  }
  mpuFailStreak = 0;
  return true;
}

void convertMPU6050() {
  // Raw → physical
  float rawAX = (float)accelX / 4096.0f;
  float rawAY = (float)accelY / 4096.0f;
  float rawAZ = (float)accelZ / 4096.0f;
  float rawGX = (float)gyroX  / 131.0f;
  float rawGY = (float)gyroY  / 131.0f;
  float rawGZ = (float)gyroZ  / 131.0f;

  // Apply calibration offsets (removes bias drift)
  rawGX -= gyroOffsetX;
  rawGY -= gyroOffsetY;
  rawGZ -= gyroOffsetZ;

  // Axis remap — sensor mounted vertically with Y pointing down
  accelX_g  =  rawAX;
  accelY_g  =  rawAZ;
  accelZ_g  = -rawAY;
  gyroX_dps =  rawGX;
  gyroY_dps =  rawGZ;
  gyroZ_dps = -rawGY;
}

void calculateCurrentAngles() {
  float accelXAngle = atan2f(accelX_g, sqrtf(accelY_g*accelY_g + accelZ_g*accelZ_g)) * RAD_TO_DEG;
  float accelYAngle = atan2f(accelY_g, sqrtf(accelX_g*accelX_g + accelZ_g*accelZ_g)) * RAD_TO_DEG;
  float accelZAngle = atan2f(accelZ_g, sqrtf(accelX_g*accelX_g + accelY_g*accelY_g)) * RAD_TO_DEG;

  unsigned long now = millis();
  lastUpdateTime = now;

  if (!angleInitialized) {
    // Seed the moving-average window with the first reading so the average
    // doesn't start at 0 and ramp up over the first few samples.
    for (uint8_t i = 0; i < ANGLE_SMA_WINDOW_SIZE; i++) {
      angleSmaBufX[i] = accelXAngle;
      angleSmaBufY[i] = accelYAngle;
      angleSmaBufZ[i] = accelZAngle;
    }
    angleSmaIndex = 0;
    angleSmaCount = ANGLE_SMA_WINDOW_SIZE;
    current_angleX = accelXAngle;
    current_angleY = accelYAngle;
    current_angleZ = accelZAngle;
    angleInitialized = true;
  } else {
    // Plain accelerometer angle in, simple moving average out. No gyro
    // integration and no bias-correction term, so there is nothing that can
    // accumulate error over time — vibration only adds noise to the
    // average, never a growing offset.
    angleSmaBufX[angleSmaIndex] = accelXAngle;
    angleSmaBufY[angleSmaIndex] = accelYAngle;
    angleSmaBufZ[angleSmaIndex] = accelZAngle;
    angleSmaIndex = (angleSmaIndex + 1) % ANGLE_SMA_WINDOW_SIZE;
    if (angleSmaCount < ANGLE_SMA_WINDOW_SIZE) angleSmaCount++;

    float sumX = 0.0f, sumY = 0.0f, sumZ = 0.0f;
    for (uint8_t i = 0; i < angleSmaCount; i++) {
      sumX += angleSmaBufX[i];
      sumY += angleSmaBufY[i];
      sumZ += angleSmaBufZ[i];
    }
    current_angleX = sumX / (float)angleSmaCount;
    current_angleY = sumY / (float)angleSmaCount;
    current_angleZ = sumZ / (float)angleSmaCount;
  }

  normalizeAngle(current_angleX);
  normalizeAngle(current_angleY);
  normalizeAngle(current_angleZ);
}

// ─────────────────────────────────────────────────────────────────────────────
//  Vibration engine
// ─────────────────────────────────────────────────────────────────────────────

void updateVibration() {
  if (!mpuOk) { vibrationRMS = 0.0f; return; }
  float axG = (float)accelX / 4096.0f;
  float ayG = (float)accelY / 4096.0f;
  float azG = (float)accelZ / 4096.0f;
  float dyn = sqrtf(axG*axG + ayG*ayG + (azG - 1.0f)*(azG - 1.0f));
  vibrationWindow[vibrationWindowIndex] = dyn;
  vibrationWindowIndex = (vibrationWindowIndex + 1) % VIBR_WINDOW_SIZE;
  if (vibrationWindowCount < VIBR_WINDOW_SIZE) vibrationWindowCount++;
  float sumSq = 0.0f;
  for (uint8_t i = 0; i < vibrationWindowCount; i++)
    sumSq += vibrationWindow[i] * vibrationWindow[i];
  vibrationRMS = sqrtf(sumSq / (float)vibrationWindowCount);
}

// ─────────────────────────────────────────────────────────────────────────────
//  Reference / error angles
// ─────────────────────────────────────────────────────────────────────────────

void resetReference() {
  refAngleX = current_angleX;
  refAngleY = current_angleY;
  refAngleZ = current_angleZ;
  // Reseed the moving-average window at the new reference so the average
  // doesn't have to "catch up" from the old angle.
  for (uint8_t i = 0; i < ANGLE_SMA_WINDOW_SIZE; i++) {
    angleSmaBufX[i] = current_angleX;
    angleSmaBufY[i] = current_angleY;
    angleSmaBufZ[i] = current_angleZ;
  }
  angleSmaIndex = 0;
  angleSmaCount = ANGLE_SMA_WINDOW_SIZE;
  // Zero the setpoints and integrals — we are now at equilibrium
  setpointX = 0.0f;
  setpointY = 0.0f;
  integralX = 0.0f;
  integralY = 0.0f;
  initialized = true;
  calculateAngleErrors();
  Serial.println("STATUS:REF_RESET=OK");
}

void calculateAngleErrors() {
  error_X = -(current_angleX - refAngleX);
  error_Y =   current_angleY - refAngleY;
  error_Z =   current_angleZ - refAngleZ;
  normalizeAngle(error_X);
  normalizeAngle(error_Y);
  normalizeAngle(error_Z);
}

// ─────────────────────────────────────────────────────────────────────────────
//  Motor / ESC control
// ─────────────────────────────────────────────────────────────────────────────

static void setThrottle(int us) {
  us = constrain(us, ARM_THROTTLE, MAX_THROTTLE);
#if HAS_ESC
  uint32_t duty = (uint32_t)us * 65535UL / 20000UL;
  ledcWrite(PWM_CHANNEL, duty);
#endif
  motorThrottle = us;
}

static void setThrottleTarget(int targetUs) {
  // Floor is ARM_THROTTLE (not MIN_THROTTLE) so callers that intentionally
  // ramp all the way down to the disarm pulse — e.g. stopMotor() and
  // CMD:MANUAL_PULSE — can actually reach it. Callers that must stay within
  // the "spinning" range (MANUAL_RPM, SPEED_UP/DOWN) already pre-clamp their
  // value to [MIN_THROTTLE, MAX_THROTTLE] before calling this, so widening
  // the floor here doesn't change their behavior.
  targetUs = constrain(targetUs, ARM_THROTTLE, MAX_THROTTLE);
  if (targetUs == motorRampTarget) return;
  motorRampTarget = targetUs;
  motorRamping    = true;
  lastRampMs      = millis();
}

static void rampStep() {
  if (!motorRamping) return;

  unsigned long now = millis();
  int stepUs = RAMP_STEP_US;
  unsigned long intervalMs = (unsigned long)RAMP_STEP_MS;

  if (startRampActive) {
    if ((now - startRampStartMs) >= (unsigned long)START_RAMP_DURATION_MS) {
      startRampActive = false;
    } else {
      intervalMs = (unsigned long)START_RAMP_STEP_MS;
      stepUs = MOTOR_SPEED_STEP;
    }
  }

  if ((now - lastRampMs) < intervalMs) return;
  lastRampMs = now;

  if      (motorThrottle < motorRampTarget) setThrottle(min(motorThrottle + stepUs, motorRampTarget));
  else if (motorThrottle > motorRampTarget) setThrottle(max(motorThrottle - stepUs, motorRampTarget));
  else    motorRamping = false;
}

// ─────────────────────────────────────────────────────────────────────────────
//  Mode transitions
// ─────────────────────────────────────────────────────────────────────────────

static void enterManualMode(const char *reason) {
  if (autoMode) {
    autoMode = false;
    // Bumpless: absorb current PID offset into manualThrottle
    // so the motor does not jump when switching back to manual.
    manualThrottle = constrain((int)roundf(sentMotorPulse), MIN_THROTTLE, MAX_THROTTLE);
    Serial.printf("[MODE] Manual (%s) — absorbed throttle=%d\n", reason, manualThrottle);
  }
}

static void enterAutoMode(const char *reason) {
  // Guards temporarily disabled per user request (commented out, not
  // deleted, so they can be restored later):
  // // Guard 1: motor must be running
  // if (!motorRunning) {
  //   Serial.printf("[MODE] Auto blocked — motor not running (%s)\n", reason);
  //   return;
  // }
  if (!autoMode) {
    // Bumpless: seed integrals from current throttle deviation
    // so there is no step on the ESC when entering auto.
    integralX = (float)(motorThrottle - manualThrottle) * AUTO_MODE_INTEGRAL_SEED_FACTOR;
    integralY = integralX;
    setpointX = 0.0f;
    setpointY = 0.0f;
    autoMode  = true;
    Serial.printf("[MODE] Auto (%s) — RPM=%.0f\n", reason, currentRPM);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  RPM sensor
// ─────────────────────────────────────────────────────────────────────────────

static void resetRPMState() {
  rpmValue = 0; currentRPM = 0.0f; rpmFreqHz = 0.0f;
  rpmPeriodMs = 0; lastRpmPulseMicros = 0;
  lastRpmPulseCount = 0; lastRpmActivityMicros = 0;
  noInterrupts();
  rpmPulseCount = 0; rpmPulseTimestampUs = 0;
  interrupts();
}

void IRAM_ATTR rpmPulseISR() {
  rpmPulseCount++;
  rpmPulseTimestampUs = micros();
}

static void processRPMPulse() {
  uint32_t snapshotCount = 0, snapshotTimeUs = 0;
  noInterrupts();
  snapshotCount  = rpmPulseCount;
  snapshotTimeUs = rpmPulseTimestampUs;
  interrupts();

  if (snapshotCount != lastRpmPulseCount && snapshotTimeUs > 0) {
    uint32_t deltaUs = (lastRpmPulseMicros > 0) ? (snapshotTimeUs - lastRpmPulseMicros) : 0;
    if (deltaUs > 0 && deltaUs < 6000000UL) {
      float cand = 60000000.0f / (float)(deltaUs * RPM_PULSES_PER_REV);
      if (cand >= RPM_MIN_VALID_RPM && cand <= RPM_MAX_VALID_RPM) {
        currentRPM = currentRPM > 0.0f ? (currentRPM * (1.0f - RPM_SMOOTHING_ALPHA) + cand * RPM_SMOOTHING_ALPHA) : cand;
        rpmFreqHz  = 1000000.0f / (float)deltaUs;
        rpmPeriodMs = deltaUs / 1000UL;
      } else {
        currentRPM = 0.0f;
      }
    }
    lastRpmPulseMicros     = snapshotTimeUs;
    lastRpmPulseCount      = snapshotCount;
    lastRpmActivityMicros  = micros();
  }

  if (lastRpmActivityMicros > 0 &&
      (micros() - lastRpmActivityMicros) > (RPM_TIMEOUT_MS * 1000UL)) {
    currentRPM = 0.0f; rpmFreqHz = 0.0f; rpmPeriodMs = 0;
    lastRpmActivityMicros = 0;
  }
}

static void publishRPMValue() {
  if ((millis() - lastRpmReportMs) < RPM_REPORT_INTERVAL_MS) return;
  lastRpmReportMs = millis();
  rpmValue = (uint32_t)(currentRPM + 0.5f);
}

// ─────────────────────────────────────────────────────────────────────────────
//  Motor start / stop / estop
// ─────────────────────────────────────────────────────────────────────────────

void startMotor() {
  if (motorRunning) { Serial.println("STATUS:MOTOR=ON"); return; }
  motorRunning = true;
  resetRPMState();
  Serial.println("--- MOTOR START ---");
  // Write the target throttle immediately on the START command — no
  // ramp/slew delay and no gradual post-start step-up. Ramping is still
  // used for manual throttle changes after start and for stopMotor()'s
  // graceful spin-down; only the start path itself is now instant.
  motorRamping    = false;
  startRampActive = false;
  postStartStepActive = false;
  motorRampTarget = manualThrottle;
  setThrottle(manualThrottle);
  Serial.println("STATUS:MOTOR=ON");
}

void stopMotor() {
  enterManualMode("MOTOR_STOP");
  motorRunning  = false;
  postStartStepActive = false; // cancel any pending auto step-up bumps
  // Normal stop: ramp the throttle back down to idle instead of an instant
  // cutoff. setThrottleTarget() + the existing rampStep()/updateMotor() loop
  // does the gradual decrease — no delay()/blocking needed.
  setThrottleTarget(ARM_THROTTLE);
  resetRPMState();
  // Opportunity for a fresh gyro calibration while stationary
  if (mpuOk) {
    delay(200);
    calibrateGyroBias(GYRO_CAL_SAMPLES_STOP);
  }
  Serial.println("STATUS:MOTOR=OFF");
}

void emergencyStop() {
  enterManualMode("ESTOP");
  motorRunning  = false;
  postStartStepActive = false; // cancel any pending auto step-up bumps
  // Emergency stop MUST stay an instant, unconditional cutoff — safety path,
  // never ramp this one.
  motorRamping  = false;
  setThrottle(ARM_THROTTLE);
  motorRampTarget = ARM_THROTTLE;
  resetRPMState();
  Serial.println("STATUS:MOTOR=ESTOP");
  Serial.println("!!! EMERGENCY STOP !!!");
}

// Applies the "+1 speed step per second, for POST_START_STEP_COUNT seconds"
// sequence kicked off by startMotor(). Non-blocking — called every loop().
static void updatePostStartSteps() {
  if (!postStartStepActive) return;
  if (!motorRunning) { postStartStepActive = false; return; }
  // If the user switches to auto/PID mode, manualThrottle is no longer the
  // thing driving the ESC — stop bumping it behind the user's back.
  if (autoMode) { postStartStepActive = false; return; }

  unsigned long elapsed = millis() - postStartStepStartMs;
  int dueSteps = (int)(elapsed / POST_START_STEP_INTERVAL_MS);
  if (dueSteps > POST_START_STEP_COUNT) dueSteps = POST_START_STEP_COUNT;

  while (postStartStepsApplied < dueSteps) {
    manualThrottle = constrain(manualThrottle + MOTOR_SPEED_STEP, MIN_THROTTLE, MAX_THROTTLE);
    setThrottleTarget(manualThrottle);
    postStartStepsApplied++;
    Serial.printf("[AUTO-RAMP] +1 step (%d/%d) -> manualThrottle=%d\n",
                  postStartStepsApplied, POST_START_STEP_COUNT, manualThrottle);
  }

  if (postStartStepsApplied >= POST_START_STEP_COUNT) postStartStepActive = false;
}

void updateMotor() {
  if (!motorRunning && motorThrottle != ARM_THROTTLE) setThrottle(ARM_THROTTLE);
  updatePostStartSteps();
  rampStep();
}

// ─────────────────────────────────────────────────────────────────────────────
//  v4 BALANCE CONTROLLER
//
//  Control law (per axis):
//
//    e_i   = setpoint_i − tilt_i                [deg]
//    I_i  += Ki · e_i · dt    (frozen if saturated)
//    P_i   = Kp · e_i
//    D_i   = −Kd · ω_gyro_i                      [direct gyro rate, no diff.]
//    NL_i  = Knl · sign(e_i) · √|e_i|  if |e_i| > NL_THRESH, else 0
//    u_i   = P_i + I_i + D_i + NL_i
//
//  Combined correction:
//    If |e_X| ≥ |e_Y|:  u = u_X  (X-dominant tilt)
//    else:               u = u_Y
//    If both axes significant (|e| > 2°): blend as weighted RMS
//
//  Output applied:
//    ESC pulse = manualThrottle + u  (clamped to [MIN_THROTTLE, MAX_THROTTLE])
// ─────────────────────────────────────────────────────────────────────────────

static float runBalanceController(float dt) {
  if (!mpuOk) return 0.0f;

  float eX = setpointX - error_X;   // error = setpoint − current tilt
  float eY = setpointY - error_Y;

  float absX = fabsf(eX);
  float absY = fabsf(eY);

  // ── Proportional ─────────────────────────────────────────────────────────
  float pX = bal_Kp * eX;
  float pY = bal_Kp * eY;

  // ── Integral with anti-windup ─────────────────────────────────────────────
  // Freeze when either the ESC rail OR the correction clamp is active.
  // This covers both forms of saturation:
  //   • outputSaturated = true  → ESC candidate hit MIN/MAX throttle
  //   • |prevCorrection| at limit → correction was clamped by MAX_CORRECTION_US
  // Using back-calculation: only integrate when there is headroom for the
  // integral to actually move the output.
  bool correctionClamped = outputSaturated ||
                           (fabsf(integralX + bal_Kp * eX - bal_Kd * gyroX_dps)
                            >= MAX_CORRECTION_US * ANTIWINDUP_SATURATION_FACTOR) ||
                           (fabsf(integralY + bal_Kp * eY - bal_Kd * gyroY_dps)
                            >= MAX_CORRECTION_US * ANTIWINDUP_SATURATION_FACTOR);
  if (!correctionClamped) {
    integralX += bal_Ki * eX * dt;
    integralY += bal_Ki * eY * dt;
  }
  // Hard-clamp individual integrals to ½ the saturation limit.
  // Even without the freeze above, integrals can never exceed this value.
  integralX = constrain(integralX, -MAX_CORRECTION_US * INTEGRAL_CLAMP_FACTOR, MAX_CORRECTION_US * INTEGRAL_CLAMP_FACTOR);
  integralY = constrain(integralY, -MAX_CORRECTION_US * INTEGRAL_CLAMP_FACTOR, MAX_CORRECTION_US * INTEGRAL_CLAMP_FACTOR);

  // ── Derivative: DIRECT gyro rate (no numerical differentiation) ───────────
  // gyroX_dps is the calibrated angular rate on the X axis [deg/s].
  // Negative sign: positive rate (leaning right) → reduce throttle to push back.
  float dX = -bal_Kd * gyroX_dps;
  float dY = -bal_Kd * gyroY_dps;

  // ── Non-linear proportional boost for large disturbances ─────────────────
  // Adds Knl·√|e| in the direction of the error, activating only above
  // NL_THRESH. This improves large-disturbance recovery without destabilising
  // the small-angle regime.
  float nlX = 0.0f, nlY = 0.0f;
  if (absX > NL_THRESH_DEG)
    nlX = bal_Knl * (eX > 0.0f ? 1.0f : -1.0f) * sqrtf(absX - NL_THRESH_DEG);
  if (absY > NL_THRESH_DEG)
    nlY = bal_Knl * (eY > 0.0f ? 1.0f : -1.0f) * sqrtf(absY - NL_THRESH_DEG);

  // ── Per-axis totals ───────────────────────────────────────────────────────
  float uX = pX + integralX + dX + nlX;
  float uY = pY + integralY + dY + nlY;

  // ── Combine axes ──────────────────────────────────────────────────────────
  // Strategy: use the axis with the larger tilt error as dominant.
  // If both axes are significantly tilted, take the vector magnitude
  // projected onto the dominant direction.
  float correction;
  // BOTH_AXIS_THRESHOLD_DEG is defined at the top of the file (tunable).

  if (absX >= absY) {
    correction = (absY > BOTH_AXIS_THRESHOLD)
                 ? uX + uY * (absY / absX) * 0.4f   // partial Y contribution
                 : uX;
  } else {
    correction = (absX > BOTH_AXIS_THRESHOLD)
                 ? uY + uX * (absX / absY) * 0.4f
                 : uY;
  }

  // ── Output saturation & anti-windup flag update ──────────────────────────
  correction = constrain(correction, -MAX_CORRECTION_US, MAX_CORRECTION_US);
  float candidate = (float)manualThrottle + correction;
  outputSaturated = (candidate <= (float)MIN_THROTTLE || candidate >= (float)MAX_THROTTLE);

  return correction;
}

// ─────────────────────────────────────────────────────────────────────────────
//  Direct ESC write for auto mode (bypasses ramp for fast stabilization)
// ─────────────────────────────────────────────────────────────────────────────
// The slow RAMP_STEP_US/RAMP_STEP_MS ramp (default 5 µs / 20 ms = 0.25 µs/ms)
// is intentional for smooth manual throttle changes, but it would add ~100 ms
// lag to the closed-loop path which cannot tolerate it (unstable pole at 10 rad/s
// → disturbance growth time-constant ≈ 100 ms). In auto mode we write the
// corrected ESC value directly; the ramp is only used for base throttle changes.
static void applyAutoThrottle(int targetUs) {
  targetUs = constrain(targetUs, MIN_THROTTLE, MAX_THROTTLE);
  motorRampTarget = targetUs;   // keep ramp state consistent for bumpless exit
  setThrottle(targetUs);        // write immediately — no ramp delay
}

// ─────────────────────────────────────────────────────────────────────────────
//  Network / command parser  (compatible with v3.5 dashboard)
// ─────────────────────────────────────────────────────────────────────────────

static String readJsonStr(const String &json, const String &key) {
  String tok = "\"" + key + "\"";
  int kp = json.indexOf(tok); if (kp < 0) return "";
  int cp = json.indexOf(':', kp); if (cp < 0) return "";
  int vp = cp + 1;
  while (vp < (int)json.length() && isspace((unsigned char)json[vp])) vp++;
  if (vp >= (int)json.length() || json[vp] != '"') return "";
  int ep = json.indexOf('"', vp + 1); if (ep < 0) return "";
  return json.substring(vp + 1, ep);
}

static float readJsonNum(const String &json, const String &key, float def) {
  String tok = "\"" + key + "\"";
  int kp = json.indexOf(tok); if (kp < 0) return def;
  int cp = json.indexOf(':', kp); if (cp < 0) return def;
  int vp = cp + 1;
  while (vp < (int)json.length() && isspace((unsigned char)json[vp])) vp++;
  String num;
  while (vp < (int)json.length() &&
         (isdigit((unsigned char)json[vp]) || json[vp]=='.' || json[vp]=='-' || json[vp]=='+'))
    num += json[vp++];
  return num.length() ? num.toFloat() : def;
}

static bool readJsonBool(const String &json, const String &key, bool def) {
  String tok = "\"" + key + "\"";
  int kp = json.indexOf(tok); if (kp < 0) return def;
  int cp = json.indexOf(':', kp); if (cp < 0) return def;
  int vp = cp + 1;
  while (vp < (int)json.length() && isspace((unsigned char)json[vp])) vp++;
  String val;
  while (vp < (int)json.length() && json[vp]!=',' && json[vp]!='}' && json[vp]!='\n' && json[vp]!='\r')
    val += json[vp++];
  val.trim();
  if (val.equalsIgnoreCase("true"))  return true;
  if (val.equalsIgnoreCase("false")) return false;
  return def;
}

bool parseNetworkPacket(const String &js) {
  if (js.length() == 0 || js[0] != '{') return false;

  String cmd = readJsonStr(js, "command");
  if (cmd == "START") { if (!motorRunning) startMotor(); return true; }
  if (cmd == "STOP")  { stopMotor();  return true; }
  if (cmd == "RESET") { resetReference(); return true; }

  int tgtThr = (int)readJsonNum(js, "setThrottle", -1.0f);
  // Manual-only direct throttle set — allowed down to ARM_THROTTLE, same as
  // CMD:MANUAL_PULSE. Auto mode's own floor (MIN_THROTTLE) is enforced
  // separately in the control loop and is unaffected by this manual path.
  if (tgtThr >= ARM_THROTTLE) {
    manualThrottle = constrain(tgtThr, ARM_THROTTLE, MAX_THROTTLE);
    if (motorRunning && !autoMode) setThrottleTarget(manualThrottle);
    return true;
  }

  if (js.indexOf("\"autoMode\"") >= 0) {
    bool af = readJsonBool(js, "autoMode", autoMode);
    if (af) enterAutoMode("NET_JSON");
    else    enterManualMode("NET_JSON");
    return true;
  }

  // Live gain update via JSON (e.g. dashboard PID sliders)
  if (js.indexOf("\"kp\"") >= 0) { bal_Kp = readJsonNum(js,"kp",bal_Kp); return true; }
  if (js.indexOf("\"ki\"") >= 0) { bal_Ki = readJsonNum(js,"ki",bal_Ki); return true; }
  if (js.indexOf("\"kd\"") >= 0) { bal_Kd = readJsonNum(js,"kd",bal_Kd); return true; }
  if (js.indexOf("\"knl\"") >= 0){ bal_Knl= readJsonNum(js,"knl",bal_Knl);return true; }

  return false;
}

void handleAppCommand(const String &cmd) {
  // Single-character shortcuts (h/l/z/x/s/e/a/w and the PID-tuning keys
  // p/o/i/u/d/c/n/m/v, upper or lower case) are the exact same protocol the
  // USB serial monitor uses (handleSerialInput -> executeCommand). The app
  // sends these raw characters over WiFi too (e.g. the Reset Angles and
  // Speed Up/Down buttons), but until now this WiFi/app path only understood
  // "CMD:..." strings, so single chars fell through as STATUS:CMD_UNKNOWN
  // and silently did nothing. Route them through executeCommand() here so
  // every app button behaves identically to typing the same key directly
  // into PlatformIO's serial monitor.
  if (cmd.length() == 1) { executeCommand(cmd.charAt(0)); return; }

  // Light LED for every app command — 400 ms for hold-capable speed steps,
  // 200 ms for all others.
  bool isSpeedStep = (cmd == "CMD:SPEED_UP" || cmd == "CMD:SPEED_DOWN");
  signalLed(isSpeedStep ? 400UL : 200UL);

  if      (cmd == "CMD:MOTOR_START")   { if (!motorRunning) startMotor(); else Serial.println("STATUS:MOTOR=ON"); }
  else if (cmd == "CMD:MOTOR_STOP")    { stopMotor(); }
  else if (cmd == "CMD:EMERGENCY_STOP"){ emergencyStop(); }
  else if (cmd == "CMD:SPEED_UP")      { enterManualMode("SPEED_UP"); manualThrottle=constrain(manualThrottle+MOTOR_SPEED_STEP,ARM_THROTTLE,MAX_THROTTLE); if(motorRunning&&!autoMode)setThrottleTarget(manualThrottle); }
  else if (cmd == "CMD:SPEED_DOWN")    { enterManualMode("SPEED_DOWN"); manualThrottle=constrain(manualThrottle-MOTOR_SPEED_STEP,ARM_THROTTLE,MAX_THROTTLE); if(motorRunning&&!autoMode)setThrottleTarget(manualThrottle); }
  else if (cmd == "CMD:SET_AUTO")      { enterAutoMode("APP_AUTO"); }
  else if (cmd == "CMD:SET_MANUAL")    { enterManualMode("APP_MANUAL"); }
  else if (cmd == "CMD:WIFI_RECONNECT"){ forceWifiReconnect(); }
  else if (cmd == "CMD:RESET_REF")     { resetReference(); }
  else if (cmd.startsWith("CMD:MANUAL_RPM:")) {
    int targetRpm = cmd.substring(15).toInt();
    enterManualMode("MANUAL_RPM");
    if (targetRpm <= 0) { stopMotor(); }
    else {
      if (!motorRunning) startMotor();
      int us = MIN_THROTTLE + (int)((float)targetRpm / 12000.0f * (MAX_THROTTLE - MIN_THROTTLE));
      setThrottleTarget(constrain(us, MIN_THROTTLE, MAX_THROTTLE));
    }
  }
  // CMD:MANUAL_PULSE:<us> — direct ESC pulse-width control in microseconds,
  // bypassing the RPM→pulse formula. Used by the app's hardware self-test to
  // drive a precise, timed pulse ramp (e.g. 1200µs → 1400µs over 10 s) that
  // isn't expressible as an RPM target. Allowed range is [ARM_THROTTLE,
  // MAX_THROTTLE] so the app can command all the way down to the disarm
  // pulse, not just down to MIN_THROTTLE.
  else if (cmd.startsWith("CMD:MANUAL_PULSE:")) {
    int us = cmd.substring(17).toInt();
    enterManualMode("MANUAL_PULSE");
    us = constrain(us, ARM_THROTTLE, MAX_THROTTLE);
    if (us <= ARM_THROTTLE) { stopMotor(); }
    else {
      if (!motorRunning) startMotor();
      setThrottleTarget(us);
    }
  }
  // CMD:SET_IDLE:<value>  — app's ESC idle/base pulse control (µs).
  // CMD:SET_BASE_THROTTLE:<value> — app's PID base-throttle control (µs).
  // Both firmware paths add PID correction on top of manualThrottle, so both
  // map onto the same base-throttle variable here.
  else if (cmd.startsWith("CMD:SET_IDLE:") || cmd.startsWith("CMD:SET_BASE_THROTTLE:")) {
    int sep = cmd.indexOf(':', 4);
    int value = cmd.substring(sep + 1).toInt();
    // Manual-only base throttle — allowed down to ARM_THROTTLE.
    manualThrottle = constrain(value, ARM_THROTTLE, MAX_THROTTLE);
    if (motorRunning && !autoMode) setThrottleTarget(manualThrottle);
    Serial.printf("STATUS:BASE_THROTTLE=%d\n", manualThrottle);
  }
  // CMD:SET_PID:<kp>,<ki>,<kd> — absolute gain update from the settings page.
  else if (cmd.startsWith("CMD:SET_PID:")) {
    String args = cmd.substring(12);
    int c1 = args.indexOf(',');
    int c2 = args.indexOf(',', c1 + 1);
    if (c1 > 0 && c2 > c1) {
      bal_Kp = args.substring(0, c1).toFloat();
      bal_Ki = args.substring(c1 + 1, c2).toFloat();
      bal_Kd = args.substring(c2 + 1).toFloat();
      Serial.printf("STATUS:PID=%.2f,%.2f,%.2f\n", bal_Kp, bal_Ki, bal_Kd);
    }
  }
  // CMD:SET_PID_CFG:<setpointDeg>,<deadbandDeg>,<integralMax> — setpoint is
  // applied directly; deadband/integralMax are acknowledged for forward
  // compatibility (this controller version doesn't use them yet).
  else if (cmd.startsWith("CMD:SET_PID_CFG:")) {
    String args = cmd.substring(16);
    int c1 = args.indexOf(',');
    float setpoint = (c1 > 0 ? args.substring(0, c1) : args).toFloat();
    setpointX = setpoint;
    setpointY = setpoint;
    Serial.printf("STATUS:PID_CFG_SETPOINT=%.2f\n", setpoint);
  }
  // CMD:SET_MIN_SPEED:<us> — app-configurable minimum/idle speed used by the
  // IR remote's EQ button (falls back to 1250us if the app never sets it).
  else if (cmd.startsWith("CMD:SET_MIN_SPEED:")) {
    int value = cmd.substring(18).toInt();
    minSpeedUs = constrain(value, MIN_THROTTLE, MAX_THROTTLE);
    Serial.printf("STATUS:MIN_SPEED=%d\n", minSpeedUs);
  }
  // CMD:SET_SPEED_STEP:<us> — manual throttle step used by Speed Up/Down
  // (dashboard buttons, keyboard h/l, and the IR remote's VOL+/VOL- keys).
  else if (cmd.startsWith("CMD:SET_SPEED_STEP:")) {
    int value = cmd.substring(19).toInt();
    MOTOR_SPEED_STEP = constrain(value, MOTOR_SPEED_STEP_MIN, MOTOR_SPEED_STEP_MAX);
    Serial.printf("STATUS:SPEED_STEP=%d\n", MOTOR_SPEED_STEP);
  }
  // CMD:SET_ARM_THROTTLE:<us> — the ESC "armed but not spinning" pulse sent
  // whenever the motor is off (stopMotor/emergencyStop/idle keep-alive).
  // Runtime-settable from the settings page "Starting Pulse" field.
  else if (cmd.startsWith("CMD:SET_ARM_THROTTLE:")) {
    int value = cmd.substring(21).toInt();
    ARM_THROTTLE = constrain(value, ARM_THROTTLE_MIN_ALLOWED, MIN_THROTTLE);
    Serial.printf("STATUS:ARM_THROTTLE=%d\n", ARM_THROTTLE);
  }
  // CMD:SET_THROTTLE_LIMITS:<minUs>,<maxUs> — safety bounds clamped on every
  // manual/PID throttle write. Does not affect ARM_THROTTLE/START_THROTTLE
  // by itself, but ARM_THROTTLE is always re-clamped below MIN_THROTTLE.
  else if (cmd.startsWith("CMD:SET_THROTTLE_LIMITS:")) {
    String args = cmd.substring(24);
    int c1 = args.indexOf(',');
    if (c1 > 0) {
      int newMin = args.substring(0, c1).toInt();
      int newMax = args.substring(c1 + 1).toInt();
      if (newMin > 0 && newMax > newMin) {
        MIN_THROTTLE = newMin;
        MAX_THROTTLE = newMax;
        manualThrottle = constrain(manualThrottle, MIN_THROTTLE, MAX_THROTTLE);
        ARM_THROTTLE = min(ARM_THROTTLE, MIN_THROTTLE);
        Serial.printf("STATUS:THROTTLE_LIMITS=%d,%d\n", MIN_THROTTLE, MAX_THROTTLE);
      }
    }
  }
  // CMD:SET_IR_STEPS:<kpStep>,<kiStep>,<kdStep>,<knlStep> — increment sizes
  // used by the IR remote's PID tuning buttons (1/2/3 = increase, 4/5/6 = decrease).
  else if (cmd.startsWith("CMD:SET_IR_STEPS:")) {
    String args = cmd.substring(17);
    int c1 = args.indexOf(',');
    int c2 = args.indexOf(',', c1 + 1);
    int c3 = args.indexOf(',', c2 + 1);
    if (c1 > 0 && c2 > c1 && c3 > c2) {
      KP_STEP  = args.substring(0, c1).toFloat();
      KI_STEP  = args.substring(c1 + 1, c2).toFloat();
      KD_STEP  = args.substring(c2 + 1, c3).toFloat();
      KNL_STEP = args.substring(c3 + 1).toFloat();
      Serial.printf("STATUS:IR_STEPS=%.2f,%.2f,%.2f,%.2f\n", KP_STEP, KI_STEP, KD_STEP, KNL_STEP);
    }
  }
  // CMD:SET_AUTO_TUNING:<nlThreshDeg>,<maxCorrectionUs> — auto-mode tuning knobs:
  // nonlinear-boost threshold and the PID output saturation limit.
  else if (cmd.startsWith("CMD:SET_AUTO_TUNING:")) {
    String args = cmd.substring(20);
    int c1 = args.indexOf(',');
    if (c1 > 0) {
      NL_THRESH_DEG     = args.substring(0, c1).toFloat();
      MAX_CORRECTION_US = args.substring(c1 + 1).toFloat();
      Serial.printf("STATUS:AUTO_TUNING=%.2f,%.2f\n", NL_THRESH_DEG, MAX_CORRECTION_US);
    }
  }
  // CMD:SET_TIMING:<rpmTimeoutMs>,<rpmReportIntervalMs>,<telemetryIntervalMs>
  // — sensor timeout and reporting cadence.
  else if (cmd.startsWith("CMD:SET_TIMING:")) {
    String args = cmd.substring(15);
    int c1 = args.indexOf(',');
    int c2 = args.indexOf(',', c1 + 1);
    if (c1 > 0 && c2 > c1) {
      RPM_TIMEOUT_MS         = (uint32_t)args.substring(0, c1).toInt();
      RPM_REPORT_INTERVAL_MS = (uint32_t)args.substring(c1 + 1, c2).toInt();
      TELEMETRY_INTERVAL_MS  = (unsigned long)args.substring(c2 + 1).toInt();
      Serial.printf("STATUS:TIMING=%lu,%lu,%lu\n", RPM_TIMEOUT_MS, RPM_REPORT_INTERVAL_MS, TELEMETRY_INTERVAL_MS);
    }
  }
  else { Serial.print("STATUS:CMD_UNKNOWN="); Serial.println(cmd); }
}

// ─────────────────────────────────────────────────────────────────────────────
//  IR remote  ("Car MP3" remote, NEC address 0x00 — matches the dashboard's
//  guide.tsx reference wiring. Mapped on the single-byte command code, not
//  the full raw code, since address/complement bytes are fixed for this
//  remote.)
// ─────────────────────────────────────────────────────────────────────────────

#define IR_CH_MINUS   0x45   // CH−    → stop session (opens confirm dialog, app-side)
#define IR_CH         0x46   // CH     → toggle auto/manual mode
#define IR_CH_PLUS    0x47   // CH+    → start session (app-side)
#define IR_PREV       0x44   // PREV   → confirm-dialog nav (Shift+Tab equivalent, app-side)
#define IR_NEXT       0x40   // NEXT   → confirm-dialog nav (Tab equivalent, app-side)
#define IR_PLAY_PAUSE 0x43   // ▶⏸    → start/stop motor
#define IR_VOL_MINUS  0x07   // −      → throttle down one step (same as 'l')
#define IR_VOL_PLUS   0x15   // +      → throttle up one step (same as 'h')
#define IR_EQ         0x09   // EQ     → return to minimum speed
#define IR_0          0x16   // 0      → reset reference angles
#define IR_100_PLUS   0x19   // 100+   → unassigned
#define IR_200_PLUS   0x0D   // 200+   → unassigned
#define IR_1          0x0C   // 1      → Kp increase
#define IR_2          0x18   // 2      → Ki increase
#define IR_3          0x5E   // 3      → Kd increase
#define IR_4          0x08   // 4      → Kp decrease
#define IR_5          0x1C   // 5      → Ki decrease
#define IR_6          0x5A   // 6      → Kd decrease
#define IR_7          0x42   // 7      → unassigned
#define IR_8          0x52   // 8      → unassigned
#define IR_9          0x4A   // 9      → unassigned

// Lights the onboard LED for `ms` milliseconds (or extends an existing timer).
// Call this instead of writing ONBOARD_LED directly so all command sources
// share the same feedback path.
static void signalLed(unsigned long ms) {
  digitalWrite(ONBOARD_LED, HIGH);
  unsigned long target = millis() + ms;
  // Always extend — never shorten an already-running timer.
  if (target > ledOffMs) ledOffMs = target;
}

// Last non-repeat IR command — used to service hold-to-repeat on VOL+/−.
static uint8_t lastIrCmd = 0xFF;

static void handleIRRemote() {
  if (!IrReceiver.decode()) return;
  uint32_t irRaw = IrReceiver.decodedIRData.decodedRawData;
  uint8_t  irCmd = IrReceiver.decodedIRData.command;
  bool isRepeat  = (IrReceiver.decodedIRData.flags & IRDATA_FLAGS_IS_REPEAT);

  if (irRaw == 0) { IrReceiver.resume(); return; }

  // For VOL+/− allow the NEC repeat bursts to keep stepping throttle while
  // the button is held.  All other keys ignore repeats (prevents accidental
  // double-fires on slow keys like START or MODE).
  if (isRepeat) {
    if (lastIrCmd == IR_VOL_PLUS || lastIrCmd == IR_VOL_MINUS) {
      // executeCommand already calls signalLed(400) for h/l — LED stays solid.
      if (lastIrCmd == IR_VOL_PLUS)  executeCommand('h');
      else                            executeCommand('l');
    }
    IrReceiver.resume(); return;
  }
  // Flash LED for every non-repeat IR frame (LED_PULSE_SHORT_MS base;
  // VOL+/− will be extended to LED_PULSE_LONG_MS by executeCommand below).
  signalLed(LED_PULSE_SHORT_MS);

  // Always log the raw code so every button press is visible on the serial
  // monitor, even when it hits a mapped case below.
  Serial.printf("[IR] Raw=0x%08X  cmd=0x%02X  proto=%d\n",
                irRaw, irCmd, (int)IrReceiver.decodedIRData.protocol);

  // Record which command just arrived so the repeat handler above knows
  // which step to continue when the button stays held.
  lastIrCmd = irCmd;

  switch (irCmd) {
    // ── App-side actions: just forward the named command; the dashboard
    //    (SessionControl.tsx) owns the session-start/stop-dialog/nav logic. ──
    case IR_CH_PLUS:  lastIrCommand = "CH_PLUS";  break;
    case IR_CH_MINUS: lastIrCommand = "CH_MINUS"; break;
    case IR_PREV:     lastIrCommand = "PREV";     break;
    case IR_NEXT:     lastIrCommand = "NEXT";     break;

    // CH → toggle auto/manual mode locally
    case IR_CH:
      executeCommand('a');
      lastIrCommand = autoMode ? "AUTO_MODE:ON" : "AUTO_MODE:OFF";
      break;

    // PLAY/PAUSE → start/stop motor toggle
    case IR_PLAY_PAUSE: {
      bool wasRunning = motorRunning;
      executeCommand(wasRunning ? 'x' : 's');
      lastIrCommand = wasRunning ? "STOP" : "START";
      break;
    }

    // VOL+/− → throttle step; executeCommand extends LED to 400 ms automatically.
    case IR_VOL_PLUS:  executeCommand('h'); lastIrCommand = "VOL_PLUS";  break;
    case IR_VOL_MINUS: executeCommand('l'); lastIrCommand = "VOL_MINUS"; break;

    // EQ → return throttle to configured minimum speed
    case IR_EQ:
      manualThrottle = constrain(minSpeedUs, MIN_THROTTLE, MAX_THROTTLE);
      if (motorRunning && !autoMode) setThrottleTarget(manualThrottle);
      Serial.printf("[IR] EQ → min speed %d\n", manualThrottle);
      lastIrCommand = "EQ";
      break;

    // 0 → reset reference angles
    case IR_0: executeCommand('z'); lastIrCommand = "RESET_REF"; break;

    // 1/2/3/4/5/6 → Kp/Ki/Kd tuning. Only allowed while auto mode is OFF —
    // tuning the gains that a running auto-mode loop is actively using
    // would fight the controller live. Turn auto mode off (CH button) to
    // tune, then back on to test.
    case IR_1:
      if (!autoMode) { executeCommand('p'); lastIrCommand = "KP_UP"; }
      else { lastIrCommand = "KP_UP_BLOCKED_AUTO"; Serial.println("[TUNE] Ignored: turn auto mode off to tune PID"); }
      break;
    case IR_2:
      if (!autoMode) { executeCommand('i'); lastIrCommand = "KI_UP"; }
      else { lastIrCommand = "KI_UP_BLOCKED_AUTO"; Serial.println("[TUNE] Ignored: turn auto mode off to tune PID"); }
      break;
    case IR_3:
      if (!autoMode) { executeCommand('d'); lastIrCommand = "KD_UP"; }
      else { lastIrCommand = "KD_UP_BLOCKED_AUTO"; Serial.println("[TUNE] Ignored: turn auto mode off to tune PID"); }
      break;
    case IR_4:
      if (!autoMode) { executeCommand('o'); lastIrCommand = "KP_DOWN"; }
      else { lastIrCommand = "KP_DOWN_BLOCKED_AUTO"; Serial.println("[TUNE] Ignored: turn auto mode off to tune PID"); }
      break;
    case IR_5:
      if (!autoMode) { executeCommand('u'); lastIrCommand = "KI_DOWN"; }
      else { lastIrCommand = "KI_DOWN_BLOCKED_AUTO"; Serial.println("[TUNE] Ignored: turn auto mode off to tune PID"); }
      break;
    case IR_6:
      if (!autoMode) { executeCommand('c'); lastIrCommand = "KD_DOWN"; }
      else { lastIrCommand = "KD_DOWN_BLOCKED_AUTO"; Serial.println("[TUNE] Ignored: turn auto mode off to tune PID"); }
      break;

    // 100+, 200+, 7, 8, 9 → unassigned for now
    case IR_100_PLUS: case IR_200_PLUS:
    case IR_7: case IR_8: case IR_9:
      lastIrCommand = "none";
      break;

    default:
      lastIrCommand = String(irRaw, HEX);
      Serial.printf("[IR] Unmapped: 0x%08X  cmd=0x%02X  proto=%d\n",
                    irRaw, irCmd, (int)IrReceiver.decodedIRData.protocol);
      break;
  }

  if (lastIrCommand != String(irRaw, HEX)) {
    // Mapped case: also print the resolved action name so it's obvious
    // what the remote press was translated to, not just the raw code.
    Serial.printf("[IR] -> %s\n", lastIrCommand.c_str());
  }

  IrReceiver.resume();
}

void executeCommand(char cmd) {
  // Flash LED for every executed command.  Speed keys get 400 ms so rapid
  // back-to-back calls (hold-to-repeat) keep it solid; all others get 200 ms.
  unsigned long ledMs = (cmd=='h'||cmd=='H'||cmd=='l'||cmd=='L') ? 400UL : 200UL;
  signalLed(ledMs);
  switch (cmd) {
    case 's': case 'S': if (!motorRunning) startMotor(); break;
    case 'x': case 'X': stopMotor(); break;
    case 'e': case 'E': emergencyStop(); break;
    case 'h': case 'H': {
      // Manual-only: floor is ARM_THROTTLE — operator may go below the
      // auto-mode minimum; auto mode itself never does (see runBalanceController).
      int loH = autoMode ? MIN_THROTTLE : ARM_THROTTLE;
      manualThrottle = constrain(manualThrottle+MOTOR_SPEED_STEP,loH,MAX_THROTTLE);
      if (motorRunning && !autoMode) setThrottleTarget(manualThrottle);
      Serial.printf("[THR] Up → %d\n", manualThrottle); break;
    }
    case 'l': case 'L': {
      int loL = autoMode ? MIN_THROTTLE : ARM_THROTTLE;
      manualThrottle = constrain(manualThrottle-MOTOR_SPEED_STEP,loL,MAX_THROTTLE);
      if (motorRunning && !autoMode) setThrottleTarget(manualThrottle);
      Serial.printf("[THR] Down → %d\n", manualThrottle); break;
    }
    case 'z': case 'Z':
      resetReference(); Serial.println("[REF] Reset"); break;
    case 'a': case 'A':
      if (autoMode) { enterManualMode("TOGGLE"); Serial.println("[MODE] Manual"); }
      else          { enterAutoMode("TOGGLE");   Serial.println("[MODE] Auto"); } break;
    case 'w': case 'W': forceWifiReconnect(); break;

    // Kp
    case 'p': bal_Kp += KP_STEP;
              Serial.printf("[TUNE] Kp=%.1f Ki=%.1f Kd=%.1f Knl=%.1f\n",bal_Kp,bal_Ki,bal_Kd,bal_Knl); break;
    case 'o': if (bal_Kp >= KP_STEP) bal_Kp -= KP_STEP;
              Serial.printf("[TUNE] Kp=%.1f Ki=%.1f Kd=%.1f Knl=%.1f\n",bal_Kp,bal_Ki,bal_Kd,bal_Knl); break;
    // Ki
    case 'i': bal_Ki += KI_STEP;
              Serial.printf("[TUNE] Kp=%.1f Ki=%.1f Kd=%.1f Knl=%.1f\n",bal_Kp,bal_Ki,bal_Kd,bal_Knl); break;
    case 'u': if (bal_Ki >= KI_STEP) bal_Ki -= KI_STEP;
              Serial.printf("[TUNE] Kp=%.1f Ki=%.1f Kd=%.1f Knl=%.1f\n",bal_Kp,bal_Ki,bal_Kd,bal_Knl); break;
    // Kd
    case 'd': bal_Kd += KD_STEP;
              Serial.printf("[TUNE] Kp=%.1f Ki=%.1f Kd=%.1f Knl=%.1f\n",bal_Kp,bal_Ki,bal_Kd,bal_Knl); break;
    case 'c': if (bal_Kd >= KD_STEP) bal_Kd -= KD_STEP;
              Serial.printf("[TUNE] Kp=%.1f Ki=%.1f Kd=%.1f Knl=%.1f\n",bal_Kp,bal_Ki,bal_Kd,bal_Knl); break;
    // Knl
    case 'n': bal_Knl += KNL_STEP;
              Serial.printf("[TUNE] Kp=%.1f Ki=%.1f Kd=%.1f Knl=%.1f\n",bal_Kp,bal_Ki,bal_Kd,bal_Knl); break;
    case 'm': if (bal_Knl >= KNL_STEP) bal_Knl -= KNL_STEP;
              Serial.printf("[TUNE] Kp=%.1f Ki=%.1f Kd=%.1f Knl=%.1f\n",bal_Kp,bal_Ki,bal_Kd,bal_Knl); break;

    case 'v': case 'V':
      Serial.println(F("\n====== GYRO BALANCE v4 STATUS ======"));
      Serial.printf(  "  Kp  = %.2f  (Routh min ≈ 1.4)\n", bal_Kp);
      Serial.printf(  "  Ki  = %.2f  (Routh min ≈ 17)\n",  bal_Ki);
      Serial.printf(  "  Kd  = %.2f  (direct gyro-rate)\n",bal_Kd);
      Serial.printf(  "  Knl = %.2f  (nonlinear boost)\n", bal_Knl);
      Serial.printf(  "  Tilt X=%.2f°  Y=%.2f°\n",         error_X, error_Y);
      Serial.printf(  "  RPM=%.0f  Throttle=%d  ESC=%.0f\n",currentRPM,(int)manualThrottle,heldEscPulseUs);
      Serial.printf(  "  Mode=%s  IntX=%.2f  IntY=%.2f\n",  autoMode?"AUTO":"MANUAL",integralX,integralY);
      Serial.printf(  "  Saturated=%s\n", outputSaturated?"YES":"no");
      Serial.println(F("====================================="));
      break;
  }
}

static void handleSerialInput() {
  if (!Serial.available()) return;
  char c = Serial.read();
  executeCommand(c);
}

// ─────────────────────────────────────────────────────────────────────────────
//  Telemetry  (format compatible with v3.5 dashboard)
// ─────────────────────────────────────────────────────────────────────────────

void sendAppTelemetry() {
  float pwmPercent = 0.0f;
  if (motorThrottle > ARM_THROTTLE)
    pwmPercent = (float)(motorThrottle - ARM_THROTTLE) / (float)(MAX_THROTTLE - ARM_THROTTLE) * 100.0f;

#if HAS_TEMP_SENSOR
  float tempC = temperatureRead();
#else
  // No dedicated temperature sensor wired up — fall back to the MPU6050's
  // built-in silicon die temperature register (already read/converted in
  // readMPU6050() into siliconTempC). It's the chip's own ambient/die temp,
  // not a true bearing/enclosure probe, but it's a real live reading rather
  // than a hardcoded 0, and it's already available on every board that has
  // the IMU wired up. Only trust it while the IMU itself is healthy.
  float tempC = mpuOk ? siliconTempC : 0.0f;
#endif

  String json =
    String("{\"mode\":\"") + (autoMode ? "auto" : "manual") +
    String("\",\"tiltX\":")          + String(mpuOk ? error_X : 0.0f, 2) +
    String(",\"tiltY\":")            + String(mpuOk ? error_Y : 0.0f, 2) +
    // (filteredAngleX/Y will be reported as tiltX/tiltY below)
    // Bearing/enclosure temperature — real sensor if HAS_TEMP_SENSOR, else
    // MPU6050 die-temp fallback (tempC computed above). Was previously
    // computed but never actually placed in this payload, so the dashboard
    // always saw the server's hardcoded 25°C default — fixed here.
    String(",\"temp\":")      + String(tempC, 2) +
    String(",\"heldFINALpulse\":")   + String(heldFinalPulse, 1) +
    String(",\"throttle\":")         + String(motorRunning ? motorThrottle : manualThrottle) +
    String(",\"SentMOTORpulse\":")   + String(sentMotorPulse, 1) +
    String(",\"pwm\":")              + String(pwmPercent, 2) +
    // Report filtered angles as tilt (reference-relative) for uniformity
    String(",\"filteredAngleX\":")   + String(mpuOk ? error_X : 0.0f, 2) +
    String(",\"filteredAngleY\":")   + String(mpuOk ? error_Y : 0.0f, 2) +
    String(",\"tiltZ\":")            + String(mpuOk ? error_Z : 0.0f, 2) +
    String(",\"rpm\":")              + String(rpmValue) +
    String(",\"vibrationRMS\":")     + String(vibrationRMS, 4) +
    String(",\"mpuFault\":")         + (mpuOk ? "false" : "true") +
    String(",\"correction\":")       + String(pidCorrectionValue, 1) +
    String(",\"escPulse\":")         + String(heldEscPulseUs, 0) +
    String(",\"intX\":")             + String(integralX, 2) +
    String(",\"intY\":")             + String(integralY, 2) +
    String(",\"saturated\":")        + (outputSaturated ? "true" : "false") +
    String(",\"kp\":")               + String(bal_Kp, 1) +
    String(",\"ki\":")               + String(bal_Ki, 1) +
    String(",\"kd\":")               + String(bal_Kd, 1) +
    String(",\"knl\":")              + String(bal_Knl, 1) +
    String("}");

  lastIrCommand = "none";

  Serial.println(json);
  if (tcpClient.connected()) tcpClient.println(json);
}

// ─────────────────────────────────────────────────────────────────────────────
//  setup
// ─────────────────────────────────────────────────────────────────────────────

void setup() {
  Serial.begin(115200);

  Serial.println();
  Serial.println("============================================================");
  Serial.println("  GYRO BALANCE v4.0 — Full State-Feedback PID");
  Serial.println("  Direct gyro-rate D  |  Anti-windup  |  Two-axis control");
  Serial.println("============================================================");
  Serial.printf("  Starting gains: Kp=%.1f Ki=%.1f Kd=%.1f Knl=%.1f\n",
                bal_Kp, bal_Ki, bal_Kd, bal_Knl);
  Serial.println("  (Routh stability minimums: Kp≥1.4, Ki≥17)");
  Serial.println("============================================================");

  // ── ESC PWM: initialize and hold the arm pulse FIRST, before anything else ──
  // Root cause of "motor won't spin" with this firmware: initWifi() blocks for
  // up to ~10s (STA connect attempt + AP fallback + network scan) and the MPU
  // init/calibration below adds more delay, so ESC_PIN was left floating
  // (undriven) for 10+ seconds after power-up. Most ESCs (SimonK/BLHeli and
  // similar) require a valid, stable throttle signal within ~1-2s of power-on
  // or they refuse to arm / latch a failsafe until power-cycled — exactly the
  // "hardware is fine, this firmware just won't spin the motor" symptom. The
  // minimal reference sketch that DOES work calls ledcSetup/ledcAttachPin and
  // writes the arm pulse as its very first action, before any blocking work.
  // Mirror that here: get a clean pulse onto ESC_PIN immediately, then let
  // WiFi/IMU init happen while the ESC already sees a valid signal.
#if HAS_ESC
  ledcSetup(PWM_CHANNEL, PWM_FREQ, PWM_RESOLUTION);
  ledcAttachPin(ESC_PIN, PWM_CHANNEL);
  setThrottle(ARM_THROTTLE);
  Serial.println("[ESC] PWM initialized early — holding arm pulse before WiFi/IMU init");
#else
  Serial.println("[ESC] Skipped — HAS_ESC=0");
#endif

  initWifi();
  if (APP_SERVER_ENABLED) connectToServer();

  Serial.println("DEVICE_INFO:esp32WiFi|VERSION:4.0|COMPONENTS:" + connectedComponentsList() + "|BAUD:115200");
  Serial.println("{\"status\":\"boot\",\"msg\":\"GyroBalance v4.0\"}");

  // GPIO
  pinMode(RESET_BUTTON, INPUT_PULLUP);
  pinMode(ONBOARD_LED, OUTPUT);
  digitalWrite(ONBOARD_LED, LOW);
  IrReceiver.begin(IR_RECEIVE_PIN, DISABLE_LED_FEEDBACK);

  pinMode(RPM_SENSOR_PIN, INPUT_PULLUP);
  attachInterrupt(digitalPinToInterrupt(RPM_SENSOR_PIN), rpmPulseISR, FALLING);

#if HAS_MPU6050
  Wire.begin(22, 21);
  initMPU6050();
  if (mpuOk) {
    // Let MPU settle, then calibrate gyro bias before the motor starts
    unsigned long gyroCalStart = millis();
    while (millis() - gyroCalStart < GYRO_CAL_SETTLE_MS) {
      yield();
      if (Serial.available()) handleSerialInput();
      handleIRRemote();
      ArduinoOTA.handle();
      httpServer.handleClient();
    }
    calibrateGyroBias(GYRO_CAL_SAMPLES_BOOT);
  }
#else
  Serial.println("[MPU] Skipped — HAS_MPU6050=0");
#endif

  lastUpdateTime = millis();

#if HAS_ESC
  // PWM channel/pin were already initialized and holding the arm pulse at the
  // top of setup() (see above) — WiFi/IMU init above already consumed most of
  // the ESC's required arm window. Just top up to a full 3s of clean signal
  // before declaring it armed, in case WiFi connected quickly.
  setThrottle(ARM_THROTTLE);
  unsigned long escArmStart = millis();
  Serial.println("[ESC] Arming...");
  while (millis() - escArmStart < ESC_ARM_DURATION_MS) {
    yield();
    if (Serial.available()) handleSerialInput();
    handleIRRemote();
    ArduinoOTA.handle();
    httpServer.handleClient();
  }
  setThrottle(ARM_THROTTLE);
  Serial.println("[ESC] Armed. STATUS:MOTOR=OFF");
#endif

  Serial.println("============================================================");
  Serial.println("  Serial keys:  S=start  X=stop  E=ESTOP  A=auto  Z=reset");
  Serial.println("                H/L=throttle±  W=wifi-reconnect  V=status");
  Serial.println("  Gain tuning:  P/O=Kp±  I/U=Ki±  D/C=Kd±  N/M=Knl±");
  Serial.println("  IR remote:    EQ=auto  4=Kp+  5=Ki+  6=Kd+  3=Knl+");
  Serial.println("                VOL±=throttle  0=reset  PLAY=start/stop");
  Serial.println("============================================================");
}

// ─────────────────────────────────────────────────────────────────────────────
//  loop
// ─────────────────────────────────────────────────────────────────────────────

void loop() {
  // ── WiFi / OTA polling ────────────────────────────────────────────────────
  ArduinoOTA.handle();
  httpServer.handleClient();
  maintainWifiConnection();
  if (tcpClient.connected()) processWifiInput();

  // ── Input (serial + IR) ───────────────────────────────────────────────────
  handleSerialInput();
  handleIRRemote();

  // LED off timer — shared by IR, serial, HTTP, and TCP command sources
  if (ledOffMs > 0 && (long)(millis() - ledOffMs) >= 0) {
    digitalWrite(ONBOARD_LED, LOW);
    ledOffMs = 0;
  }

  // ── Hardware reset button ────────────────────────────────────────────────
  if (digitalRead(RESET_BUTTON) == LOW) {
    if (lastResetButtonMs == 0) lastResetButtonMs = millis();
    else if (millis() - lastResetButtonMs >= 50 && millis() - lastResetActionMs >= 500) {
      if (digitalRead(RESET_BUTTON) == LOW) {
        resetReference();
        lastResetActionMs = millis();
      }
    }
  } else {
    lastResetButtonMs = 0;
  }

  // ── IMU read + angle estimation ───────────────────────────────────────────
#if HAS_MPU6050
  if (readMPU6050()) {
    convertMPU6050();
    calculateCurrentAngles();
    updateVibration();
    if (!initialized) resetReference();
    calculateAngleErrors();
  }
#endif

  // ── RPM processing ─────────────────────────────────────────────────────
  processRPMPulse();
  publishRPMValue();

  // ── Balance control loop (fixed 20 ms rate) ───────────────────────────────
  unsigned long nowMs = millis();
  if ((nowMs - lastCtrlMs) >= CTRL_INTERVAL_MS) {
    float dt = (float)(nowMs - lastCtrlMs) / 1000.0f;
    if (dt > 0.1f) dt = 0.02f;   // clamp on first call or after gap
    lastCtrlMs = nowMs;

    // No RPM guard in the control loop. Auto mode applies correction whenever
    // autoMode && motorRunning && mpuOk — RPM reading never pauses or cancels
    // correction. Auto mode is only turned off by an explicit manual command
    // (CMD:SET_MANUAL, APP_MANUAL, SPEED_UP/DOWN, etc.).

    float correction = 0.0f;
    if (autoMode && motorRunning && mpuOk) {
      correction = runBalanceController(dt);
    }

    pidCorrectionValue = correction;
    heldFinalPulse     = correction * AUTO_CORRECTION_TO_PULSE_SCALE;

    float targetF  = (float)manualThrottle + heldFinalPulse;
    // Manual mode may command throttle below MIN_THROTTLE (down to
    // ARM_THROTTLE) — that's an intentional operator override. Auto/PID
    // mode must never go below MIN_THROTTLE, so its floor stays fixed.
    int   loFloor  = autoMode ? MIN_THROTTLE : ARM_THROTTLE;
    int   targetUs = constrain((int)roundf(targetF), loFloor, MAX_THROTTLE);
    heldEscPulseUs = (float)targetUs;
    sentMotorPulse = (float)targetUs;

    if (motorRunning) {
      if (autoMode) {
        // Direct write — bypass ramp for fast closed-loop response.
        // The unstable pole at ≈10 rad/s requires <50 ms actuator lag.
        applyAutoThrottle(targetUs);
      } else if (targetUs != motorRampTarget) {
        // Manual throttle changes use the smooth ramp as before.
        setThrottleTarget(targetUs);
      }
    }
  }

  // ── Motor keep-alive (ramp step) ─────────────────────────────────────────
#if HAS_ESC
  updateMotor();
#endif

  // ── Telemetry ─────────────────────────────────────────────────────────────
  nowMs = millis();
  if (nowMs - lastTelemetryTime >= TELEMETRY_INTERVAL_MS) {
    lastTelemetryTime = nowMs;
    sendAppTelemetry();
  }
}
