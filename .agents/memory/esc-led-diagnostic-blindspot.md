---
name: LED feedback does not prove motor/ESC execution
description: Why the onboard LED blinking on command receipt is not evidence the ESC/motor actually responded — and where to look instead.
---

`signalLed()` in `handleAppCommand()` fires unconditionally at the top of the
function for every recognized `CMD:*` string, before any of the actual
start/stop/throttle logic runs. So "LED blinks on command" only proves the
ESP32 received and parsed the command (WiFi/serial transport + string match
are fine) — it proves nothing about whether `startMotor()`/`setThrottleTarget()`
actually changed the ESC pulse, let alone whether the motor spun.

**Why this matters:** when a user reports "LED confirms receipt but motor
doesn't move," the bug is almost never in the command pipeline (app → API
server → WiFi TCP/serial → `handleAppCommand`) — that path is proven working
by the LED. The remaining suspects are firmware motor-control state
(`motorRunning`/`manualThrottle`/`autoMode` interplay) or, more often,
electrical/ESC-level: ESC not armed/powered at boot, motor battery rail
disconnected or dead (fully independent of the ESP32's own USB/3.3V power,
so WiFi+LED+IMU all working is not evidence the motor rail is live), wrong
signal GPIO, or MIN_THROTTLE/ARM_THROTTLE values outside the specific ESC's
calibrated PWM range.

**How to apply:** to isolate software vs. hardware, check the `motorPulseUs`
/ `escPulse` field the firmware streams in telemetry (forwarded by both
ingest routes) before/after sending a command — if that number changes as
commanded, firmware logic is correct and the fault is downstream (ESC power,
wiring, or ESC calibration/arming), not code. If it does *not* change,
re-check `motorRunning`/`autoMode` gating in `handleAppCommand` first.
