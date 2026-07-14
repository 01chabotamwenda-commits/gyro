import { Router } from "express";
import { db, sessionsTable, readingsTable } from "@workspace/db";
import { desc, eq } from "drizzle-orm";
import { logger } from "../lib/logger";
import { getMotorState, setMotorCommand, fireAlert } from "../lib/motor";
import { memStore } from "../lib/mem-store";
import { queueSerialWrite } from "../lib/serial-queue";
import { isHardwareConnected, broadcastToClients } from "../lib/hardware-mode";
import { runHardwareVerification } from "../lib/hardware-verification";
import { isHardwareGrace } from "../lib/wifi-tcp-server";

const router = Router();

type AnySession = {
  id: number;
  status: string;
  startedAt: Date | null;
  stoppedAt: Date | null;
  targetRpm: number;
  targetDurationHours: number;
};

export async function getLatestSession(): Promise<AnySession | null> {
  if (!db) return memStore.sessions.getLatest();
  try {
    const rows = await db.select().from(sessionsTable).orderBy(desc(sessionsTable.id)).limit(1);
    return rows[0] ?? null;
  } catch {
    return memStore.sessions.getLatest();
  }
}

function sessionResponse(session: AnySession | null) {
  if (!session) {
    return {
      id: "none", status: "idle" as const, startedAt: null, stoppedAt: null,
      targetRpm: 10000, targetDurationHours: 24, elapsedSeconds: null,
      motorState: getMotorState(), hardwareGrace: false,
    };
  }
  const elapsedSeconds = session.status === "running" && session.startedAt
    ? Math.floor((Date.now() - new Date(session.startedAt).getTime()) / 1000)
    : null;
  return {
    id: String(session.id), status: session.status,
    startedAt: session.startedAt ? new Date(session.startedAt).toISOString() : null,
    stoppedAt: session.stoppedAt ? new Date(session.stoppedAt).toISOString() : null,
    targetRpm: session.targetRpm, targetDurationHours: session.targetDurationHours,
    elapsedSeconds, motorState: getMotorState(),
    // True while a WiFi drop is within its grace window — the dashboard
    // should show a "reconnecting…" state instead of a hard disconnect banner.
    hardwareGrace: isHardwareGrace(),
  };
}

/**
 * Real preflight: checks actual hardware connectivity.
 * Returns immediately — no fake delays, no scripted "OK" messages.
 */
async function runPreflightChecks(): Promise<{ ok: boolean; reason?: string }> {
  await fireAlert(null, "info", "[SYSTEM] pre-flight: checking ESP32 hardware connection...").catch(() => {});

  if (!isHardwareConnected()) {
    await fireAlert(null, "warning",
      "[SYSTEM] ✗ pre-flight FAILED — no ESP32 detected on serial or WiFi link"
    ).catch(() => {});
    await fireAlert(null, "warning",
      "[SYSTEM] Connect the ESP32 via USB serial (115200 baud) or TCP WiFi before starting a session"
    ).catch(() => {});
    return { ok: false, reason: "Hardware not connected — no ESP32 detected on serial or WiFi" };
  }

  await fireAlert(null, "info", "[SYSTEM] ✓ ESP32 hardware link confirmed").catch(() => {});
  await fireAlert(null, "info", "[SYSTEM] pre-flight passed — session ready to start").catch(() => {});
  return { ok: true };
}

router.get("/sessions", async (_req, res) => {
  try {
    if (!db) {
      return res.json(memStore.sessions.getAll().map(s => ({
        id: s.id,
        status: s.status,
        startedAt: s.startedAt ? s.startedAt.toISOString() : null,
        stoppedAt: s.stoppedAt ? s.stoppedAt.toISOString() : null,
        targetRpm: s.targetRpm,
        targetDurationHours: s.targetDurationHours,
        durationSeconds: s.startedAt && s.stoppedAt
          ? Math.floor((s.stoppedAt.getTime() - s.startedAt.getTime()) / 1000)
          : null,
      })));
    }
    const sessions = await db.select().from(sessionsTable).orderBy(desc(sessionsTable.id)).limit(200);
    return res.json(sessions.map(s => ({
      id: s.id,
      status: s.status,
      startedAt: s.startedAt ? s.startedAt.toISOString() : null,
      stoppedAt: s.stoppedAt ? s.stoppedAt.toISOString() : null,
      targetRpm: s.targetRpm,
      targetDurationHours: s.targetDurationHours,
      durationSeconds: s.startedAt && s.stoppedAt
        ? Math.floor((new Date(s.stoppedAt).getTime() - new Date(s.startedAt).getTime()) / 1000)
        : null,
    })));
  } catch (err) {
    logger.error({ err }, "Failed to list sessions — using mem-store");
    return res.json(memStore.sessions.getAll().map(s => ({
      id: s.id, status: s.status,
      startedAt: s.startedAt ? s.startedAt.toISOString() : null,
      stoppedAt: s.stoppedAt ? s.stoppedAt.toISOString() : null,
      targetRpm: s.targetRpm, targetDurationHours: s.targetDurationHours,
      durationSeconds: null,
    })));
  }
});

router.get("/session", async (_req, res) => {
  try {
    const session = await getLatestSession();
    return res.json(sessionResponse(session));
  } catch (err) {
    logger.error({ err }, "Failed to get session");
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/session", async (req, res) => {
  try {
    const targetRpm = Number(req.body?.targetRpm ?? 10000);
    const targetDurationHours = Number(req.body?.targetDurationHours ?? 24);

    if (isNaN(targetRpm) || isNaN(targetDurationHours)) {
      return res.status(400).json({ error: "Invalid session parameters" });
    }

    const existing = await getLatestSession();
    if (existing && existing.status === "running") {
      return res.status(409).json({ error: "A session is already running" });
    }

    // Clear any previous emergency-stop so the operator can start the motor
    // in the new session without being locked out.
    if (getMotorState() === "emergency_stopped") {
      setMotorCommand("off");
    }

    // Real hardware gate — rejects immediately if ESP32 is not connected.
    // Enforced unconditionally: every start path (button, IR remote, keyboard
    // shortcut) must go through this check. There is no bypass.
    const preflight = await runPreflightChecks();
    if (!preflight.ok) {
      return res.status(503).json({ error: preflight.reason ?? "Hardware not ready" });
    }

    let session: AnySession;
    if (!db) {
      session = memStore.sessions.insert({
        status: "running",
        startedAt: new Date(),
        stoppedAt: null,
        targetRpm,
        targetDurationHours,
      });
    } else {
      try {
        const [row] = await db.insert(sessionsTable).values({
          status: "running",
          startedAt: new Date(),
          targetRpm,
          targetDurationHours,
        }).returning();
        session = row;
      } catch {
        session = memStore.sessions.insert({
          status: "running",
          startedAt: new Date(),
          stoppedAt: null,
          targetRpm,
          targetDurationHours,
        });
      }
    }

    logger.info({ sessionId: session.id, targetRpm }, "Session started — launching background hardware verification");
    await fireAlert(session.id, "info",
      `[USER] Session #${session.id} started — target ${targetRpm.toLocaleString()} RPM · ${targetDurationHours}h`
    ).catch(() => {});
    // Fire hardware verification in the background — does NOT block the response.
    void runHardwareVerification(session.id, targetRpm);

    return res.status(201).json({ ...sessionResponse(session), elapsedSeconds: 0 });
  } catch (err) {
    logger.error({ err }, "Failed to start session");
    return res.status(400).json({ error: "Failed to start session" });
  }
});

router.delete("/session", async (_req, res) => {
  try {
    const session = await getLatestSession();
    if (!session) return res.status(404).json({ error: "No active session" });

    const now = new Date();
    let updated: AnySession;

    if (!db) {
      const u = memStore.sessions.update(session.id, { status: "completed", stoppedAt: now });
      updated = u ?? { ...session, status: "completed", stoppedAt: now };
    } else {
      try {
        const [row] = await db.update(sessionsTable)
          .set({ status: "completed", stoppedAt: now })
          .where(eq(sessionsTable.id, session.id))
          .returning();
        updated = row;
      } catch {
        const u = memStore.sessions.update(session.id, { status: "completed", stoppedAt: now });
        updated = u ?? { ...session, status: "completed", stoppedAt: now };
      }
    }

    setMotorCommand("off");
    // Tell the ESP32 to stop the motor — session ended
    queueSerialWrite("CMD:MOTOR_STOP");

    const elapsed = updated.startedAt
      ? Math.floor((now.getTime() - new Date(updated.startedAt).getTime()) / 1000)
      : null;
    const elapsedStr = elapsed
      ? `${Math.floor(elapsed / 3600)}h ${Math.floor((elapsed % 3600) / 60)}m`
      : "unknown";

    await fireAlert(session.id, "info",
      `[USER] Session #${session.id} stopped — motor halted — elapsed ${elapsedStr}`
    ).catch(() => {});

    logger.info({ sessionId: session.id }, "Session stopped");
    return res.json(sessionResponse(updated));
  } catch (err) {
    logger.error({ err }, "Failed to stop session");
    return res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * POST /api/session/reset
 * Reset the current session in place: same id/targets, fresh startedAt
 * (elapsed -> 0), that session's stored readings deleted. Motor state and
 * hardware connection are untouched — this only affects the app-side
 * timer/history, mirroring a "restart the clock and clear the graphs" action.
 */
router.post("/session/reset", async (_req, res) => {
  try {
    const session = await getLatestSession();
    if (!session) return res.status(404).json({ error: "No active session" });
    // Only a live session has a meaningful timer/history to reset — resetting
    // a completed/errored session would silently resurrect it with a fresh
    // start time, which is not what "reset" means here.
    if (session.status !== "running" && session.status !== "warning") {
      return res.status(409).json({ error: "No active session to reset" });
    }

    const now = new Date();
    let updated: AnySession;

    if (!db) {
      memStore.readings.clearBySession(session.id);
      const u = memStore.sessions.update(session.id, { startedAt: now, stoppedAt: null });
      updated = u ?? { ...session, startedAt: now, stoppedAt: null };
    } else {
      // Delete + update must succeed or fail together — a partial reset
      // (readings gone but timer unchanged, or vice versa) is worse than no
      // reset at all. Do not fall back to mem-store on failure: in DB mode
      // mem-store is not the authoritative store, so a fallback "success"
      // would tell the client the reset worked while the real rows are
      // untouched.
      const rows = await db.transaction(async (tx) => {
        await tx.delete(readingsTable).where(eq(readingsTable.sessionId, session.id));
        return tx
          .update(sessionsTable)
          .set({ startedAt: now, stoppedAt: null })
          .where(eq(sessionsTable.id, session.id))
          .returning();
      });
      updated = rows[0];
    }

    // Broadcast only after the reset is durably committed.
    broadcastToClients({ type: "session_reset", data: { id: String(updated.id) } });

    await fireAlert(
      updated.id, "info",
      `[USER] Session #${updated.id} reset — timer and history cleared, motor unaffected`
    ).catch(() => {});

    logger.info({ sessionId: updated.id }, "Session reset");
    return res.json({ ...sessionResponse(updated), elapsedSeconds: 0 });
  } catch (err) {
    logger.error({ err }, "Failed to reset session");
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
