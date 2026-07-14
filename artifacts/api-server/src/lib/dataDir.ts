import { mkdirSync } from "fs";

/**
 * Resolves the directory used for durable local persistence (settings.json,
 * the SQLite history database).
 *
 * The Electron desktop app runs the API server as a child process WITHOUT
 * DATABASE_URL set — it relies entirely on local files for durability. It
 * sets GYRO_DATA_DIR to `app.getPath("userData")` (a stable, writable,
 * per-OS directory) before spawning the server, because a bare
 * `process.cwd()` is not guaranteed to be writable once the app is packaged
 * (e.g. it may resolve to a read-only install directory depending on how the
 * OS launches the executable).
 *
 * Falls back to process.cwd() for local development / Replit, where the
 * working directory is always the writable package directory.
 */
export function getDataDir(): string {
  const dir = process.env.GYRO_DATA_DIR?.trim() || process.cwd();
  mkdirSync(dir, { recursive: true });
  return dir;
}
