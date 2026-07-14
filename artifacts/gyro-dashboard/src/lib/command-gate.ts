/**
 * command-gate.ts
 *
 * Centralised session-active gate. All command paths (terminal input, global
 * keyboard shortcuts via terminal-bus, bottom-nav buttons) funnel through
 * submitCommand in SystemTerminal, which calls isCommandAllowed before sending.
 *
 * When no session is active, only motor-stop / emergency-stop commands are
 * permitted; everything else is blocked and logged as a rejection line.
 *
 * The gate is updated by dashboard.tsx via setSessionActive() whenever the
 * React Query session state changes.
 */

// Module-level singleton — intentionally not React state; the gate must be
// readable synchronously from inside submitCommand without closures or refs.
let _sessionActive = false;

export function setSessionActive(active: boolean): void {
  _sessionActive = active;
}

export function getSessionActive(): boolean {
  return _sessionActive;
}

// Commands that are always allowed, even without an active session.
// These cover motor-stop safety paths only.
const ALWAYS_ALLOWED_KEYS = new Set([
  "x", "X",
  "CMD:MOTOR_STOP",
  "CMD:EMERGENCY_STOP",
]);

/**
 * Returns true if the command may be sent.
 *
 * @param cmdKey  normalised key used in the COMMANDS map
 *                (single-char lower-case for shortcuts, or upper-cased CMD: string)
 * @param rawText the raw text as typed / routed (used as fallback match)
 */
export function isCommandAllowed(cmdKey: string, rawText: string): boolean {
  if (_sessionActive) return true;
  return ALWAYS_ALLOWED_KEYS.has(cmdKey) || ALWAYS_ALLOWED_KEYS.has(rawText);
}
