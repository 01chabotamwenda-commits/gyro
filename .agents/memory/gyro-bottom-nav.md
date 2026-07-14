---
name: Gyro dashboard bottom nav and command architecture
description: Architecture decisions for the BottomNavBar, command gating, throttle bus, and global keyboard shortcuts added to the gyro dashboard.
---

## Command gate (`src/lib/command-gate.ts`)
Module-level singleton (not React state) — must be readable synchronously inside SystemTerminal.submitCommand without closures. Dashboard syncs it via `useEffect(() => setSessionActive(sessionActive))`. Inherent stale window exists (one render cycle), accepted trade-off.

**Why:** React state can't be read inside a module-level function called from SystemTerminal; refs would require prop drilling.

**Always-allowed set:** x, X, CMD:MOTOR_STOP, CMD:EMERGENCY_STOP.

## Throttle bus (`src/lib/throttle-bus.ts`)
Pub/sub singleton for optimistic throttle µs display. `adjustThrottle(±50)` called in SystemTerminal.submitCommand for h/l and CMD:SPEED_UP/CMD:SPEED_DOWN. Base seeded from `settings.pidBaseThrottle` in a dashboard useEffect. BottomNavBar subscribes with `subscribeThrottle(setThrottleUs)`.

**Limitation:** Optimistic only — does not reflect hardware ACK. Does not update for IR-triggered speed changes.

## BottomNavBar auto-hide
- Unmounts entirely when `!sessionActive`.
- Starts `pinned=true` (expanded) on session start; `userPinnedRef` tracks manual vs auto pin.
- Auto-collapses (setPinned(false)) when `keyboardShortcutUses >= 2` and `!userPinnedRef.current`.
- Hover peeks with 250ms leave debounce; click toggles pin.
- `keyboardShortcutUses` resets to 0 in dashboard when session becomes active (new session).

## Global keyboard shortcuts
- `q/Q` — start session (keyboard override, skipVerification:true, same as IR CH+). Dedup via `sessionStartPendingRef`.
- `a/A` — toggle PID; gates by sessionActive, shows toast if no session.
- `s/x/h/l/z/w` — routed through terminal-bus → SystemTerminal.submitCommand (command-gated, logged).
- `Esc` — emergency stop, always allowed.
- Counter increments on a/s/x/h/l/z/w when session active.

## Layout: full-screen fit
- `<main>` uses `p-2` (was p-4) and `overflow-auto` (auto so content CAN scroll on small screens but fits on full-screen).
- Right sidebar controls section: `max-h-[44vh] overflow-y-auto` (no shrink-0) so terminal always gets flex-1 space.
- sidebar width: 260px (was 270px); gaps: gap-2/gap-3 (were gap-4).

## Session start: three paths (known drift)
1. Button: `SessionControl.handleStart()` — skipVerification:false
2. IR CH+: inline in `SessionControl` IR effect — skipVerification:true  
3. Keyboard q: `dashboard.handleSessionStart()` — skipVerification:true

These are not unified. Acceptable for now; consolidation would require lifting session start to dashboard level.
