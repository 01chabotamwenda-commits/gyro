---
name: IR remote dialog patterns
description: How to correctly wire IR-remote-driven dialogs so they don't flicker open/close or fight over state.
---

## Bug-1 fix — consume the opening IR timestamp
When a dialog opens via an IR command, its own IR handler must NOT re-process that same event and immediately close the dialog. Fix: in the `useEffect([open])` that runs when the dialog becomes visible, set `prevIrTs.current = latestIrRef.current?.timestamp ?? null` to "consume" the event before the IR handler runs.

**Why:** React commits effects in order; the open-change effect fires before the IR-handler effect for the same render, so the timestamp is already marked seen when the IR handler checks it.

**How to apply:** Any dialog with both an open-change trigger and an internal IR handler must include this consume pattern.

## Bug-2 rule — single state owner for toggle commands
The button that toggles a dialog open/closed must be handled in exactly ONE place. If `dashboard.tsx` toggles `setSpeedOpen(prev => !prev)` on `CMD:IR_PID_TUNING`, the SpeedDialog's internal IR effect must NOT also call `onOpenChange(false)` for that same command.

**Why:** Both effects fire in the same React batch from the same `latestIrCommand` update. Two setters for the same state on the same event produce unpredictable results (may cancel each other or double-toggle).

**How to apply:** Keep open/close toggle in the parent (dashboard). The dialog's internal IR effect handles only content actions (digit input, backspace, confirm). If the dialog also needs to respond to the toggle key (e.g. to close itself), remove that from the dialog and let the parent's toggle handle it — `setSpeedOpen(prev => !prev)` already closes it when open.

## Zero digit unavailable from remote
`CMD:IR_NUM_0` is wired to E-STOP on the ESP32 firmware — pressing 0 on the remote triggers emergency stop, not a digit event. For dialogs that need numeric input including 0 (e.g. 1200–1800 µs pulse values), add an on-screen "0" button the user can tap, and note in the UI that keyboard input also works.
