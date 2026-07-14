import { Router } from "express";
import { db, readingsTable, alertsTable } from "@workspace/db";
import { desc, asc, avg, max, min, count, gte, eq } from "drizzle-orm";
import { logger } from "../lib/logger";
import { memStore } from "../lib/mem-store";
import { applyAngleRef, setAngleRef, getAngleRef } from "../lib/angleRef";
import { broadcastToClients } from "../lib/hardware-mode";
import { queueSerialWrite } from "../lib/serial-queue";

const router = Router();

function deriveVibration(rpm: number): number {
  return Math.round((rpm / 14000) * 8.5 * 100) / 100;
}

// ─── Angle reference reset ─────────────────────────────────────────────────────

router.post("/readings/reset-ref", async (_req, res) => {
  let rawX = 0;
  let rawY = 0;
  try {
    if (!db) {
      const r = memStore.readings.getLatest();
      if (r) { rawX = r.tiltX; rawY = r.tiltY; }
    } else {
      const rows = await db.select().from(readingsTable).orderBy(desc(readingsTable.id)).limit(1);
      if (rows[0]) { rawX = rows[0].tiltX; rawY = rows[0].tiltY; }
    }
  } catch {
    const r = memStore.readings.getLatest();
    if (r) { rawX = r.tiltX; rawY = r.tiltY; }
  }

  setAngleRef(rawX, rawY);

  // Forward to firmware over serial/WiFi so its internal reference stays in sync
  queueSerialWrite("CMD:RESET_REF");

  // Notify all WebSocket clients so the dashboard can show an "offset active" badge
  broadcastToClients({ type: "ref_reset", data: { refX: rawX, refY: rawY } });

  logger.info({ refX: rawX, refY: rawY }, "Angle reference reset");
  return res.json({ ok: true, refX: rawX, refY: rawY });
});

router.get("/readings/angle-ref", (_req, res) => {
  const { refX, refY } = getAngleRef();
  return res.json({ ok: true, refX, refY });
});

router.get("/readings/latest", async (_req, res) => {
  try {
    if (!db) {
      const r = memStore.readings.getLatest();
      if (!r) return res.json({ id: 0, timestamp: new Date().toISOString(), tiltX: 0, tiltY: 0, rotationZ: 0, rpm: 0, temperature: 25, motorPwm: 0, vibration: 0, filteredAngleX: 0, filteredAngleY: 0 });
      const t = applyAngleRef(r.tiltX, r.tiltY);
      return res.json({ id: r.id, timestamp: r.timestamp.toISOString(), tiltX: t.tiltX, tiltY: t.tiltY, rotationZ: r.rotationZ, rpm: r.rpm, temperature: r.temperature, motorPwm: r.motorPwm, vibration: r.vibration, filteredAngleX: r.filteredAngleX ?? r.tiltX, filteredAngleY: r.filteredAngleY ?? r.tiltY, motorPulseUs: r.motorPulseUs });
    }
    const rows = await db
      .select()
      .from(readingsTable)
      .orderBy(desc(readingsTable.id))
      .limit(1);
    if (!rows[0]) {
      return res.json({
        id: 0, timestamp: new Date().toISOString(),
        tiltX: 0, tiltY: 0, rotationZ: 0,
        rpm: 0, temperature: 25, motorPwm: 0, vibration: 0,
        filteredAngleX: 0, filteredAngleY: 0,
      });
    }
    const r = rows[0];
    const t = applyAngleRef(r.tiltX, r.tiltY);
    return res.json({
      id: r.id, timestamp: r.timestamp.toISOString(),
      tiltX: t.tiltX, tiltY: t.tiltY, rotationZ: r.rotationZ,
      rpm: r.rpm, temperature: r.temperature, motorPwm: r.motorPwm,
      vibration: r.vibration,
      filteredAngleX: r.filteredAngleX ?? r.tiltX,
      filteredAngleY: r.filteredAngleY ?? r.tiltY,
      motorPulseUs: r.motorPulseUs,
    });
  } catch (err) {
    // DB unavailable — fall back to mem-store
    const r = memStore.readings.getLatest();
    if (!r) return res.json({ id: 0, timestamp: new Date().toISOString(), tiltX: 0, tiltY: 0, rotationZ: 0, rpm: 0, temperature: 25, motorPwm: 0, vibration: 0, filteredAngleX: 0, filteredAngleY: 0 });
    const t = applyAngleRef(r.tiltX, r.tiltY);
    return res.json({ id: r.id, timestamp: r.timestamp.toISOString(), tiltX: t.tiltX, tiltY: t.tiltY, rotationZ: r.rotationZ, rpm: r.rpm, temperature: r.temperature, motorPwm: r.motorPwm, vibration: r.vibration, filteredAngleX: r.filteredAngleX ?? r.tiltX, filteredAngleY: r.filteredAngleY ?? r.tiltY, motorPulseUs: r.motorPulseUs });
  }
});

const METRIC_FIELDS = new Set(["tiltX", "tiltY", "rotationZ", "rpm", "temperature", "vibration", "filteredAngleX", "filteredAngleY"]);

router.get("/readings/history", async (req, res) => {
  try {
    const limit = Math.min(Number(req.query["limit"] ?? 100), 2000);
    const sinceMinutes = req.query["sinceMinutes"] ? Number(req.query["sinceMinutes"]) : null;
    const metricParam = req.query["metric"] as string | undefined;
    const metric = metricParam && METRIC_FIELDS.has(metricParam) ? metricParam : null;

    const mapRow = (r: { id: number; timestamp: Date; tiltX: number; tiltY: number; rotationZ: number; rpm: number; temperature: number; motorPwm: number; vibration: number; filteredAngleX?: number; filteredAngleY?: number; motorPulseUs?: number }) => {
      const t = applyAngleRef(r.tiltX, r.tiltY);
      const full = {
        id: r.id, timestamp: r.timestamp.toISOString(), tiltX: t.tiltX, tiltY: t.tiltY, rotationZ: r.rotationZ, rpm: r.rpm,
        temperature: r.temperature, motorPwm: r.motorPwm, vibration: r.vibration,
        filteredAngleX: r.filteredAngleX ?? r.tiltX, filteredAngleY: r.filteredAngleY ?? r.tiltY,
        motorPulseUs: r.motorPulseUs ?? 0,
      };
      if (!metric) return full;
      // Return only id, timestamp, and the requested metric field
      return { id: full.id, timestamp: full.timestamp, [metric]: full[metric as keyof typeof full] };
    };

    if (!db) {
      const rows = memStore.readings.getHistory(limit, sinceMinutes);
      return res.json(rows.map(mapRow));
    }

    let query = db.select().from(readingsTable).orderBy(desc(readingsTable.id)).$dynamic();

    if (sinceMinutes) {
      const sinceDate = new Date(Date.now() - sinceMinutes * 60 * 1000);
      query = query.where(gte(readingsTable.timestamp, sinceDate)).limit(2000);
    } else {
      query = query.limit(limit);
    }

    const rows = await query;
    return res.json(rows.reverse().map(mapRow));
  } catch (err) {
    logger.error({ err }, "Failed to get reading history — using mem-store");
    const limit = Math.min(Number(req.query["limit"] ?? 100), 2000);
    const rows = memStore.readings.getHistory(limit);
    return res.json(rows.map((r) => {
      const t = applyAngleRef(r.tiltX, r.tiltY);
      return {
        id: r.id, timestamp: r.timestamp.toISOString(), tiltX: t.tiltX, tiltY: t.tiltY, rotationZ: r.rotationZ, rpm: r.rpm,
        temperature: r.temperature, motorPwm: r.motorPwm, vibration: r.vibration,
        filteredAngleX: r.filteredAngleX ?? r.tiltX, filteredAngleY: r.filteredAngleY ?? r.tiltY,
        motorPulseUs: r.motorPulseUs ?? 0,
      };
    }));
  }
});

router.get("/readings/stats", async (req, res) => {
  try {
    const sinceSecs = req.query["sinceSecs"] ? Number(req.query["sinceSecs"]) : null;
    const sinceDate = sinceSecs ? new Date(Date.now() - sinceSecs * 1000) : null;
    
    if (!db) {
      if (sinceDate) {
        const recentReadings = memStore.readings.getSince(sinceDate, 10000);
        if (recentReadings.length === 0) {
          return res.json({ avgRpm: 0, maxRpm: 0, minRpm: 0, avgTiltX: 0, avgTiltY: 0, avgTiltMag: 0, avgTemperature: 25, maxTemperature: 25, totalReadings: 0, uptimePercent: 100 });
        }
        const rpms = recentReadings.map(r => r.rpm);
        const temps = recentReadings.map(r => r.temperature);
        const tiltXs = recentReadings.map(r => r.tiltX);
        const tiltYs = recentReadings.map(r => r.tiltY);
        const sum = (arr: number[]) => arr.reduce((a, b) => a + b, 0);
        const avgTiltX = sum(tiltXs) / tiltXs.length;
        const avgTiltY = sum(tiltYs) / tiltYs.length;
        const avgTiltMag = Math.sqrt(avgTiltX * avgTiltX + avgTiltY * avgTiltY);
        return res.json({
          avgRpm: sum(rpms) / rpms.length,
          maxRpm: Math.max(...rpms),
          minRpm: Math.min(...rpms),
          avgTiltX,
          avgTiltY,
          avgTiltMag,
          avgTemperature: sum(temps) / temps.length,
          maxTemperature: Math.max(...temps),
          totalReadings: recentReadings.length,
          uptimePercent: 100,
        });
      }
      return res.json({ ...memStore.readings.stats(), avgTiltMag: Math.sqrt((memStore.readings.stats().avgTiltX ** 2) + (memStore.readings.stats().avgTiltY ** 2)), uptimePercent: 100 });
    }
    
    let query = db.select({
      avgRpm: avg(readingsTable.rpm),
      maxRpm: max(readingsTable.rpm),
      minRpm: min(readingsTable.rpm),
      avgTiltX: avg(readingsTable.tiltX),
      avgTiltY: avg(readingsTable.tiltY),
      avgTemperature: avg(readingsTable.temperature),
      maxTemperature: max(readingsTable.temperature),
      totalReadings: count(readingsTable.id),
    }).from(readingsTable).$dynamic();
    
    if (sinceDate) {
      query = query.where(gte(readingsTable.timestamp, sinceDate));
    }
    
    const result = await query;
    const row = result[0];
    const avgTiltX = Number(row?.avgTiltX ?? 0);
    const avgTiltY = Number(row?.avgTiltY ?? 0);
    const avgTiltMag = Math.sqrt(avgTiltX * avgTiltX + avgTiltY * avgTiltY);
    
    return res.json({
      avgRpm: Number(row?.avgRpm ?? 0),
      maxRpm: Number(row?.maxRpm ?? 0),
      minRpm: Number(row?.minRpm ?? 0),
      avgTiltX,
      avgTiltY,
      avgTiltMag,
      avgTemperature: Number(row?.avgTemperature ?? 25),
      maxTemperature: Number(row?.maxTemperature ?? 25),
      totalReadings: Number(row?.totalReadings ?? 0),
      uptimePercent: 100,
    });
  } catch (err) {
    logger.error({ err }, "Failed to get reading stats — using mem-store");
    const stats = memStore.readings.stats();
    return res.json({ ...stats, avgTiltMag: Math.sqrt((stats.avgTiltX ** 2) + (stats.avgTiltY ** 2)), uptimePercent: 100 });
  }
});

router.get("/readings/export", async (req, res) => {
  try {
    const sessionId = req.query["sessionId"] ? Number(req.query["sessionId"]) : null;

    let rows: Array<{ id: number; timestamp: Date; sessionId: number | null; rpm: number; temperature: number; tiltX: number; tiltY: number; rotationZ: number; motorPwm: number }>;

    if (!db) {
      rows = sessionId
        ? memStore.readings.getBySession(sessionId)
        : memStore.readings.getAll();
    } else {
      let query = db.select().from(readingsTable).orderBy(asc(readingsTable.id)).$dynamic();
      if (sessionId) query = query.where(eq(readingsTable.sessionId, sessionId));
      rows = await query.limit(50000);
    }

    const csv = [
      "id,timestamp,sessionId,rpm,temperature,tiltX,tiltY,rotationZ,motorPwm,vibration_mm_s",
      ...rows.map(r => [
        r.id,
        r.timestamp.toISOString(),
        r.sessionId ?? "",
        r.rpm,
        r.temperature,
        r.tiltX,
        r.tiltY,
        r.rotationZ,
        r.motorPwm,
        deriveVibration(r.rpm),
      ].join(",")),
    ].join("\n");

    const filename = sessionId ? `session-${sessionId}-readings.csv` : "all-readings.csv";
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    logger.info({ sessionId, rows: rows.length }, "Readings exported");
    return res.send(csv);
  } catch (err) {
    logger.error({ err }, "Failed to export readings");
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/alerts", async (_req, res) => {
  try {
    if (!db) {
      return res.json(memStore.alerts.getLatest(100));
    }
    const rows = await db.select().from(alertsTable).orderBy(desc(alertsTable.id)).limit(100);
    return res.json(rows.map((a) => ({
      id: a.id, timestamp: a.timestamp.toISOString(),
      level: a.level, message: a.message,
    })));
  } catch (err) {
    logger.error({ err }, "Failed to get alerts — using mem-store");
    return res.json(memStore.alerts.getLatest(100));
  }
});

export default router;
