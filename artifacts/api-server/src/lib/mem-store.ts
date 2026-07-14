/**
 * Local durable store — used when DATABASE_URL is absent (offline / desktop mode).
 *
 * This is the ONLY history storage for the packaged Electron desktop app: it
 * runs the API server with no DATABASE_URL, so this store is the difference
 * between "history survives an app restart" and "history disappears the
 * moment the app is closed". It is backed by a SQLite file on disk (via
 * better-sqlite3, which writes and fsyncs synchronously) rather than an
 * in-memory array, so every insert is durable immediately — no batching, no
 * flush-on-exit step that can be skipped by a crash or force-quit.
 *
 * The file lives in the directory returned by getDataDir() (see dataDir.ts):
 * the Electron main process points this at app.getPath("userData") so it
 * survives app updates and reinstalls; local/Replit dev falls back to the
 * package's working directory.
 */

import DatabaseCtor from "better-sqlite3";
import { join } from "path";
import { getDataDir } from "./dataDir";

export type ReadingRow = {
  id: number;
  sessionId: number | null;
  timestamp: Date;
  tiltX: number;
  tiltY: number;
  rotationZ: number;
  rpm: number;
  temperature: number;
  motorPwm: number;
  vibration: number;
  filteredAngleX: number;
  filteredAngleY: number;
  motorPulseUs: number;
};

export type SessionRow = {
  id: number;
  status: "idle" | "running" | "completed" | "error";
  startedAt: Date | null;
  stoppedAt: Date | null;
  targetRpm: number;
  targetDurationHours: number;
};

export type AlertRow = {
  id: number;
  sessionId: number | null;
  timestamp: Date;
  level: "info" | "warning" | "error" | "critical" | "emergency";
  message: string;
};

const DB_FILE = join(getDataDir(), "gyro-history.db");

const sqlite = new DatabaseCtor(DB_FILE);
// WAL mode keeps writers and readers from blocking each other and is the
// SQLite-recommended durability setting for an always-on logging workload
// like this — a crash mid-write cannot corrupt the file.
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("synchronous = NORMAL");

sqlite.exec(`
  CREATE TABLE IF NOT EXISTS readings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sessionId INTEGER,
    timestamp TEXT NOT NULL,
    tiltX REAL NOT NULL,
    tiltY REAL NOT NULL,
    rotationZ REAL NOT NULL,
    rpm REAL NOT NULL,
    temperature REAL NOT NULL,
    motorPwm REAL NOT NULL,
    vibration REAL NOT NULL,
    filteredAngleX REAL NOT NULL DEFAULT 0,
    filteredAngleY REAL NOT NULL DEFAULT 0,
    motorPulseUs REAL NOT NULL DEFAULT 0
  );
  CREATE INDEX IF NOT EXISTS idx_readings_timestamp ON readings(timestamp);
  CREATE INDEX IF NOT EXISTS idx_readings_sessionId ON readings(sessionId);

  CREATE TABLE IF NOT EXISTS sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    status TEXT NOT NULL,
    startedAt TEXT,
    stoppedAt TEXT,
    targetRpm REAL NOT NULL,
    targetDurationHours REAL NOT NULL
  );

  CREATE TABLE IF NOT EXISTS alerts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sessionId INTEGER,
    timestamp TEXT NOT NULL,
    level TEXT NOT NULL,
    message TEXT NOT NULL
  );
`);

// Migrate pre-existing DB files (CREATE TABLE IF NOT EXISTS above only
// applies to brand-new files) — add columns introduced after initial launch.
// Each ADD COLUMN is independent and safe to no-op if already applied.
for (const stmt of [
  `ALTER TABLE readings ADD COLUMN filteredAngleX REAL NOT NULL DEFAULT 0`,
  `ALTER TABLE readings ADD COLUMN filteredAngleY REAL NOT NULL DEFAULT 0`,
  `ALTER TABLE readings ADD COLUMN motorPulseUs REAL NOT NULL DEFAULT 0`,
]) {
  try { sqlite.exec(stmt); } catch { /* column already exists */ }
}

// Cap unbounded local growth over long unattended runs (4Hz sampling = ~345k
// rows/day). This still holds ~29 days of continuous history before the
// oldest rows are trimmed, and trimming only removes the tail beyond that
// window — it never causes an insert to fail or be dropped.
const MAX_READINGS = 2_500_000;
const MAX_ALERTS = 50_000;

function rowToReading(r: any): ReadingRow {
  return {
    id: r.id,
    sessionId: r.sessionId,
    timestamp: new Date(r.timestamp),
    tiltX: r.tiltX,
    tiltY: r.tiltY,
    rotationZ: r.rotationZ,
    rpm: r.rpm,
    temperature: r.temperature,
    motorPwm: r.motorPwm,
    vibration: r.vibration,
    filteredAngleX: r.filteredAngleX ?? r.tiltX,
    filteredAngleY: r.filteredAngleY ?? r.tiltY,
    motorPulseUs: r.motorPulseUs ?? 0,
  };
}

function rowToSession(r: any): SessionRow {
  return {
    id: r.id,
    status: r.status,
    startedAt: r.startedAt ? new Date(r.startedAt) : null,
    stoppedAt: r.stoppedAt ? new Date(r.stoppedAt) : null,
    targetRpm: r.targetRpm,
    targetDurationHours: r.targetDurationHours,
  };
}

function rowToAlert(r: any): AlertRow {
  return {
    id: r.id,
    sessionId: r.sessionId,
    timestamp: new Date(r.timestamp),
    level: r.level,
    message: r.message,
  };
}

const insertReadingStmt = sqlite.prepare(`
  INSERT INTO readings (sessionId, timestamp, tiltX, tiltY, rotationZ, rpm, temperature, motorPwm, vibration, filteredAngleX, filteredAngleY, motorPulseUs)
  VALUES (@sessionId, @timestamp, @tiltX, @tiltY, @rotationZ, @rpm, @temperature, @motorPwm, @vibration, @filteredAngleX, @filteredAngleY, @motorPulseUs)
`);
const trimReadingsStmt = sqlite.prepare(`
  DELETE FROM readings WHERE id NOT IN (SELECT id FROM readings ORDER BY id DESC LIMIT ?)
`);

let insertCountSinceTrim = 0;

export const memStore = {
  readings: {
    insert(data: Omit<ReadingRow, "id" | "timestamp">): ReadingRow {
      const timestamp = new Date();
      const info = insertReadingStmt.run({ ...data, timestamp: timestamp.toISOString() });
      // Trim periodically rather than on every insert to keep the hot path fast.
      if (++insertCountSinceTrim >= 5000) {
        insertCountSinceTrim = 0;
        trimReadingsStmt.run(MAX_READINGS);
      }
      return { id: Number(info.lastInsertRowid), timestamp, ...data };
    },
    getLatest(): ReadingRow | null {
      const row = sqlite.prepare(`SELECT * FROM readings ORDER BY id DESC LIMIT 1`).get();
      return row ? rowToReading(row) : null;
    },
    getHistory(limit: number, sinceMinutes?: number | null): ReadingRow[] {
      let rows: any[];
      if (sinceMinutes) {
        const since = new Date(Date.now() - sinceMinutes * 60_000).toISOString();
        rows = sqlite
          .prepare(`SELECT * FROM readings WHERE timestamp >= ? ORDER BY id DESC LIMIT ?`)
          .all(since, Math.min(limit, MAX_READINGS));
      } else {
        rows = sqlite
          .prepare(`SELECT * FROM readings ORDER BY id DESC LIMIT ?`)
          .all(Math.min(limit, MAX_READINGS));
      }
      return rows.reverse().map(rowToReading);
    },
    getBySession(sessionId: number): ReadingRow[] {
      const rows = sqlite
        .prepare(`SELECT * FROM readings WHERE sessionId = ? ORDER BY id ASC`)
        .all(sessionId);
      return rows.map(rowToReading);
    },
    getAll(): ReadingRow[] {
      const rows = sqlite.prepare(`SELECT * FROM readings ORDER BY id ASC`).all();
      return rows.map(rowToReading);
    },
    clear(): void {
      sqlite.exec(`DELETE FROM readings`);
    },
    clearBySession(sessionId: number): void {
      sqlite.prepare(`DELETE FROM readings WHERE sessionId = ?`).run(sessionId);
    },
    getSince(since: Date, limit: number): ReadingRow[] {
      const rows = sqlite
        .prepare(`SELECT * FROM readings WHERE timestamp >= ? ORDER BY id DESC LIMIT ?`)
        .all(since.toISOString(), limit);
      return rows.reverse().map(rowToReading);
    },
    stats() {
      const row: any = sqlite
        .prepare(`
          SELECT
            AVG(rpm) as avgRpm, MAX(rpm) as maxRpm, MIN(rpm) as minRpm,
            AVG(tiltX) as avgTiltX, AVG(tiltY) as avgTiltY,
            AVG(temperature) as avgTemperature, MAX(temperature) as maxTemperature,
            COUNT(*) as totalReadings
          FROM readings
        `)
        .get();
      if (!row || row.totalReadings === 0) {
        return { avgRpm: 0, maxRpm: 0, minRpm: 0, avgTiltX: 0, avgTiltY: 0, avgTemperature: 25, maxTemperature: 25, totalReadings: 0 };
      }
      return {
        avgRpm: row.avgRpm ?? 0,
        maxRpm: row.maxRpm ?? 0,
        minRpm: row.minRpm ?? 0,
        avgTiltX: row.avgTiltX ?? 0,
        avgTiltY: row.avgTiltY ?? 0,
        avgTemperature: row.avgTemperature ?? 25,
        maxTemperature: row.maxTemperature ?? 25,
        totalReadings: row.totalReadings,
      };
    },
  },
  sessions: {
    insert(data: Omit<SessionRow, "id">): SessionRow {
      const info = sqlite
        .prepare(`
          INSERT INTO sessions (status, startedAt, stoppedAt, targetRpm, targetDurationHours)
          VALUES (@status, @startedAt, @stoppedAt, @targetRpm, @targetDurationHours)
        `)
        .run({
          status: data.status,
          startedAt: data.startedAt ? data.startedAt.toISOString() : null,
          stoppedAt: data.stoppedAt ? data.stoppedAt.toISOString() : null,
          targetRpm: data.targetRpm,
          targetDurationHours: data.targetDurationHours,
        });
      return { id: Number(info.lastInsertRowid), ...data };
    },
    getLatest(): SessionRow | null {
      const row = sqlite.prepare(`SELECT * FROM sessions ORDER BY id DESC LIMIT 1`).get();
      return row ? rowToSession(row) : null;
    },
    getAll(): SessionRow[] {
      const rows = sqlite.prepare(`SELECT * FROM sessions ORDER BY id DESC`).all();
      return rows.map(rowToSession);
    },
    update(id: number, data: Partial<SessionRow>): SessionRow | null {
      const existingRow = sqlite.prepare(`SELECT * FROM sessions WHERE id = ?`).get(id);
      if (!existingRow) return null;
      const existing = rowToSession(existingRow);
      const merged = { ...existing, ...data };
      sqlite
        .prepare(`
          UPDATE sessions SET status = @status, startedAt = @startedAt, stoppedAt = @stoppedAt,
            targetRpm = @targetRpm, targetDurationHours = @targetDurationHours
          WHERE id = @id
        `)
        .run({
          id,
          status: merged.status,
          startedAt: merged.startedAt ? merged.startedAt.toISOString() : null,
          stoppedAt: merged.stoppedAt ? merged.stoppedAt.toISOString() : null,
          targetRpm: merged.targetRpm,
          targetDurationHours: merged.targetDurationHours,
        });
      return merged;
    },
  },
  alerts: {
    insert(data: Omit<AlertRow, "id" | "timestamp">): AlertRow {
      const timestamp = new Date();
      const info = sqlite
        .prepare(`INSERT INTO alerts (sessionId, timestamp, level, message) VALUES (?, ?, ?, ?)`)
        .run(data.sessionId, timestamp.toISOString(), data.level, data.message);
      // Trim oldest alerts beyond the cap so the table doesn't grow unbounded.
      sqlite
        .prepare(`DELETE FROM alerts WHERE id NOT IN (SELECT id FROM alerts ORDER BY id DESC LIMIT ?)`)
        .run(MAX_ALERTS);
      return { id: Number(info.lastInsertRowid), timestamp, ...data };
    },
    getLatest(limit = 100): AlertRow[] {
      const rows = sqlite.prepare(`SELECT * FROM alerts ORDER BY id DESC LIMIT ?`).all(limit);
      return rows.map(rowToAlert);
    },
  },
};
