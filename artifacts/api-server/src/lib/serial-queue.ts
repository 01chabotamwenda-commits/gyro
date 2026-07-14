/**
 * serial-queue.ts
 *
 * Shared in-process queue for serial writes that must be forwarded to the
 * physical ESP32 via the Electron serial bridge.
 *
 * Usage:
 *   import { queueSerialWrite } from "../lib/serial-queue";
 *   queueSerialWrite("CMD:MOTOR_START");
 *
 * The Electron bridge polls GET /api/serial/pending-write, which drains the
 * queue via drainSerialQueue().  The web terminal also feeds directly into
 * this queue via POST /api/serial/write.
 *
 * Command vocabulary understood by the ESP32 firmware:
 *   CMD:MOTOR_START      start motor (ramp up)
 *   CMD:MOTOR_STOP       graceful stop
 *   CMD:EMERGENCY_STOP   immediate halt (no ramp)
 *   CMD:SPEED_UP         throttle + MOTOR_SPEED_STEP
 *   CMD:SPEED_DOWN       throttle - MOTOR_SPEED_STEP
 *   CMD:RESET_REF        reset IMU reference angles
 */

const _queue: string[] = [];

/**
 * Add a line to the outbound serial queue.
 * Only adds when a non-empty string is provided.
 */
export function queueSerialWrite(text: string): void {
  const trimmed = text.trim();
  if (trimmed) _queue.push(trimmed);
}

/**
 * Drain and return all pending writes (empties the queue).
 * Called exclusively by GET /api/serial/pending-write.
 */
export function drainSerialQueue(): string[] {
  return _queue.splice(0);
}

/**
 * Peek at queue length without draining (for logging).
 */
export function serialQueueLength(): number {
  return _queue.length;
}
