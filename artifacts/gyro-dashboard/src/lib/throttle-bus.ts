/**
 * throttle-bus.ts
 *
 * Shared optimistic throttle state (µs) that updates from every source that
 * sends an h/l command — the terminal input, global keyboard shortcuts, and
 * the bottom-nav buttons all route through SystemTerminal.submitCommand, which
 * calls adjustThrottle() after each successful dispatch.
 *
 * BottomNavBar subscribes to show a live readout without needing prop drilling
 * through the dashboard.
 *
 * Note: this is an optimistic display only — it tracks estimated state,
 * not hardware-confirmed throttle. Dashboard can seed the base value from
 * settings.pidBaseThrottle so the initial display is accurate.
 */

type ThrottleListener = (current: number) => void;

const MIN_US = 1050;
const MAX_US = 1800;

let _throttleUs = 1100; // default; overwritten by dashboard when settings load
// Step size (µs) applied per Speed Up/Down press. Must mirror the firmware's
// MOTOR_SPEED_STEP (settings.motorSpeedStepUs, pushed live via
// CMD:SET_SPEED_STEP) — otherwise this optimistic display drifts from what
// the motor actually does. Defaults to 5 to match the firmware default.
let _throttleStepUs = 5;
const _listeners = new Set<ThrottleListener>();

/** Seed the throttle from the persisted settings value on app start. */
export function setThrottleBase(us: number): void {
  _throttleUs = Math.max(MIN_US, Math.min(MAX_US, us));
  _listeners.forEach(l => l(_throttleUs));
}

/** Seed the step size from settings.motorSpeedStepUs so +/- match firmware. */
export function setThrottleStep(us: number): void {
  _throttleStepUs = Math.max(1, Math.min(200, us));
}

/** Get the current configured step size (µs). */
export function getThrottleStep(): number {
  return _throttleStepUs;
}

/** Apply a delta and notify subscribers. */
export function adjustThrottle(delta: number): void {
  setThrottleBase(_throttleUs + delta);
}

/** Get the current estimated throttle value. */
export function getThrottle(): number {
  return _throttleUs;
}

/**
 * Subscribe to throttle changes. The callback is called immediately with the
 * current value, then on every change. Returns an unsubscribe function.
 */
export function subscribeThrottle(cb: ThrottleListener): () => void {
  _listeners.add(cb);
  cb(_throttleUs); // emit current value immediately on subscribe
  return () => {
    _listeners.delete(cb);
  };
}
