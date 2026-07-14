import { Router } from "express";
import { db, readingsTable, sessionsTable } from "@workspace/db";
import { sql, avg, max, count, asc, isNotNull } from "drizzle-orm";
import { logger } from "../lib/logger";
import { memStore } from "../lib/mem-store";

const router = Router();

router.get("/analytics/sessions", async (_req, res) => {
  try {
    if (!db) {
      const sessions = memStore.sessions.getAll().slice().reverse();
      const result = sessions.map((s, idx) => {
        const readings = memStore.readings.getBySession(s.id);
        if (readings.length < 5) return null;
        const rpms = readings.map(r => r.rpm);
        const temps = readings.map(r => r.temperature);
        const tiltXs = readings.map(r => r.tiltX);
        const tiltYs = readings.map(r => r.tiltY);
        const pwms = readings.map(r => r.motorPwm);
        const vibs = readings.map(r => (r as { vibration?: number }).vibration ?? (r.rpm / 14000) * 8.5);
        const mean = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length;
        const stddev = (arr: number[], m: number) =>
          Math.sqrt(arr.reduce((a, b) => a + (b - m) ** 2, 0) / arr.length);
        const avgRpm = mean(rpms);
        const maxRpm = Math.max(...rpms);
        const rpmStddev = stddev(rpms, avgRpm);
        const tiltXStd = stddev(tiltXs, mean(tiltXs));
        const tiltYStd = stddev(tiltYs, mean(tiltYs));
        const avgVib = mean(vibs);
        const maxVib = Math.max(...vibs);
        return {
          sessionId: s.id, sessionIndex: idx, label: `#${s.id}`,
          status: s.status, startedAt: s.startedAt?.toISOString() ?? null,
          targetRpm: s.targetRpm,
          avgTemp: mean(temps), maxTemp: Math.max(...temps),
          avgRpm, maxRpm, rpmStddev,
          rpmCv: avgRpm > 0 ? (rpmStddev / avgRpm) * 100 : 0,
          avgTiltX: mean(tiltXs), avgTiltY: mean(tiltYs),
          tiltXStddev: tiltXStd, tiltYStddev: tiltYStd,
          wobbleMag: Math.sqrt(tiltXStd ** 2 + tiltYStd ** 2),
          avgVibration: avgVib, maxVibration: maxVib,
          avgPwm: mean(pwms), readingCount: readings.length,
        };
      }).filter(Boolean);
      return res.json(result);
    }

    const readingStats = await db
      .select({
        sessionId:    readingsTable.sessionId,
        avgTemp:      avg(readingsTable.temperature),
        maxTemp:      max(readingsTable.temperature),
        avgRpm:       avg(readingsTable.rpm),
        maxRpm:       max(readingsTable.rpm),
        rpmStddev:    sql<number>`STDDEV_POP(${readingsTable.rpm})`,
        avgTiltX:     avg(readingsTable.tiltX),
        avgTiltY:     avg(readingsTable.tiltY),
        tiltXStddev:  sql<number>`STDDEV_POP(${readingsTable.tiltX})`,
        tiltYStddev:  sql<number>`STDDEV_POP(${readingsTable.tiltY})`,
        avgPwm:       avg(readingsTable.motorPwm),
        avgVibration: avg(readingsTable.vibration),
        maxVibration: max(readingsTable.vibration),
        readingCount: count(readingsTable.id),
      })
      .from(readingsTable)
      .where(isNotNull(readingsTable.sessionId))
      .groupBy(readingsTable.sessionId)
      .orderBy(asc(readingsTable.sessionId));

    const sessions = await db
      .select()
      .from(sessionsTable)
      .orderBy(asc(sessionsTable.id));

    const sessionMap = new Map(sessions.map(s => [s.id, s]));

    const result = readingStats
      .filter(r => r.sessionId !== null && Number(r.readingCount) >= 5)
      .map((r, idx) => {
        const session = sessionMap.get(r.sessionId!);
        const avgRpm    = Number(r.avgRpm ?? 0);
        const maxRpm    = Number(r.maxRpm ?? avgRpm);
        const rpmStddev = Number(r.rpmStddev ?? 0);
        const tiltXStd  = Number(r.tiltXStddev ?? 0);
        const tiltYStd  = Number(r.tiltYStddev ?? 0);
        const avgTemp   = Number(r.avgTemp ?? 25);
        const maxTemp   = Number(r.maxTemp ?? avgTemp);
        const avgPwm    = Number(r.avgPwm ?? 0);
        const wobbleMag = Math.sqrt(tiltXStd ** 2 + tiltYStd ** 2);
        const rpmCv     = avgRpm > 0 ? (rpmStddev / avgRpm) * 100 : 0;
        // Use real stored vibration; fall back to RPM-derived only when all readings have vibration=0
        const rawAvgVib = Number(r.avgVibration ?? 0);
        const rawMaxVib = Number(r.maxVibration ?? 0);
        const avgVib = rawAvgVib > 0 ? rawAvgVib : (avgRpm / 14000) * 8.5;
        const maxVib = rawMaxVib > 0 ? rawMaxVib : (maxRpm / 14000) * 8.5;

        return {
          sessionId:    r.sessionId!,
          sessionIndex: idx,
          label:        `#${r.sessionId}`,
          status:       session?.status ?? "unknown",
          startedAt:    session?.startedAt?.toISOString() ?? null,
          targetRpm:    session?.targetRpm ?? 0,
          avgTemp,
          maxTemp,
          avgRpm,
          maxRpm,
          rpmStddev,
          rpmCv,
          avgTiltX:     Number(r.avgTiltX ?? 0),
          avgTiltY:     Number(r.avgTiltY ?? 0),
          tiltXStddev:  tiltXStd,
          tiltYStddev:  tiltYStd,
          wobbleMag,
          avgVibration: avgVib,
          maxVibration: maxVib,
          avgPwm,
          readingCount: Number(r.readingCount ?? 0),
        };
      });

    logger.info({ sessions: result.length }, "Session analytics computed");
    return res.json(result);
  } catch (err) {
    logger.error({ err }, "Failed to compute session analytics");
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
