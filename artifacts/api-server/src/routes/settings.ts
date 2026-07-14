import { Router } from "express";
import { getSettings, updateSettings } from "../lib/settingsStore";
import { logger } from "../lib/logger";
import { queueSerialWrite } from "../lib/serial-queue";
import { sendWifiCommand, isWifiConnected } from "../lib/wifi-tcp-server";
import { getMotorState } from "../lib/motor";
import { getLatestSession } from "./session";

const router = Router();

router.get("/settings", (_req, res) => {
  return res.json(getSettings());
});

/** Settings must not be changed from the app while a session is active or the
 *  motor is running — the ESP32 firmware, dashboard button, and IR remote all
 *  treat CMD:SET_* pushes as authoritative, so a mid-run app edit can race
 *  the firmware's own state and cause things like PID auto mode flipping
 *  back off. PID tuning while running is still possible, but only via the IR
 *  remote and only when auto mode is off (enforced in firmware). */
async function isSettingsLocked(): Promise<boolean> {
  const motorState = getMotorState();
  if (motorState === "on") return true;
  const session = await getLatestSession();
  return session?.status === "running" || session?.status === "warning";
}

router.put("/settings", async (req, res) => {
  try {
    if (await isSettingsLocked()) {
      return res.status(423).json({
        error: "Settings are locked while a session is active or the motor is running. Stop the session and motor first, or use the IR remote to tune PID gains (only available with auto mode off).",
      });
    }
    const patch = req.body as Record<string, unknown>;
    const numericAllowed = [
      "targetRpm", "targetDurationHours", "maxTiltAngle",
      "tempWarnThreshold", "tempCritThreshold", "vibWarnThreshold", "vibCritThreshold",
      "pidKp", "pidKi", "pidKd",
      "pidSetpointDeg", "pidDeadbandDeg", "pidIntegralMax", "pidBaseThrottle", "armThrottleUs",
      "rampUpRpmPerSec", "rampDownRpmPerSec", "pwmFrequencyHz", "pwmDeadbandPercent", "maxRpmLimit",
      "motorSpeedStepUs", "minThrottleUs", "maxThrottleUs",
      "irKpStep", "irKiStep", "irKdStep", "irKnlStep",
      "autoNlThreshDeg", "autoMinRpm", "autoMaxCorrectionUs",
      "rpmTimeoutMs", "rpmReportIntervalMs", "telemetryIntervalMs",
    ];
    const boolAllowed = ["enforceTilt", "enforceTempCrit", "enforceVibCrit"];
    const clean: Record<string, number | boolean> = {};
    for (const key of numericAllowed) {
      if (key in patch && typeof patch[key] === "number") {
        clean[key] = patch[key] as number;
      }
    }
    for (const key of boolAllowed) {
      if (key in patch && typeof patch[key] === "boolean") {
        clean[key] = patch[key] as boolean;
      }
    }

    // Relational validation: min/max throttle bounds must not invert, and
    // manual speed step must fit within them or every press would be a no-op.
    const existing = getSettings();
    const nextMin = "minThrottleUs" in clean ? (clean.minThrottleUs as number) : existing.minThrottleUs;
    const nextMax = "maxThrottleUs" in clean ? (clean.maxThrottleUs as number) : existing.maxThrottleUs;
    if (("minThrottleUs" in clean || "maxThrottleUs" in clean) && nextMin >= nextMax) {
      return res.status(400).json({ error: "minThrottleUs must be less than maxThrottleUs" });
    }
    const nextStep = "motorSpeedStepUs" in clean ? (clean.motorSpeedStepUs as number) : existing.motorSpeedStepUs;
    if (nextStep >= nextMax - nextMin) {
      return res.status(400).json({ error: "motorSpeedStepUs must be smaller than the throttle range (maxThrottleUs - minThrottleUs)" });
    }
    const nextArm = "armThrottleUs" in clean ? (clean.armThrottleUs as number) : existing.armThrottleUs;
    if (nextArm >= nextMin) {
      return res.status(400).json({ error: "armThrottleUs (starting pulse) must be less than minThrottleUs" });
    }

    const updated = updateSettings(clean);

    // Push PID gains if any gain changed
    if ("pidKp" in clean || "pidKi" in clean || "pidKd" in clean) {
      const cmd = `CMD:SET_PID:${updated.pidKp},${updated.pidKi},${updated.pidKd}`;
      const wifiSent = sendWifiCommand(cmd);
      if (!wifiSent || !isWifiConnected()) queueSerialWrite(cmd);
      logger.info({ cmd }, "PID gains forwarded to ESP32");
    }

    // Push PID config (setpoint, deadband, integral max) if any of those changed
    if ("pidSetpointDeg" in clean || "pidDeadbandDeg" in clean || "pidIntegralMax" in clean) {
      const cmd = `CMD:SET_PID_CFG:${updated.pidSetpointDeg},${updated.pidDeadbandDeg},${updated.pidIntegralMax}`;
      const wifiSent = sendWifiCommand(cmd);
      if (!wifiSent || !isWifiConnected()) queueSerialWrite(cmd);
      logger.info({ cmd }, "PID config forwarded to ESP32");
    }

    // Push base throttle if it changed
    if ("pidBaseThrottle" in clean) {
      const value = Math.round(Math.max(1050, Math.min(1800, updated.pidBaseThrottle)));
      const cmd = `CMD:SET_BASE_THROTTLE:${value}`;
      const wifiSent = sendWifiCommand(cmd);
      if (!wifiSent || !isWifiConnected()) queueSerialWrite(cmd);
      logger.info({ cmd }, "PID base throttle forwarded to ESP32");
    }

    // Push starting pulse (arm throttle) if it changed
    if ("armThrottleUs" in clean) {
      const cmd = `CMD:SET_ARM_THROTTLE:${Math.round(updated.armThrottleUs)}`;
      const wifiSent = sendWifiCommand(cmd);
      if (!wifiSent || !isWifiConnected()) queueSerialWrite(cmd);
      logger.info({ cmd }, "Starting pulse (arm throttle) forwarded to ESP32");
    }

    // Push manual speed step if it changed
    if ("motorSpeedStepUs" in clean) {
      const cmd = `CMD:SET_SPEED_STEP:${Math.round(updated.motorSpeedStepUs)}`;
      const wifiSent = sendWifiCommand(cmd);
      if (!wifiSent || !isWifiConnected()) queueSerialWrite(cmd);
      logger.info({ cmd }, "Speed step forwarded to ESP32");
    }

    // Push throttle safety limits if either bound changed
    if ("minThrottleUs" in clean || "maxThrottleUs" in clean) {
      const cmd = `CMD:SET_THROTTLE_LIMITS:${Math.round(updated.minThrottleUs)},${Math.round(updated.maxThrottleUs)}`;
      const wifiSent = sendWifiCommand(cmd);
      if (!wifiSent || !isWifiConnected()) queueSerialWrite(cmd);
      logger.info({ cmd }, "Throttle limits forwarded to ESP32");
    }

    // Push IR remote tuning step sizes if any changed
    if ("irKpStep" in clean || "irKiStep" in clean || "irKdStep" in clean || "irKnlStep" in clean) {
      const cmd = `CMD:SET_IR_STEPS:${updated.irKpStep},${updated.irKiStep},${updated.irKdStep},${updated.irKnlStep}`;
      const wifiSent = sendWifiCommand(cmd);
      if (!wifiSent || !isWifiConnected()) queueSerialWrite(cmd);
      logger.info({ cmd }, "IR tuning steps forwarded to ESP32");
    }

    // Push auto-mode tuning if any changed
    if ("autoNlThreshDeg" in clean || "autoMinRpm" in clean || "autoMaxCorrectionUs" in clean) {
      const cmd = `CMD:SET_AUTO_TUNING:${updated.autoNlThreshDeg},${updated.autoMinRpm},${updated.autoMaxCorrectionUs}`;
      const wifiSent = sendWifiCommand(cmd);
      if (!wifiSent || !isWifiConnected()) queueSerialWrite(cmd);
      logger.info({ cmd }, "Auto-mode tuning forwarded to ESP32");
    }

    // Push timing/reporting cadence if any changed
    if ("rpmTimeoutMs" in clean || "rpmReportIntervalMs" in clean || "telemetryIntervalMs" in clean) {
      const cmd = `CMD:SET_TIMING:${Math.round(updated.rpmTimeoutMs)},${Math.round(updated.rpmReportIntervalMs)},${Math.round(updated.telemetryIntervalMs)}`;
      const wifiSent = sendWifiCommand(cmd);
      if (!wifiSent || !isWifiConnected()) queueSerialWrite(cmd);
      logger.info({ cmd }, "Timing settings forwarded to ESP32");
    }

    logger.info({ settings: updated }, "Settings updated");
    return res.json(updated);
  } catch (err) {
    logger.error({ err }, "Failed to update settings");
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
