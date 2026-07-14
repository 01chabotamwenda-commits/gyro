/**
 * ingest.ts — Hardware data endpoints
 *
 * POST /api/readings/ingest       — receive a sensor reading from the Electron serial bridge
 * GET  /api/serial/status         — current hardware connection state
 * POST /api/serial/connect        — called by Electron when the serial port opens
 * POST /api/serial/disconnect     — called by Electron when the serial port closes
 * POST /api/serial/device-info    — called by Electron after parsing DEVICE_INFO/HEALTH lines
 * GET  /api/capabilities          — current sensor capability map
 * POST /api/serial/write          — queue a raw string to be sent to the ESP32
 * GET  /api/serial/pending-write  — drain the write queue (polled by Electron serial manager)
 */

import { Router } from "express";
import { logger } from "../lib/logger";
import { memStore } from "../lib/mem-store";
import { applyAngleRef } from "../lib/angleRef";
import { db, readingsTable, alertsTable, sessionsTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import {
  setHardwareConnected,
  setDeviceInfo,
  getHardwareStatus,
  getDeviceInfo,
  getCapabilities,
  componentsToCaps,
  broadcastToClients,
  broadcastHardwareConnected,
} from "../lib/hardware-mode";
import { setHardwareDeviceInfo, clearHardwareDeviceInfo, setConnectivityMode } from "../lib/connectivityStore";
import { getMotorState, setMotorCommand, fireAlert } from "../lib/motor";
import { getSettings } from "../lib/settingsStore";
import { queueSerialWrite, drainSerialQueue } from "../lib/serial-queue";
import { disconnectWifi, isWifiMode, sendWifiCommand, isWifiConnected, getPendingConnection, acceptPendingWifi, rejectPendingWifi } from "../lib/wifi-tcp-server";

const router = Router();

// ─── Helper: Get latest session ────────────────────────────────────────────
async function getLatestSession() {
  if (!db) return memStore.sessions.getLatest();
  try {
    const rows = await db.select().from(sessionsTable).orderBy(desc(sessionsTable.id)).limit(1);
    return rows[0] ?? null;
  } catch {
    return memStore.sessions.getLatest();
  }
}

// ─── Helper: Close a running session (called on emergency stop or disconnect) ──
async function closeRunningSession(sessionId: number | null): Promise<void> {
  try {
    const session = await getLatestSession();
    if (!session || session.status !== "running") return;

    const now = new Date();

    if (db) {
      try {
        await db
          .update(sessionsTable)
          .set({ status: "completed", stoppedAt: now })
          .where(eq(sessionsTable.id, session.id));
      } catch {
        memStore.sessions.update(session.id, { status: "completed", stoppedAt: now });
      }
    } else {
      memStore.sessions.update(session.id, { status: "completed", stoppedAt: now });
    }

    const elapsed = session.startedAt
      ? Math.floor((now.getTime() - new Date(session.startedAt).getTime()) / 1000)
      : null;
    const elapsedStr = elapsed
      ? `${Math.floor(elapsed / 3600)}h ${Math.floor((elapsed % 3600) / 60)}m ${elapsed % 60}s`
      : "unknown";

    logger.warn({ sessionId: session.id }, "Session closed by emergency stop");

    broadcastToClients({
      type: "session_update",
      data: {
        id: String(session.id),
        status: "completed",
        stoppedAt: now.toISOString(),
        motorState: "emergency_stopped",
      },
    });

    await fireAlert(
      sessionId ?? session.id,
      "critical",
      `[SAFETY] Session #${session.id} auto-closed by emergency stop — elapsed ${elapsedStr}`,
    ).catch(() => {});
  } catch (err) {
    logger.error({ err }, "Failed to close session on emergency stop");
  }
}

// ─── Sensor readings from ESP32 ───────────────────────────────────────────────

router.post("/readings/ingest", async (req, res) => {
  try {
    const body = req.body ?? {};
    const tiltX      = body.tiltX      ?? 0;
    const tiltY      = body.tiltY      ?? 0;
    const rotationZ  = body.rotationZ  ?? 0;
    const rpm        = body.rpm        ?? 0;
    // Firmware sends "temp"; accept both names
    const temperature = body.temperature ?? body.temp ?? 25;
    // Firmware sends "pwm"; accept both names
    const motorPwm   = body.motorPwm   ?? body.pwm ?? 0;
    const vibration      = body.vibration      ?? 0;
    const vibrationFreq  = body.vibrationFreq  ?? 0;
    const sessionId      = body.sessionId      ?? null;
    // Extra telemetry fields sent by firmware — broadcast but not stored in DB
    const mpuFault   = body.mpuFault   ?? false;
    const irCommand  = typeof body.irCommand === "string" ? body.irCommand : null;
    const throttle   = body.throttle   ?? null;  // raw ESC pulse width (µs)
    const mode       = body.mode === "auto" ? "auto" : "manual";  // PID auto/manual state
    const pidOutput  = body.pidOutput  ?? 0;
    const pidTilt    = body.pidTilt    ?? 0;
    // Simple-moving-average-smoothed tilt angle (pre reference-subtraction) —
    // plotted by the tilt chart instead of tiltX/Y (which are post-reference
    // error terms).
    const filteredAngleX = body.filteredAngleX ?? tiltX;
    const filteredAngleY = body.filteredAngleY ?? tiltY;
    // Actual ESC pulse width sent to the motor, in µs. Firmware sends this
    // both as "escPulse" (dedicated field) and "throttle" (legacy alias).
    const motorPulseUs   = body.escPulse ?? throttle ?? 0;

    const now = new Date();
    const settings = getSettings();
    let readingId: number;

    // ── Safety monitoring — skip if motor already in emergency_stopped state ──
    if (getMotorState() !== "emergency_stopped") {
      const tiltMag = Math.sqrt(tiltX * tiltX + tiltY * tiltY);
      const vibVal  = vibration > 0 ? vibration : (rpm / 14000) * 8.5;

      // [DEV MODE] Max-tilt emergency stop disabled — tilt angle does not trigger
      // motor stop during development. Re-enable by uncommenting the block below.
      // if (tiltMag > settings.maxTiltAngle) {
      //   if (settings.enforceTilt) {
      //     setMotorCommand("emergency_stop");
      //     queueSerialWrite("CMD:EMERGENCY_STOP");
      //     void fireAlert(sessionId, "critical",
      //       `[SAFETY] Tilt ${tiltMag.toFixed(2)}° exceeds max ${settings.maxTiltAngle}° — emergency stop triggered`,
      //     );
      //     void closeRunningSession(sessionId);
      //   } else {
      //     void fireAlert(sessionId, "warning",
      //       `[SAFETY] Tilt ${tiltMag.toFixed(2)}° exceeds max ${settings.maxTiltAngle}° — monitoring only (e-stop disabled)`,
      //     );
      //   }
      // } else
      if (temperature >= settings.tempCritThreshold) {
        if (settings.enforceTempCrit) {
          setMotorCommand("emergency_stop");
          queueSerialWrite("CMD:EMERGENCY_STOP");
          void fireAlert(sessionId, "critical",
            `[SAFETY] Temperature ${temperature.toFixed(1)}°C ≥ critical ${settings.tempCritThreshold}°C — emergency stop triggered`,
          );
          void closeRunningSession(sessionId);
        } else {
          void fireAlert(sessionId, "warning",
            `[SAFETY] Temperature ${temperature.toFixed(1)}°C ≥ critical ${settings.tempCritThreshold}°C — monitoring only (e-stop disabled)`,
          );
        }
      } else if (vibVal >= settings.vibCritThreshold) {
        if (settings.enforceVibCrit) {
          setMotorCommand("emergency_stop");
          queueSerialWrite("CMD:EMERGENCY_STOP");
          void fireAlert(sessionId, "critical",
            `[SAFETY] Vibration ${vibVal.toFixed(2)} mm/s ≥ critical ${settings.vibCritThreshold} mm/s — emergency stop triggered`,
          );
          void closeRunningSession(sessionId);
        } else {
          void fireAlert(sessionId, "warning",
            `[SAFETY] Vibration ${vibVal.toFixed(2)} mm/s ≥ critical ${settings.vibCritThreshold} mm/s — monitoring only (e-stop disabled)`,
          );
        }
      } else if (temperature >= settings.tempWarnThreshold) {
        void fireAlert(sessionId, "warning",
          `[SAFETY] Temperature ${temperature.toFixed(1)}°C ≥ warning ${settings.tempWarnThreshold}°C`,
        );
      } else if (vibVal >= settings.vibWarnThreshold) {
        void fireAlert(sessionId, "warning",
          `[SAFETY] Vibration ${vibVal.toFixed(2)} mm/s ≥ warning ${settings.vibWarnThreshold} mm/s`,
        );
      }
    }

    const vibVal = vibration > 0 ? vibration : (rpm / 14000) * 8.5;

    if (db) {
      try {
        const [row] = await Promise.race([
          db
            .insert(readingsTable)
            .values({ sessionId, tiltX, tiltY, rotationZ, rpm, temperature, motorPwm, vibration: vibVal, filteredAngleX, filteredAngleY, motorPulseUs })
            .returning(),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error("DB insert timeout")), 2000)
          ),
        ]);
        readingId = row.id;
      } catch {
        const row = memStore.readings.insert({ sessionId, tiltX, tiltY, rotationZ, rpm, temperature, motorPwm, vibration: vibVal, filteredAngleX, filteredAngleY, motorPulseUs });
        readingId = row.id;
      }
    } else {
      const row = memStore.readings.insert({ sessionId, tiltX, tiltY, rotationZ, rpm, temperature, motorPwm, vibration: vibVal, filteredAngleX, filteredAngleY, motorPulseUs });
      readingId = row.id;
    }

    const tiltDisplayed = applyAngleRef(tiltX, tiltY);
    broadcastToClients({
      type: "reading",
      data: {
        id: readingId,
        timestamp: now.toISOString(),
        tiltX: tiltDisplayed.tiltX, tiltY: tiltDisplayed.tiltY,
        rotationZ, rpm, temperature, motorPwm,
        vibration: vibVal, vibrationFreq,
        filteredAngleX, filteredAngleY, motorPulseUs,
        // Extra firmware fields — not stored in DB but useful for the dashboard
        mpuFault,
        irCommand,
        throttle,
        mode,
        pidOutput,
        pidTilt,
      },
    });

    // When the firmware tells us an IR command was pressed via the telemetry
    // JSON (irCommand field), forward it to the IR feed so the dashboard
    // command log stays in sync even if the CMD: serial line was missed.
    if (irCommand && irCommand !== "none") {
      broadcastToClients({
        type: "ir_command",
        data: { line: `CMD:IR_${irCommand.toUpperCase()}`, timestamp: now.toISOString() },
      });
    }

    return res.json({ ok: true, id: readingId });
  } catch (err) {
    logger.error({ err }, "Failed to ingest hardware reading");
    return res.status(500).json({ ok: false, error: "Ingest failed" });
  }
});

// ─── Serial port lifecycle ─────────────────────────────────────────────────────

router.get("/serial/status", (_req, res) => {
  return res.json(getHardwareStatus());
});

router.post("/serial/connect", (req, res) => {
  const { port = "" } = req.body ?? {};

  setHardwareConnected(true, port);
  setConnectivityMode("usb");
  setHardwareDeviceInfo({ port });
  logger.info({ port }, "ESP32 connected — stale data cleared");

  broadcastHardwareConnected();

  broadcastToClients({
    type: "alert",
    data: {
      id: Date.now(),
      timestamp: new Date().toISOString(),
      level: "info",
      message: `[HARDWARE] ESP32 connected on ${port} — live sensor data active`,
    },
  });

  if (db) {
    db.insert(alertsTable).values({ sessionId: null, level: "info", message: `[HARDWARE] ESP32 connected on ${port}` }).catch(() => {});
  } else {
    memStore.alerts.insert({ sessionId: null, level: "info", message: `[HARDWARE] ESP32 connected on ${port}` });
  }

  return res.json({ ok: true });
});

router.post("/serial/disconnect", async (_req, res) => {
  // If the current connection is over WiFi TCP, forcibly close the socket.
  // The socket's own "close" handler will fire and broadcast hardware_disconnected,
  // so we return early — no need to duplicate that state cleanup here.
  if (isWifiMode()) {
    disconnectWifi();
    return res.json({ ok: true });
  }

  try {
    // Stop any running session immediately
    const session = await getLatestSession();
    if (session && session.status === "running") {
      const now = new Date();
      
      if (!db) {
        memStore.sessions.update(session.id, { status: "completed", stoppedAt: now });
      } else {
        try {
          await db.update(sessionsTable)
            .set({ status: "completed", stoppedAt: now })
            .where(eq(sessionsTable.id, session.id));
        } catch (err) {
          memStore.sessions.update(session.id, { status: "completed", stoppedAt: now });
        }
      }
      
      setMotorCommand("off");
      
      const elapsed = session.startedAt
        ? Math.floor((now.getTime() - new Date(session.startedAt).getTime()) / 1000)
        : null;
      const elapsedStr = elapsed
        ? `${Math.floor(elapsed / 3600)}h ${Math.floor((elapsed % 3600) / 60)}m`
        : "unknown";
      
      await fireAlert(session.id, "warning",
        `[HARDWARE] Session #${session.id} terminated — ESP32 disconnected (elapsed ${elapsedStr})`
      ).catch(() => {});
      
      logger.warn({ sessionId: session.id }, "Session auto-stopped due to hardware disconnect");
    }
  } catch (err) {
    logger.error({ err }, "Error stopping session during disconnect");
  }
  
  setHardwareConnected(false);
  clearHardwareDeviceInfo();
  logger.info("ESP32 disconnected — hardware mode inactive");

  broadcastToClients({
    type: "hardware_disconnected",
    data: { timestamp: new Date().toISOString() },
  });
  broadcastToClients({
    type: "alert",
    data: {
      id: Date.now(),
      timestamp: new Date().toISOString(),
      level: "warning",
      message: "[HARDWARE] ESP32 disconnected — session ended",
    },
  });

  if (db) {
    db.insert(alertsTable).values({ sessionId: null, level: "warning", message: "[HARDWARE] ESP32 disconnected — session ended" }).catch(() => {});
  } else {
    memStore.alerts.insert({ sessionId: null, level: "warning", message: "[HARDWARE] ESP32 disconnected — session ended" });
  }

  return res.json({ ok: true });
});

// ─── Device info / capability handshake ───────────────────────────────────────

router.post("/serial/device-info", (req, res) => {
  try {
    const { deviceId = "ESP32", version = "unknown", baud = 115200, components = [], health = {} } = req.body ?? {};

    const capabilities = componentsToCaps(components as string[]);

    setDeviceInfo({ deviceId, version, baud, components, capabilities, health });
    setHardwareDeviceInfo({
      port: getHardwareStatus().port,
      firmwareVersion: version,
    });

    broadcastHardwareConnected();

    const compStr = (components as string[]).join(", ") || "unknown";
    const healthStr = Object.entries(health as Record<string, string>)
      .map(([k, v]) => `${k}=${v}`)
      .join(" · ") || "N/A";

    broadcastToClients({
      type: "alert",
      data: {
        id: Date.now() + 1,
        timestamp: new Date().toISOString(),
        level: "info",
        message: `[HARDWARE] Device: ${deviceId} v${version} · Components: ${compStr}`,
      },
    });
    broadcastToClients({
      type: "alert",
      data: {
        id: Date.now() + 2,
        timestamp: new Date().toISOString(),
        level: (Object.values(health as Record<string, string>).some((v) => v === "FAIL") ? "warning" : "info"),
        message: `[HARDWARE] Health: ${healthStr}`,
      },
    });

    logger.info({ deviceId, components, health, capabilities }, "Device info registered");
    return res.json({ ok: true, capabilities });
  } catch (err) {
    logger.error({ err }, "Failed to register device info");
    return res.status(500).json({ ok: false });
  }
});

// ─── Capabilities query ────────────────────────────────────────────────────────

router.get("/capabilities", (_req, res) => {
  return res.json({
    capabilities: getCapabilities(),
    deviceInfo: getDeviceInfo(),
  });
});

// ─── Serial write passthrough (web terminal → Electron → ESP32) ───────────────

/**
 * Queue a raw string to be forwarded to the physical ESP32 serial port.
 * The Electron serial manager polls GET /api/serial/pending-write to drain the queue.
 * This allows the web dashboard terminal to send commands even without
 * direct Electron IPC access.
 */
router.post("/serial/write", (req, res) => {
  const { text } = req.body ?? {};
  if (typeof text !== "string" || text.trim() === "") {
    logger.warn({ text }, "Serial write rejected: invalid text");
    return res.status(400).json({ ok: false, error: "text is required" });
  }
  const cmd = text.trim();
  // Mirror the motor-route pattern: try WiFi TCP first, but also check
  // isWifiConnected() because sendWifiCommand() can return true just before
  // socket teardown — adding the connectivity guard ensures we still fall
  // back to the serial queue during that brief disconnect window.
  const wifiSent = sendWifiCommand(cmd);
  if (!wifiSent || !isWifiConnected()) queueSerialWrite(cmd);
  logger.info({ cmd, channel: wifiSent ? "wifi" : "serial-queue" }, "Serial write dispatched");
  return res.json({ ok: true });
});

/**
 * Drain and return all pending serial writes.
 * Called by the Electron serial manager on a polling interval.
 * Returns an array of strings to write, empties the queue.
 */
router.get("/serial/pending-write", (_req, res) => {
  return res.json({ writes: drainSerialQueue() });
});

// ── WiFi pending-connection approval ─────────────────────────────────────────
// When an ESP32 connects for the first time the TCP socket is held in a
// "pending" state so the user can Accept or Reject it from the dashboard.

/** Returns the pending ESP32 connection, if any. Polled by the banner. */
router.get("/wifi/pending", (_req, res) => {
  const p = getPendingConnection();
  return res.json({ pending: p ?? null });
});

/** Accept the pending connection → activates the socket as normal hardware. */
router.post("/wifi/accept", (_req, res) => {
  const ok = acceptPendingWifi();
  if (!ok) return res.status(409).json({ ok: false, error: "No pending connection" });
  return res.json({ ok: true });
});

/** Reject/dismiss the pending connection → closes the TCP socket. */
router.post("/wifi/reject", (_req, res) => {
  const ok = rejectPendingWifi();
  if (!ok) return res.status(409).json({ ok: false, error: "No pending connection" });
  return res.json({ ok: true });
});

export default router;
