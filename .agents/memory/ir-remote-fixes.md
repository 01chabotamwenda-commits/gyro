---
name: IR remote button fixes
description: Root causes and fixes for IR remote buttons not working in gyro dashboard
---

## Three bugs that broke most remote buttons

### Bug 1 — TuningDialog opens then immediately closes (race condition)
**What happened:** When `CMD:IR_PID_TUNING` arrived and dashboard.tsx called `setTuningOpen(true)`, the TuningDialog re-rendered with `open=true`. Its useEffect re-fired (because `open` is in the dep array). `prevIrTimestamp.current` was still null (the effect had always returned early via `if (!open) return` while the dialog was closed). So the effect processed `CMD:IR_PID_TUNING` again and hit the "close dialog" branch — dialog opened and closed in the same frame.

**Fix:** In the `open` change useEffect, immediately consume the latest IR timestamp:
```javascript
const latestIrCommandRef = useRef(latestIrCommand);
useEffect(() => { latestIrCommandRef.current = latestIrCommand; }, [latestIrCommand]);

useEffect(() => {
  if (open) {
    // ... reset selection etc ...
    prevIrTimestamp.current = latestIrCommandRef.current?.timestamp ?? null;
  }
}, [open]); // eslint-disable-line react-hooks/exhaustive-deps
```

**Why:** Using a ref for `latestIrCommand` lets us read the current value at open-time without adding it to the `open` effect's deps (which would cause infinite re-runs).

### Bug 2 — IrCommandFeed fought the dashboard toggle
**What happened:** IrCommandFeed called `onPidMode?.()` (which is `setTuningOpen(true)`) for `CMD:IR_PID_TUNING`. dashboard.tsx's useEffect also fired and called `setTuningOpen(prev => !prev)`. With React 18 automatic batching, the functional updater saw the pending `true` from IrCommandFeed and returned `!true = false`. Net result: dialog never opened.

**Fix:** Remove `line === "CMD:IR_PID_TUNING"` from IrCommandFeed's `onPidMode` trigger. The dashboard.tsx toggle is the single owner of that button's open/close state. IrCommandFeed still opens the dialog for firmware-native PID mode lines (`PID_MODE:ENTER`, `PID_SELECT:`, `PID_LIVE:`, `CMD:PID_SET_`).

**Why:** Multiple React state setters for the same piece of state in the same render cycle — even in separate useEffect callbacks — are batched. Functional updaters chain on each other, so the last one's input is whatever prior updaters produced.

### Bug 3 — PID param push never reached ESP32 in WiFi mode
**What happened:** TuningDialog's `pushField`/`pushAll` called `POST /api/serial/write`, which only calls `queueSerialWrite()`. That queue is polled by the Electron desktop bridge. In WiFi TCP mode (no Electron), nothing polls the queue and commands were silently dropped.

**Fix:** Updated `POST /api/serial/write` in `ingest.ts` to mirror `motor.ts` pattern:
```javascript
const wifiSent = sendWifiCommand(cmd);
if (!wifiSent || !isWifiConnected()) queueSerialWrite(cmd);
```
Both `sendWifiCommand` and `isWifiConnected()` checked together because `sendWifiCommand` can return true just before socket teardown.

### Session start bug (fixed earlier)
`CMD:IR_CH_PLUS` called `handleStart()` which opened a pre-start dialog — no way to confirm it via remote. Fixed: IR handler now calls `doStart(true)` directly, bypassing the dialog.

## IR button map (firmware → dashboard)
| Button | Firmware sends | Dashboard action |
|--------|---------------|-----------------|
| CH (middle) | `CMD:IR_PID_TUNING` | Toggle TuningDialog |
| CH+ | `CMD:IR_CH_PLUS` | Start session (doStart(true)) |
| CH− | `CMD:IR_CH_MINUS` | Open stop-session confirm |
| ▶⏸ | `CMD:IR_START` / `CMD:IR_STOP` | Motor on/off within active session |
| 0 | `CMD:IR_EMERGENCY_STOP` | ESP32 handles directly; no dashboard handler needed |
| NEXT / PREV | `CMD:IR_NEXT/PREV` | TuningDialog: next/prev field; session confirm: toggle selection |
| VOL+ / VOL− | `CMD:IR_VOL_PLUS/MINUS` | TuningDialog: step field by ±step |
| EQ | `CMD:IR_EQ` | TuningDialog: push all params to ESP32 |
| 1–9 | `CMD:IR_NUM_1`–`NUM_9` | TuningDialog: digit input |
| 100+ | `CMD:IR_BACKSPACE` | TuningDialog: delete last digit |
| 200+ | `IR_200_PLUS` (0x0D) | Toggle PID auto-mode on/off (physical push-button); mirrors dashboard toggle and `POST /motor/pid` |
