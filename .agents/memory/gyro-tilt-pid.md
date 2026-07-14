---
name: Gyro tilt-PID architecture
description: Why the ESP32 auto mode PID controls tilt (not RPM), and how gains flow from settings to firmware.
---

The gyro rig's `CMD:SET_AUTO` mode runs a PID loop whose feedback variable is
IMU tilt angle (`error_X`/`error_Y`), not RPM.

**Why:** the RPM sensor only reports a new value every ~250ms
(`RPM_REPORT_INTERVAL_MS`), while the IMU/PID loop ticks every `loop()`
iteration (much faster). A control loop can't be meaningfully faster than its
feedback signal, so RPM cannot be the fast-loop feedback variable on this
hardware. This mirrors the same conclusion independently reached in the
reference `gyro-codes` repo's `auto_throttle.h`. Auto mode therefore
stabilizes the rig level (tilt -> 0) rather than holding an exact target RPM.
Manual mode (`CMD:MANUAL_RPM:<n>`) is still just an open-loop linear
RPM->pulse map — it does not hold RPM under load either.

**How to apply:** if asked to make "auto mode hit an exact RPM," that
requires either a faster RPM sensor/ISR-based tachometer or a cascaded
outer-loop RPM correction on top of the tilt PID — it's a hardware
limitation, not a tuning problem. Gains (`pidKp/pidKi/pidKd`) live in
`artifacts/api-server/src/lib/settingsStore.ts` and are pushed live to the
ESP32 via `CMD:SET_PID:<kp>,<ki>,<kd>` whenever `PUT /settings` changes them
— no reflash needed to retune.
