# Gyro Dashboard / Firmware Fix Plan

**Status as of 2026-07-11:** All 12 items are addressed. Item 3's active sensor self-test (motor spin + RPM-sensor confirmation, not just a passive MPU6050 ping) turned out to already exist as `runHardwareVerification()` in `artifacts/api-server/src/lib/hardware-verification.ts` — it fires automatically on every session start, does the MPU6050/temperature/motor-sweep-with-RPM-check sequence this item asked for, and reports real pass/fail via alerts (not scripted). One intentional difference from the item-3 spec: only "hardware not connected at all" blocks session start (`runPreflightChecks()` in `session.ts`); a failed sensor *sweep* is advisory only — the session is allowed to continue so the operator can fix wiring without losing session state. That's an existing, deliberate design choice, not an oversight — flagged here in case the user wants it to hard-block instead.

Items 2, 4, 6, 8 touched `hardware/firmware/gyro_controller/gyro_controller.ino` — **the ESP32 needs a physical reflash before those fixes are live.**

Source: user feedback dropped in `attached_assets/Pasted-right-now-the-session-ends-immediately...txt` on 2026-07-10, cross-checked against the current firmware (`hardware/firmware/gyro_controller/gyro_controller.ino`) and the user's reference firmware (`attached_assets/Pasted--gyro-balance-v4-ino...txt`, a v4 controller the user says had working PID). This file is the actionable to-do list for whoever (human or agent) picks this up next. Each item lists: what's wrong, where, and the concrete fix.

Firmware changes only take effect after reflashing the ESP32 — flag this to the user after any firmware edit.

## 1. Session ends immediately on hardware disconnect — needs a grace period
**Where:** `artifacts/api-server/src/lib/wifi-tcp-server.ts` (~line 104, 168) calls `closeRunningSession` the instant the TCP socket drops, firing a critical alert immediately. `artifacts/gyro-dashboard` reconnects the websocket every 2s but the session is already finalized server-side by then.

**Fix:**
- In `wifi-tcp-server.ts`, on socket close/error, don't call `closeRunningSession` synchronously. Start a grace timer (e.g. 5-10s, make it a constant) and mark the session as "hardware disconnected, awaiting reconnect" (a new transient in-memory flag, not a DB status change).
- If the ESP32 reconnects (new TCP connection matching the pending session) before the timer fires, cancel the timer and resume normally — no alert needed, or a low-severity "reconnected" info line.
- If the timer elapses with no reconnect, then call `closeRunningSession` and fire the critical disconnect alert as today.
- Surface the pending/grace state to the dashboard (e.g. a `hardwareGrace: true` field in `/api/session` or a WS event) so the UI can show "reconnecting…" instead of the harsh disconnect banner during the grace window.

## 2. Motor needs manual pulse bumps to actually start — add auto ramp-up
**Where:** `gyro_controller.ino` motor start path (~line 1085) calls `setThrottleTarget(manualThrottle)` once; `rampStep()` (~line 972) only moves by `MOTOR_SPEED_STEP` per explicit command, there's no automatic multi-step ramp on start.

**Fix:** On `CMD:MOTOR_START` (or whatever triggers `motorRunning = true`), instead of a single `setThrottleTarget(manualThrottle)`:
- Kick off a non-blocking ramp: schedule up to 3 automatic `+MOTOR_SPEED_STEP` bumps, one every 250ms, using `millis()`-based timing in the main loop (no `delay()` — this firmware is a polling loop, must stay non-blocking).
- Stop early if RPM sensor reports the flywheel is already spinning above some minimal threshold before all 3 steps fire.
- Track this with a small state machine (`startRampStepsRemaining`, `startRampNextAtMs`) checked once per `loop()` iteration.

## 3. No sensor self-test on session start
**Where:** Current firmware only does a passive MPU6050 connectivity check in `initMPU()`/`loop()` (~lines 781-818), reporting `HEALTH:MPU6050=OK/FAIL`. There's no active "run the motor briefly, confirm RPM sensor + vibration + temperature respond" pre-flight, and `wifi-tcp-server.ts` doesn't orchestrate one — dashboard just shows a pre-flight message today (per earlier screenshots) but it doesn't appear to be a real test.

**Fix:** Add a `CMD:PREFLIGHT` sequence, triggered automatically when a session starts:
1. Firmware confirms MPU6050 I2C responds (already have this) and RPM sensor pin is wired/pulsing.
2. Ramp motor up to a low test throttle for ~1s, confirm RPM sensor reports non-zero, then ramp back down to idle before the real session throttle target takes over — reuse the ramp logic from item 2 for both directions so it's smooth, not a jump.
3. Report `HEALTH:PREFLIGHT=OK` or `HEALTH:PREFLIGHT=FAIL:<reason>` over serial/TCP; api-server surfaces this in the session-start flow and blocks starting if it fails (already has a FAIL path shown in dashboard screenshots — reuse it, just make sure a real test produces that result instead of only the "no ESP32 detected" case).

## 4. Motor stop should ramp down smoothly (except emergency stop)
**Where:** `stopMotor()` (~line 1093) and `emergencyStop()` (~line 1108) both currently call `setThrottle(ARM_THROTTLE)` / `motorRampTarget = ARM_THROTTLE` immediately — same instant-cutoff behavior for both.

**Fix:** Split the two paths:
- `stopMotor()` (normal stop): set `motorRampTarget = 0` (or `ARM_THROTTLE` if that's the true floor) but let the existing `rampStep()` mechanism decrease it gradually (e.g. one `MOTOR_SPEED_STEP` per loop tick or per fixed interval) instead of setting throttle directly — same non-blocking timer approach as item 2, just decreasing.
- `emergencyStop()`: keep as-is — instant, unconditional cutoff, no ramp, this must stay a true hard stop for safety.

## 5. PID toggle is broken / accessible when it shouldn't be
**Where:**
- Dashboard: `ControlDialogs.tsx` PID toggle buttons (~lines 748, 759) have no `disabled` check for whether a session is active — clickable even with no session running.
- Firmware: `runBalanceController()` (~lines 1148-1215) computes `u`, and throttle becomes `manualThrottle + u`. When PID is turned off via `enterManualMode()` (~line 986), `manualThrottle` gets re-constrained to `sentMotorPulse` — but if `motorRunning` is false at that moment, it falls through to `ARM_THROTTLE`, which reads as ~0% PWM even though the session/motor state says "running". Turning PID on shows ~5% because `manualThrottle` defaults near `ARM_THROTTLE` and the small `u` correction barely lifts it.

**Fix:**
- Gate the PID on/off buttons in the dashboard: disable them unless a session is active (mirror the `isCommandAllowed` gating already used elsewhere, e.g. in `SystemTerminal.tsx`).
- In firmware, fix `enterManualMode()`'s fallback: when switching auto→manual while `motorRunning` is true, seed `manualThrottle` from the current actual `sentMotorPulse`/`heldMotorPulse` value (bumpless transfer), never from `ARM_THROTTLE`, so PWM doesn't collapse. This mirrors the "BUMPLESS TRANSFER" feature described in the reference v4 file's header comment (item 7 in its changelog) — port that specific behavior even though the two files otherwise both lack it in the stop/start paths.
- Double check the reverse transition (manual→auto): confirm the integral term is re-seeded from the current throttle too, so switching PID on doesn't start from a near-zero integral and produce that ~5% dip — this is the same bumpless-transfer principle applied in the other direction.

## 6. Angle plot shows raw angle instead of filtered angle
**Where:** Telemetry (`sendAppTelemetry`, ~line 431) sends `error_X`/`error_Y` = `current_angleX - refAngleX`. `current_angleX` is set from `kalmanAngleX` (~line 900) — this IS the filtered/fused angle, but the value actually transmitted is the *error* (post-reference-subtraction), not the raw filtered angle itself.

**Fix:** Add `kalmanAngleX`/`kalmanAngleY` (the filtered angle, pre-reference-subtraction) as new telemetry fields (e.g. `filteredAngleX`/`filteredAngleY`), and update the dashboard's tilt chart (`LiveCharts.tsx`) to plot those instead of (or alongside) `tiltX`/`tiltY`. Confirm the full pipeline: firmware JSON → `wifi-tcp-server.ts` parser → readings DB schema/insert → `SensorReading` API type → `LiveCharts.tsx`. All four layers need the new field threaded through, not just the firmware.

## 7. Flywheel plot should show RPM; stat card should show motor pulse instead of RPM
**Where:** `LiveCharts.tsx` (~line 311) flywheel chart subtitle says "fit to data" with no RPM number next to it. `StatCards.tsx` (~lines 142, 154) shows a "Flywheel RPM" stat card.

**Fix:**
- In `LiveCharts.tsx`, add the live RPM value next to the "fit to data" label on the flywheel speed chart header (same pattern as other chart headers that show a live value).
- In `StatCards.tsx`, replace the RPM stat card's content with "Sent to motor pulse" (the throttle/pulse value actually sent to the ESC — likely `sentMotorPulse`/`heldMotorPulse` from telemetry, already present in the WS payload per `sendAppTelemetry`). Keep the RPM number visible via the chart instead.

## 8. Temperature plot not showing MPU6050 fallback readings
**Where:** Firmware already sends `tempC` from `siliconTempC` (MPU6050 ambient/die temp) when `HAS_TEMP_SENSOR` is 0 (this fallback was added in a previous session). Need to re-verify the full pipeline end to end now that it's live: `wifi-tcp-server.ts` parsing → readings insert → `SensorReading.tempC`/`temperature` → `LiveCharts.tsx` `TempChart`.

**Fix:** This may already be fixed by the earlier firmware change — the remaining risk is a naming mismatch (`tempC` in firmware JSON vs `temperature` column/field elsewhere) somewhere in the chain, or the chart requiring a `HAS_TEMP_SENSOR`-derived capability flag before it renders. Trace the field name end-to-end and fix whichever layer drops or renames it. Needs a live hardware test (or a mocked WS payload) to confirm the chart actually populates, since the ESP32 wasn't connected during earlier testing (dashboard showed "no ESP32 detected").

## 9. "Signal lost" banner shows falsely
**Where:** `dashboard.tsx` (~lines 294-305) has a 3-second watchdog on `lastReadingAt` from the websocket hook — too short a threshold for normal WiFi/serial jitter, causing false positives while the hardware is actually fine.

**Fix:** Increase the watchdog threshold (e.g. to 8-10s) and/or require N consecutive missed expected-reading intervals rather than a single timeout, to avoid one dropped packet flapping the banner. Only show "signal lost" when the underlying websocket/TCP connection itself is actually down, not just a momentarily late reading — check `use-websocket.ts`'s actual connection-state signal vs the reading-staleness signal and prefer the former as the primary trigger, using staleness only as a secondary confirmation after a longer buffer.

## 10. Critical alert dialog wording too formal
**Where:** `AlertCriticalDialog.tsx` (~line 91) and `AlertEmergencyOverlay.tsx` (~line 88) both use "Acknowledge" as a button label.

**Fix:** Replace with plain everyday phrasing, e.g. "Acknowledge" → "Got it" / "OK, I see it" (the disconnect case already uses "OK" — extend that tone consistently across both dialogs). Sweep both files for any other stiff/formal wording (e.g. "Dismiss", "Confirm receipt") and simplify to match.

## 11. Notifications badge should only count the current session's alerts
**Where:** `alert-context.tsts`'s `notifiedCount`/badge logic counts everything in `history`, which accumulates across the whole browser session regardless of which hardware session produced each alert — it doesn't reset or filter when a new session starts.

**Fix:** Tag each alert with the `sessionId` it belongs to (should already be available from the WS payload/DB row). Compute the badge count as only those alerts whose `sessionId` matches the currently active session. When a new session starts, the badge naturally resets to 0 since no alerts for that new `sessionId` exist yet. Keep full cross-session history intact in the "History" tab — only the active-badge count needs the session filter.

## 12. Settings page — Save button, firmware tuning save, and missing "starting pulse" field
**Where:** `settings.tsx` computes `settingsLocked` (~line 1171) from `sessionActive || motorRunning` and disables the whole form via `<fieldset disabled={settingsLocked}>` (~line 1332) — likely locked far more often than the user expects (e.g. as soon as any session exists, even if idle/completed, depending on how `sessionActive` is derived — re-check that condition matches "truly running", not "exists"). `FirmwarePanel.tsx` only has a binary-upload flow (`handleUpload`), no separate save/push for firmware tuning values. There's no "starting pulse" / initial arm-throttle field anywhere in the settings schema.

**Fix:**
- Re-verify the `settingsLocked` condition matches the intended lock scope (motor truly `on` or session truly `running`/`warning` — not just "a session row exists"). If it's over-locking, narrow it; this is likely why "even the save all button is not working" — it's disabled, not broken, but the condition may be wrong or the user may be triggering it by leaving a session in a stuck non-idle state.
- Add a "Starting pulse" (arm throttle) numeric field to the settings form (Performance or PID Tuning section), wired to a new/existing firmware setting (e.g. `CMD:SET_ARM_THROTTLE:<us>`ARM_THROTTLE currently looks like a compile-time constant in firmware — needs to become a runtime-settable variable, same pattern as `MOTOR_SPEED_STEP`).
- If Firmware Tuning fields are meant to push live (not just via the binary upload flow), ensure they're included in the same `PUT /settings` payload/save flow as everything else, or add an explicit "Save & push" action to `FirmwarePanel.tsx` if it's a genuinely separate save path.

## Suggested order of work
1. Settings lock bug + starting-pulse field (12) — unblocks the user from configuring anything else.
2. PID bumpless-transfer fix (5) + PID button gating (5) — most safety/usability critical.
3. Session disconnect grace period (1) — directly requested, isolated to api-server.
4. Motor start ramp-up (2) + stop ramp-down (4) — firmware-only, can be done together.
5. Sensor self-test (3) — depends on ramp logic from step 4.
6. Angle filtering (6), RPM/pulse swap (7), temperature pipeline check (8) — telemetry/display changes, low risk, can be parallelized across different files.
7. Signal-lost banner tuning (9) and alert wording (10) — small, isolated UI fixes.
8. Notification badge session-scoping (11) — isolated to alert-context.tsx.

Every firmware-touching item (2, 3, 4, 5, 6, 12's ARM_THROTTLE change) requires a physical reflash of the ESP32 before it takes effect — none of it is live until the user uploads the new `.ino`.
