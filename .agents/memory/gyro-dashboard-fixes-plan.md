---
name: Gyro dashboard fixes plan status
description: Status and gotchas for docs/plan-gyro-dashboard-fixes.md (12-item hardware/dashboard fix list)
---

As of 2026-07-11, items 1,2,4,5,6,7,8,9,10,11,12 in docs/plan-gyro-dashboard-fixes.md are done; only item 3
(CMD:PREFLIGHT sensor self-test sequence) remains, and it's the most complex — do it last.

**Why the telemetry items (6/7/8) needed 4-layer threading:** any new firmware telemetry field must be added at
all of: (1) firmware JSON in `sendAppTelemetry()`, (2) BOTH ingest paths — `wifi-tcp-server.ts` (WiFi/TCP) AND
`ingest.ts` (USB serial via Electron bridge) parse the same JSON shape independently and both needed the new
field added, (3) `readingsTable`/`ReadingRow` schema in both Drizzle (Postgres) and mem-store.ts (SQLite,
the actually-active store when DATABASE_URL is unset) — mem-store needs an explicit `ALTER TABLE ADD COLUMN`
migration loop since `CREATE TABLE IF NOT EXISTS` doesn't add columns to pre-existing DB files, (4) the
`SensorReading` schema in openapi.yaml + `pnpm run codegen` in lib/api-spec (also rebuild `@workspace/db`
via `tsc --build` first, or the new Drizzle columns won't be visible to api-server's typecheck).

**Why tiltX/Y ≠ the angle to plot:** tiltX/Y are the post-reference-subtraction *error* term; the actual
Kalman-filtered angle needs its own field (filteredAngleX/Y) — conflating the two silently breaks any chart
that's supposed to show absolute orientation rather than deviation from a leveled reference.

**Alert session-scoping:** Alert rows already carried `sessionId` in the DB/mem-store, but the openapi Alert
schema didn't expose it — a value can exist in the runtime JSON while being invisible to the generated TS
client until the schema is updated and codegen re-run.
