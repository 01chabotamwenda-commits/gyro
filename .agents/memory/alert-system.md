---
name: Alert & Notification System
description: Architecture and key decisions for the 5-level alert/notification system added to gyro-dashboard
---

## Architecture

**5 severity levels:** `info`, `warning`, `error`, `critical`, `emergency`

Alert levels are defined in:
- `lib/api-spec/openapi.yaml` — `Alert.level` enum (source of truth)
- `artifacts/api-server/src/lib/mem-store.ts` — `AlertRow.level` type
- `artifacts/api-server/src/lib/motor.ts` — `fireAlert()` parameter type
- `artifacts/gyro-dashboard/src/contexts/alert-context.tsx` — `AlertLevel` type

## Key files

| File | Role |
|---|---|
| `artifacts/gyro-dashboard/src/contexts/alert-context.tsx` | Global context: dispatch, dedup, behavior config, history |
| `artifacts/gyro-dashboard/src/components/AlertCriticalDialog.tsx` | Blocking modal for `dialog` delivery mode |
| `artifacts/gyro-dashboard/src/components/AlertEmergencyOverlay.tsx` | Full-screen takeover for `fullscreen` delivery mode |
| `artifacts/gyro-dashboard/src/components/AlertCenter.tsx` | Slide-out sheet: active + history, per-level filter, `AlertBellButton` |
| `artifacts/gyro-dashboard/src/components/AlertBehaviorSettings.tsx` | Per-level behavior config UI (in settings page) |
| `artifacts/gyro-dashboard/src/components/ui/sonner.tsx` | Sonner Toaster — uses app's `useTheme()`, NOT next-themes |

## Behavior config

Stored in `localStorage` under key `gyro_alert_behavior_v1`. Defaults:
- `info` → log only, no sound
- `warning` → toast, 5000ms auto-dismiss, no sound
- `error` → toast, sticky, sound
- `critical` → dialog (blocking), sound
- `emergency` → fullscreen overlay, sound

## Delivery routing (context dispatch)

1. **dedup** via bounded `Map<id, insertionTime>` (cap 5,000 — prunes oldest half when exceeded)
2. **history** — all alerts go here (500-item cap, newest first)
3. **routing** — `log` = nothing extra; `toast` = `sonner.toast()`; `dialog`/`fullscreen` = push to `activeAlerts`

## Alert ingestion in dashboard.tsx

Two paths — both idempotent because dispatch deduplicates by ID:
1. **WebSocket** (`latestAlert`) — dispatched via `useEffect` on each new `latestAlert.id`
2. **Polled** (`useGetAlerts` every 5s) — reconciles history; catches alerts missed during WS disconnect

## Acknowledge semantics

- `acknowledge(id)` — removes one active alert by ID
- `acknowledgeByDelivery(delivery)` — removes all active alerts matching a delivery mode (used by emergency overlay "Clear all" so it only clears fullscreen alerts, not unrelated dialogs)
- `acknowledgeAll()` — clears everything (used in AlertCenter header)

## Sound

Single reused `AudioContext` (`_audioCtx` module-level singleton, recreated only if closed).
Pattern: `emergency` = double beep at 880Hz+1056Hz, `critical` = 660Hz, others = 440Hz.

## Fast Refresh note

`DEFAULT_ALERT_BEHAVIOR` is a non-component export from `alert-context.tsx` — Vite logs a "Could not Fast Refresh" warning during HMR. This is harmless (triggers a full module reload instead of partial). No action needed.
