---
name: Gyro desktop offline persistence
description: How readings/sessions/alerts survive on the Electron desktop build where DATABASE_URL is intentionally unset
---

The Electron desktop app spawns the API server without `DATABASE_URL` ("offline mode"). The server's `memStore` (in `artifacts/api-server/src/lib/mem-store.ts`) is backed by `better-sqlite3` writing to a file in a directory resolved via `dataDir.ts` (`GYRO_DATA_DIR` env var, falling back to `process.cwd()`).

**Why:** the store used to be a pure in-RAM array capped at 10k rows — total data loss on every restart/close. Desktop `main.js` now passes `GYRO_DATA_DIR: app.getPath("userData")` so the DB file lands in a stable, writable, per-OS user-data folder instead of `process.cwd()`, which can be a read-only install dir once packaged.

**How to apply:** the exported `memStore` API surface (readings/sessions/alerts insert/get*/update/clear) is preserved exactly, so route files (`ingest.ts`, `readings.ts`, `session.ts`, etc.) never needed changes — only the storage backend changed. If adding new memStore methods, keep writes synchronous (WAL mode) so an unexpected app kill doesn't lose the latest reading. Verified via standalone test: writing with one process and reading with a completely fresh process against the same `GYRO_DATA_DIR` returns the same data — confirms durability independent of process lifetime.
