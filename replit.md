# Gyroscope Monitor

Real-time monitoring dashboard for a gyroscope test system, with ESP32 hardware integration via WebSocket, live sensor data visualization, and configurable safety thresholds.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080, proxied at `/api`)
- `pnpm --filter @workspace/gyro-dashboard run dev` — run the web dashboard (port 21211, proxied at `/`)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5, WebSocket Server
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)
- Frontend: React + Tailwind CSS + Recharts + shadcn/ui

## Where things live

- **API Server**: `artifacts/api-server/src/` — Express server with WebSocket, hardware ingest, safety monitoring
- **Dashboard**: `artifacts/gyro-dashboard/src/` — React web app with live charts, stat cards, system events
- **DB Schema**: `lib/db/src/schema/` — Drizzle ORM tables (sessions, readings, alerts)
- **API Contract**: `lib/api-spec/openapi.yaml` — OpenAPI spec consumed by Orval
- **Generated Client**: `lib/api-client-react/src/generated/` — React Query hooks and Zod schemas from Orval
- **Settings**: `artifacts/api-server/src/lib/settingsStore.ts` — in-memory server settings (thresholds, targets)
- **Safety Logic**: `artifacts/api-server/src/routes/ingest.ts` — evaluates readings against thresholds, fires alerts, triggers emergency stop

## Architecture decisions

- **Settings are in-memory only** — no persistent settings table; values reset on server restart. The `settingsStore` holds the current thresholds and target values.
- **WebSocket broadcasts for real-time updates** — readings, alerts, and hardware state changes are pushed to all connected dashboard clients via WebSocket, not polled.
- **Safety monitoring runs on ingest** — threshold checks happen in the `/readings/ingest` route before the reading is stored. Critical violations trigger `emergency_stop` and fire alerts immediately.
- **Stats window is 30 seconds** — the `/readings/stats` endpoint looks at the last 30 seconds of data to match the chart's 1-minute visibility window. Stat cards fall back to the latest live reading if the stats window is empty.
- **Dark theme requires `border-border/70 shadow-sm` for card visibility** — the default `--border` color is very subtle on dark backgrounds; cards need explicit opacity for borders to show.

## Product

- Real-time hardware monitoring dashboard for gyroscope test rigs
- Connects to ESP32 via USB serial bridge (WebSocket protocol)
- Displays live sensor data: RPM, tilt X/Y, temperature, vibration, PWM
- Configurable safety thresholds (temperature, vibration, max tilt)
- Automatic safety monitoring: emergency stop when critical thresholds exceeded
- Session management with pre-flight checks and motor control
- System events panel with alert history
- Settings page for tuning thresholds, connectivity, and appearance

## User preferences

- Dark theme by default; user can toggle between light/dark in settings

## Gotchas

- **Always restart `artifacts/api-server` after changing server-side code** — the Express server runs as a persistent workflow; `pnpm run dev` won't auto-restart.
- **Do not run `pnpm dev` at workspace root** — artifacts are configured as Replit workflows; run per-package via `--filter`.
- **Settings are not persisted** — changing thresholds on the server will reset on restart. The user may want a persistent settings store in the future.
- **The `readings/ingest` endpoint expects vibration to be sent as `vibration` in the request body**, but the DB table stores it as `motorPwm` — vibration is derived from RPM if not provided.
- **Stats cards fall back to live reading if no stats available in the 30s window** — this is intentional so cards show data even when the hardware window is small.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
- See the `deployment` skill for publishing instructions
