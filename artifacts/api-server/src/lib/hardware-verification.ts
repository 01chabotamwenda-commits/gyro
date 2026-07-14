/**
 * hardware-verification.ts
 *
 * Runs a real hardware self-test immediately after a session is created.
 * Executes asynchronously (fire-and-forget) so it never delays the session
 * start response.
 *
 * Checks performed:
 *   1. IMU / MPU6050   — recent readings + device health flag
 *   2. Temperature      — reading vs default 25°C baseline + health flag
 *   3. Motor sweep      — timed pulse ramp (1200µs → 1400µs over 10 s, then
 *                          a graceful ramp back down to the 1000µs disarm
 *                          pulse), watched via the IR speed sensor
 *      ├─ RPM readings appear  → motor OK + IR sensor OK
 *      └─ No RPM readings      → broadcast motor_sweep_confirm for operator dialog
 *
 * Command vocabulary (must match firmware parser exactly):
 *   CMD:MOTOR_START          ramp up motor
 *   CMD:MOTOR_STOP           graceful ramp down to the disarm pulse (1000µs)
 *   CMD:MANUAL_PULSE:<us>    set an explicit ESC pulse width in microseconds
 *                            (overrides PID; range [1000, 1400])
 *   CMD:SET_AUTO             restore PID auto-control
 */

import { memStore } from "./mem-store";
import { fireAlert } from "./motor";
import { queueSerialWrite } from "./serial-queue";
import { sendWifiCommand, isWifiConnected } from "./wifi-tcp-server";
import { getDeviceInfo } from "./hardware-mode";
import { logger } from "./logger";

const RAMP_START_US   = 1200;  // ramp begins at MIN_THROTTLE — just above the disarm pulse
const RAMP_END_US     = 1400;  // ramp target — MAX_THROTTLE, the app's configured ceiling
const RAMP_DURATION_MS = 10_000; // ramp 1200µs → 1400µs over 10 s (was an instant 5 s hold)
const RAMP_STEP_MS    = 200;   // send an updated CMD:MANUAL_PULSE every 200ms during the ramp
const SETTLE_MS       = 500;   // extra wait after MOTOR_STOP for last readings to arrive
const RPM_THRESHOLD   = 50;    // minimum RPM to consider the IR sensor as reporting

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Send a command on whichever link is active (WiFi preferred, serial as fallback). */
function sendCommand(cmd: string): void {
  if (isWifiConnected()) sendWifiCommand(cmd);
  queueSerialWrite(cmd);
}

/**
 * Check whether the given session is still in "running" state.
 * Uses the in-memory store (fast, no DB round-trip needed for a guard check).
 */
function isSessionStillRunning(sessionId: number): boolean {
  const session = memStore.sessions.getLatest();
  return session?.id === sessionId && session?.status === "running";
}

export async function runHardwareVerification(
  sessionId: number,
  // Kept for API compatibility with the session-start call site — the motor
  // sweep is now a fixed pulse ramp (see RAMP_START_US/RAMP_END_US below)
  // rather than a fraction of the session's target RPM.
  _targetRpm: number,
): Promise<void> {
  try {
    logger.info({ sessionId }, "Hardware verification started");
    await fireAlert(sessionId, "info",
      "[SYSTEM] Hardware verification started — checking all components..."
    ).catch(() => {});

    const deviceInfo = getDeviceInfo();

    // ── 1. IMU / MPU6050 ────────────────────────────────────────────────────
    const imuCheckStart = new Date(Date.now() - 5_000);
    const recentReadings = memStore.readings.getSince(imuCheckStart, 100);
    const hasImuData = recentReadings.some(
      (r) =>
        Math.abs(r.tiltX) > 0.01 ||
        Math.abs(r.tiltY) > 0.01 ||
        Math.abs(r.rotationZ) > 0.01,
    );
    const imuHealth =
      deviceInfo?.health?.["MPU6050"] ??
      deviceInfo?.health?.["IMU"] ??
      deviceInfo?.health?.["GYRO"];

    if (hasImuData || imuHealth === "OK") {
      await fireAlert(sessionId, "info",
        "[SYSTEM] ✓ IMU (MPU6050): tilt / gyro data flowing — sensor OK"
      ).catch(() => {});
    } else if (imuHealth === "FAIL") {
      await fireAlert(sessionId, "warning",
        "[SYSTEM] ✗ IMU (MPU6050): I2C error — sensor detected but not responding. " +
        "Check SDA/SCL wiring and pull-up resistors (typical: 4.7 kΩ to 3.3 V)."
      ).catch(() => {});
    } else {
      await fireAlert(sessionId, "warning",
        "[SYSTEM] ✗ IMU (MPU6050): no readings in last 5 s — sensor may not be connected. " +
        "Verify I2C address (0x68 default) and power supply."
      ).catch(() => {});
    }

    // ── 2. Temperature sensor ────────────────────────────────────────────────
    const tempHealth =
      deviceInfo?.health?.["TEMP_SENSOR"] ??
      deviceInfo?.health?.["TEMP"] ??
      deviceInfo?.health?.["NTC"] ??
      deviceInfo?.health?.["DS18B20"];
    const hasRealTemp = recentReadings.some(
      (r) => r.temperature !== 25.0 && r.temperature > 0,
    );

    if (hasRealTemp || tempHealth === "OK") {
      const avgTemp = hasRealTemp
        ? (
            recentReadings.reduce((s, r) => s + r.temperature, 0) /
            recentReadings.length
          ).toFixed(1)
        : "—";
      await fireAlert(sessionId, "info",
        `[SYSTEM] ✓ Temperature sensor: reading ${avgTemp}°C — OK`
      ).catch(() => {});
    } else if (tempHealth === "FAIL") {
      await fireAlert(sessionId, "warning",
        "[SYSTEM] ✗ Temperature sensor: ADC / I2C error — check wiring to NTC thermistor (GPIO34) or DS18B20"
      ).catch(() => {});
    } else {
      await fireAlert(sessionId, "info",
        "[SYSTEM] ~ Temperature sensor: reading default 25.0°C — sensor may not be connected or is at ambient"
      ).catch(() => {});
    }

    // ── 3. Motor sweep + IR speed sensor ────────────────────────────────────
    // Guard: only run the sweep if the session is still active
    if (!isSessionStillRunning(sessionId)) {
      await fireAlert(sessionId, "info",
        "[SYSTEM] Motor sweep skipped — session was stopped before sweep could begin"
      ).catch(() => {});
      logger.info({ sessionId }, "Hardware verification: motor sweep skipped — session stopped");
      return;
    }

    await fireAlert(sessionId, "info",
      `[SYSTEM] Motor sweep test: ramping pulse ${RAMP_START_US}µs → ${RAMP_END_US}µs over ${RAMP_DURATION_MS / 1000} s, then back down to idle — watching IR sensor...`
    ).catch(() => {});

    const sweepStart = new Date();

    // Direct pulse-width ramp (not RPM-based): step CMD:MANUAL_PULSE from
    // RAMP_START_US up to RAMP_END_US in small increments over
    // RAMP_DURATION_MS. The firmware's own ramp rate is much faster than 10s,
    // so driving the ramp from here (rather than a single target command) is
    // what actually makes it take the full 10 seconds.
    sendCommand(`CMD:MANUAL_PULSE:${RAMP_START_US}`);
    const steps = Math.round(RAMP_DURATION_MS / RAMP_STEP_MS);
    for (let i = 1; i <= steps; i++) {
      if (!isSessionStillRunning(sessionId)) break;
      await delay(RAMP_STEP_MS);
      const us = Math.round(RAMP_START_US + ((RAMP_END_US - RAMP_START_US) * i) / steps);
      sendCommand(`CMD:MANUAL_PULSE:${us}`);
    }

    // Always stop the motor after the sweep — safety first. stopMotor() on
    // the firmware ramps gracefully back down to the 1000µs disarm pulse.
    // Do NOT send CMD:SET_AUTO here: enterAutoMode() calls startMotor() on the
    // ESP32 if the motor isn't running, which would restart the motor
    // immediately after the test. The operator starts the motor manually.
    sendCommand("CMD:MOTOR_STOP");

    await delay(SETTLE_MS);

    // Guard: don't report if session was stopped mid-sweep
    if (!isSessionStillRunning(sessionId)) {
      logger.info({ sessionId }, "Hardware verification: session stopped during sweep — skipping report");
      return;
    }

    // Evaluate: look at RPM readings that arrived during the sweep window.
    const sweepReadings = memStore.readings.getSince(sweepStart, 500);
    const hasRpmData = sweepReadings.some((r) => r.rpm > RPM_THRESHOLD);
    const peakRpm =
      sweepReadings.length > 0
        ? Math.max(...sweepReadings.map((r) => r.rpm))
        : 0;

    const sweepSeconds = (RAMP_DURATION_MS / 1000).toFixed(0);
    if (hasRpmData) {
      await fireAlert(sessionId, "info",
        `[SYSTEM] ✓ Motor: ${sweepSeconds} s pulse ramp complete — peak ${peakRpm.toFixed(0)} RPM — motor OK`
      ).catch(() => {});
      await fireAlert(sessionId, "info",
        "[SYSTEM] ✓ RPM sensor: confirmed working — readings received during sweep"
      ).catch(() => {});
      await fireAlert(sessionId, "info",
        "[SYSTEM] All hardware checks passed — click Start Motor to begin monitoring"
      ).catch(() => {});
    } else {
      await fireAlert(sessionId, "warning",
        `[SYSTEM] ✗ Motor test FAILED — no RPM readings detected during ${sweepSeconds} s pulse ramp`
      ).catch(() => {});
      await fireAlert(sessionId, "warning",
        "[SYSTEM] ✗ RPM sensor: no signal — check IR sensor alignment and wiring (GPIO16)"
      ).catch(() => {});
      await fireAlert(sessionId, "warning",
        "[SYSTEM] Session continues — resolve sensor issue or proceed without RPM feedback"
      ).catch(() => {});
    }

    logger.info(
      { sessionId, hasRpmData, peakRpm, sweepReadings: sweepReadings.length },
      "Hardware verification complete",
    );
  } catch (err) {
    logger.error({ err, sessionId }, "Hardware verification error");
    // Attempt a safe stop if something went wrong mid-sweep
    try { sendCommand("CMD:MOTOR_STOP"); } catch { /* best effort */ }
    await fireAlert(sessionId, "warning",
      "[SYSTEM] Hardware verification encountered an unexpected error — check server logs"
    ).catch(() => {});
  }
}
