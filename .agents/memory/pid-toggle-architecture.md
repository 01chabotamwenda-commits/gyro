---
name: PID auto-mode toggle architecture
description: How the dashboard push-button, IR remote, and firmware stay in sync for PID auto/manual mode.
---

Three independent triggers can flip PID auto mode, and all of them converge on the
same firmware state (`autoMode` bool) so the dashboard reflects truth regardless of
which trigger fired:

1. **Dashboard push-button** — calls `POST /motor/pid` (`{enabled: boolean}`),
   which sends `CMD:SET_AUTO` or the new `CMD:SET_MANUAL` firmware command.
2. **IR remote "200+" button** — repurposed (was unimplemented, hex `0x0D`,
   `IR_200_PLUS`); firmware's `handleIR()` toggles `autoMode` directly.
3. **Firmware itself** — safety logic can drop out of auto mode on its own.

**Why a `CMD:SET_MANUAL` command was needed:** the app previously only had
`CMD:SET_AUTO` (no symmetric "turn auto off" command). Added `CMD:SET_MANUAL` to
`handleAppCommand()` mirroring `CMD:SET_AUTO`, calling `enterManualMode("APP_MANUAL")`
without touching throttle.

**How the dashboard learns the current mode without polling:** `mode`/`pidOutput`/
`pidTilt` are already sent by firmware on ingest but were previously dropped by the
server. `ingest.ts` now forwards them in the WS `reading` broadcast, and the client
type is `ExtendedSensorReading` (`SensorReading & {mode?, pidOutput?, pidTilt?}`) in
`use-websocket.ts`. Any UI needing live PID state should read `mode` off the
websocket reading, not add new polling.

**How to apply:** if adding another auto/manual entry point (e.g. a schedule or
voice command), route it through `POST /motor/pid` (or the underlying
`CMD:SET_AUTO`/`CMD:SET_MANUAL` firmware commands) rather than inventing a new
state-toggle path — this keeps the physical remote, dashboard button, and any future
trigger all reading/writing the same single source of truth.
