import { Router } from "express";
import { db, sessionsTable } from "@workspace/db";
import { desc, eq } from "drizzle-orm";
import { getMotorState, setMotorCommand, fireAlert } from "../lib/motor";
import { logger } from "../lib/logger";
import { memStore } from "../lib/mem-store";
import { queueSerialWrite } from "../lib/serial-queue";
import { sendWifiCommand, isWifiConnected } from "../lib/wifi-tcp-server";
import { isHardwareConnected } from "../lib/hardware-mode";

const router = Router();

type AnySession = {
  id: number;
  status: string;
  startedAt: Date | null;
  stoppedAt: Date | null;
};

async function endActiveSession(reason: "error" | "completed"): Promise<AnySession | null> {
  const now = new Date();

  if (!db) {
    const session = memStore.sessions.getLatest();
    if (!session || session.status !== "running") return null;
    return memStore.sessions.update(session.id, { status: reason, stoppedAt: now });
  }

  try {
    const rows = await db.select().from(sessionsTable).orderBy(desc(sessionsTable.id)).limit(1);
    const session = rows[0];
    if (!session || session.status !== "running") return null;
    const [updated] = await db
      .update(sessionsTable)
      .set({ status: reason, stoppedAt: now })
      .where(eq(sessionsTable.id, session.id))
      .returning();
    return updated;
  } catch {
    const session = memStore.sessions.getLatest();
    if (!session || session.status !== "running") return null;
    return memStore.sessions.update(session.id, { status: reason, stoppedAt: now });
  }
}

router.post("/motor/command", async (req, res) => {
  try {
    const command = req.body?.command as string;

    if (command === "emergency_shutdown") {
      setMotorCommand("emergency_stop");
      // Tell the ESP32 immediately — both channels
      sendWifiCommand("CMD:EMERGENCY_STOP");
      queueSerialWrite("CMD:EMERGENCY_STOP");

      const session = await endActiveSession("error");

      await fireAlert(
        session?.id ?? null,
        "warning",
        "[USER] EMERGENCY SHUTDOWN — motor halted, session terminated"
      ).catch(() => {});

      logger.warn({ sessionId: session?.id }, "Emergency shutdown executed");
      return res.json({ ok: true, motorState: "emergency_stopped", message: "Emergency shutdown executed" });
    }

    if (!["on", "off", "emergency_stop"].includes(command)) {
      return res.status(400).json({ ok: false, motorState: getMotorState(), message: "Invalid command" });
    }

    if (command === "on") {
      // Clear any prior e-stop so the operator can restart without ending the session.
      if (getMotorState() === "emergency_stopped") {
        setMotorCommand("off");
      }

      // Gate 1: hardware must be connected
      if (!isHardwareConnected()) {
        logger.warn("Motor on rejected — hardware not connected");
        return res.status(503).json({ ok: false, motorState: getMotorState(), message: "Hardware not connected — cannot start motor without an active ESP32 link" });
      }

      // Gate 2: an active session must exist
      let sessionActive = false;
      if (!db) {
        const s = memStore.sessions.getLatest();
        sessionActive = s?.status === "running";
      } else {
        try {
          const rows = await db.select().from(sessionsTable).orderBy(desc(sessionsTable.id)).limit(1);
          const session = rows[0];
          sessionActive = session?.status === "running" || session?.status === "warning";
        } catch {
          const s = memStore.sessions.getLatest();
          sessionActive = s?.status === "running";
        }
      }

      if (!sessionActive) {
        logger.warn("Motor on rejected — no active session");
        return res.status(403).json({ ok: false, motorState: getMotorState(), message: "No active session — start a session before enabling the motor" });
      }
    }

    const motorState = setMotorCommand(command as "on" | "off" | "emergency_stop");

    // Forward command to ESP32 via serial queue
    if (command === "on") {
      if (!sendWifiCommand("CMD:MOTOR_START") || !isWifiConnected()) queueSerialWrite("CMD:MOTOR_START");
    } else if (command === "off") {
      if (!sendWifiCommand("CMD:MOTOR_STOP") || !isWifiConnected()) queueSerialWrite("CMD:MOTOR_STOP");
    } else if (command === "emergency_stop") {
      sendWifiCommand("CMD:EMERGENCY_STOP");
      queueSerialWrite("CMD:EMERGENCY_STOP");
    }

    const userMsg =
      command === "on" ? "[USER] Motor commanded ON via dashboard" :
      command === "off" ? "[USER] Motor commanded OFF via dashboard" :
      "[USER] EMERGENCY STOP initiated via dashboard";

    await fireAlert(null, command === "emergency_stop" ? "warning" : "info", userMsg).catch(() => {});

    const stateMsg =
      motorState === "on" ? "Motor started" :
      motorState === "off" ? "Motor stopped" :
      "Emergency stop executed";

    logger.info({ command, motorState }, "Motor command received");
    return res.json({ ok: true, motorState, message: stateMsg });
  } catch (err) {
    logger.warn({ err }, "Motor command error");
    return res.status(400).json({ ok: false, motorState: getMotorState(), message: "Command failed" });
  }
});

/**
 * POST /api/motor/setpoint
 * Set a manual RPM target or switch back to auto (PID-controlled) mode.
 * Forwards the appropriate command to the ESP32 over serial and/or WiFi.
 */
router.post("/motor/setpoint", async (req, res) => {
  try {
    const { targetRpm, mode } = req.body as { targetRpm?: unknown; mode?: unknown };

    if (typeof targetRpm !== "number" || !isFinite(targetRpm) || targetRpm < 0 || targetRpm > 12000) {
      return res.status(400).json({ ok: false, targetRpm: 0, mode: "manual", message: "targetRpm must be an integer 0–12000" });
    }
    if (mode !== "auto" && mode !== "manual") {
      return res.status(400).json({ ok: false, targetRpm, mode: "manual", message: "mode must be 'auto' or 'manual'" });
    }

    const cmd = mode === "auto" ? "CMD:SET_AUTO" : `CMD:MANUAL_RPM:${Math.round(targetRpm)}`;
    const wifiSent = sendWifiCommand(cmd);
    if (!wifiSent || !isWifiConnected()) queueSerialWrite(cmd);

    const msg = mode === "auto"
      ? "Switched to auto (PID) control"
      : `Manual RPM setpoint → ${Math.round(targetRpm)} RPM`;

    logger.info({ targetRpm, mode, cmd }, "Motor setpoint commanded");
    await fireAlert(null, "info", `[USER] ${msg}`).catch(() => {});

    return res.json({ ok: true, targetRpm: Math.round(targetRpm), mode, message: msg });
  } catch (err) {
    logger.warn({ err }, "Motor setpoint error");
    return res.status(400).json({ ok: false, targetRpm: 0, mode: "manual", message: "Command failed" });
  }
});

/**
 * POST /api/motor/pid
 * Toggle PID auto-stabilization on/off without changing the current throttle.
 * Enabling requires an active hardware link — the ESP32 itself rejects
 * CMD:SET_AUTO if the MPU6050 isn't available, but we forward regardless
 * (the firmware logs and no-ops in that case).
 */
router.post("/motor/pid", async (req, res) => {
  try {
    const { enabled } = req.body as { enabled?: unknown };

    if (typeof enabled !== "boolean") {
      return res.status(400).json({ ok: false, mode: "manual", message: "enabled must be a boolean" });
    }

    const cmd = enabled ? "CMD:SET_AUTO" : "CMD:SET_MANUAL";
    const wifiSent = sendWifiCommand(cmd);
    if (!wifiSent || !isWifiConnected()) queueSerialWrite(cmd);

    const mode = enabled ? "auto" : "manual";
    const msg = enabled ? "PID auto mode ON" : "PID auto mode OFF";

    logger.info({ enabled, cmd }, "PID toggle commanded");
    await fireAlert(null, "info", `[USER] ${msg}`).catch(() => {});

    return res.json({ ok: true, mode, message: msg });
  } catch (err) {
    logger.warn({ err }, "PID toggle error");
    return res.status(400).json({ ok: false, mode: "manual", message: "Command failed" });
  }
});

/**
 * POST /api/motor/pulse
 * Set the ESC idle/base pulse width in microseconds (1200–1800 µs).
 * Sends CMD:SET_IDLE:<value> to the ESP32 via serial and/or WiFi.
 */
router.post("/motor/pulse", async (req, res) => {
  try {
    const pulse = Number(req.body?.pulse);
    if (!isFinite(pulse) || pulse < 1200 || pulse > 1800) {
      return res.status(400).json({ ok: false, message: "pulse must be 1200–1800 µs" });
    }
    const value = Math.round(pulse);
    const cmd = `CMD:SET_IDLE:${value}`;
    const wifiSent = sendWifiCommand(cmd);
    if (!wifiSent || !isWifiConnected()) queueSerialWrite(cmd);
    const msg = `Idle pulse → ${value} µs`;
    logger.info({ pulse: value, cmd }, "Motor idle pulse set");
    await fireAlert(null, "info", `[USER] ${msg}`).catch(() => {});
    return res.json({ ok: true, pulse: value, message: msg });
  } catch (err) {
    logger.warn({ err }, "Motor pulse error");
    return res.status(400).json({ ok: false, message: "Command failed" });
  }
});

export default router;
