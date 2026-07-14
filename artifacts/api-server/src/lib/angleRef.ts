/**
 * angleRef.ts — In-memory angle reference (zero-point) for tilt display.
 *
 * When the user hits "Reset Angles", the current tiltX/tiltY is captured as
 * the reference. All outgoing values (WebSocket broadcasts, REST responses)
 * subtract this reference so the dashboard shows deviation from that baseline
 * rather than absolute IMU angles.
 *
 * The reference is runtime-only (resets to 0,0 on server restart). Raw values
 * are always stored to the database unchanged — this is a display transform only.
 */

let _refX = 0;
let _refY = 0;

export function setAngleRef(x: number, y: number): void {
  _refX = x;
  _refY = y;
}

export function getAngleRef(): { refX: number; refY: number } {
  return { refX: _refX, refY: _refY };
}

/** Apply the current reference offset to a raw tilt reading. */
export function applyAngleRef(
  tiltX: number,
  tiltY: number,
): { tiltX: number; tiltY: number } {
  return { tiltX: tiltX - _refX, tiltY: tiltY - _refY };
}
