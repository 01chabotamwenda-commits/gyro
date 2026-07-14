import { readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { getDataDir } from "./dataDir";

export interface Settings {
  targetRpm: number;
  targetDurationHours: number;
  maxTiltAngle: number;
  tempWarnThreshold: number;
  tempCritThreshold: number;
  vibWarnThreshold: number;
  vibCritThreshold: number;
  /** When true, tilt breach triggers emergency stop. When false, fires warning only (safe for calibration). */
  enforceTilt: boolean;
  /** When true, critical temperature triggers emergency stop. When false, fires warning only. */
  enforceTempCrit: boolean;
  /** When true, critical vibration triggers emergency stop. When false, fires warning only. */
  enforceVibCrit: boolean;
  pidKp: number;
  pidKi: number;
  pidKd: number;
  /** Target tilt angle in degrees. 0 = perfectly level (upright). */
  pidSetpointDeg: number;
  /** Ignore tilt error below this threshold (noise floor), degrees. */
  pidDeadbandDeg: number;
  /** Anti-windup clamp on the integral term, throttle µs units. */
  pidIntegralMax: number;
  /**
   * PID idle/base throttle in µs. The incremental PID adds/subtracts from
   * this floor — the motor never drops below it while PID is active.
   * Range: 1050 (MIN_THROTTLE) – 1800 (MAX_THROTTLE). Default: 1100 (just above idle).
   */
  pidBaseThrottle: number;
  /**
   * "Starting pulse" — the ESC armed-but-not-spinning pulse width sent
   * whenever the motor is off (µs). Firmware constant `ARM_THROTTLE`,
   * now runtime-settable via `CMD:SET_ARM_THROTTLE:<us>`. Must stay below
   * minThrottleUs — the ESC needs a distinguishable "off" signal.
   */
  armThrottleUs: number;
  rampUpRpmPerSec: number;
  rampDownRpmPerSec: number;
  pwmFrequencyHz: number;
  pwmDeadbandPercent: number;
  maxRpmLimit: number;
  /** Manual throttle step (Speed Up/Down, keyboard h/l, IR VOL+/VOL-), µs. */
  motorSpeedStepUs: number;
  /** Safety bounds clamped on every manual/PID throttle write, µs. */
  minThrottleUs: number;
  maxThrottleUs: number;
  /** IR remote PID-tuning increment sizes (buttons 1-6). */
  irKpStep: number;
  irKiStep: number;
  irKdStep: number;
  irKnlStep: number;
  /** Auto-mode tuning: nonlinear-boost threshold (deg), min RPM to allow auto mode, PID output clamp (µs). */
  autoNlThreshDeg: number;
  autoMinRpm: number;
  autoMaxCorrectionUs: number;
  /** Sensor timeout and reporting cadence, ms. */
  rpmTimeoutMs: number;
  rpmReportIntervalMs: number;
  telemetryIntervalMs: number;
}

const defaults: Settings = {
  targetRpm: 8000,
  targetDurationHours: 24,
  maxTiltAngle: 45,
  tempWarnThreshold: 55,
  tempCritThreshold: 65,
  vibWarnThreshold: 4.5,
  vibCritThreshold: 7.1,
  enforceTilt: true,
  enforceTempCrit: true,
  enforceVibCrit: true,
  pidKp: 30.0,
  pidKi: 1.5,
  pidKd: 3.0,
  pidSetpointDeg: 0.0,
  pidDeadbandDeg: 0.5,
  pidIntegralMax: 250.0,
  pidBaseThrottle: 1100,
  armThrottleUs: 1000,
  rampUpRpmPerSec: 200,
  rampDownRpmPerSec: 500,
  pwmFrequencyHz: 20000,
  pwmDeadbandPercent: 5,
  maxRpmLimit: 12000,
  motorSpeedStepUs: 5,
  minThrottleUs: 1200,
  maxThrottleUs: 1400,
  irKpStep: 1.0,
  irKiStep: 0.5,
  irKdStep: 0.5,
  irKnlStep: 0.5,
  autoNlThreshDeg: 3.0,
  autoMinRpm: 500,
  autoMaxCorrectionUs: 700,
  rpmTimeoutMs: 2000,
  rpmReportIntervalMs: 250,
  telemetryIntervalMs: 500,
};

const SETTINGS_FILE = join(getDataDir(), "settings.json");

const BOOL_KEYS: ReadonlySet<keyof Settings> = new Set<keyof Settings>([
  "enforceTilt", "enforceTempCrit", "enforceVibCrit",
]);

function loadFromDisk(): Partial<Settings> {
  try {
    const raw = readFileSync(SETTINGS_FILE, "utf-8");
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const cleaned: Partial<Settings> = {};
    const keys = Object.keys(defaults) as (keyof Settings)[];
    for (const key of keys) {
      if (BOOL_KEYS.has(key)) {
        if (typeof parsed[key] === "boolean") {
          (cleaned as Record<string, boolean>)[key] = parsed[key] as boolean;
        }
      } else {
        if (typeof parsed[key] === "number") {
          (cleaned as Record<string, number>)[key] = parsed[key] as number;
        }
      }
    }
    return cleaned;
  } catch {
    return {};
  }
}

function saveToDisk(s: Settings): void {
  try {
    writeFileSync(SETTINGS_FILE, JSON.stringify(s, null, 2), "utf-8");
  } catch {
    // non-fatal — continue without persistence
  }
}

let current: Settings = { ...defaults, ...loadFromDisk() };

export function getSettings(): Settings {
  return { ...current };
}

export function updateSettings(patch: Partial<Settings>): Settings {
  current = { ...current, ...patch };
  saveToDisk(current);
  return { ...current };
}
