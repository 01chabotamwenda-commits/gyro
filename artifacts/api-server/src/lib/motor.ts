import { db, alertsTable } from "@workspace/db";
import { logger } from "./logger";
import { memStore } from "./mem-store";
import { WebSocketServer, WebSocket } from "ws";

export type MotorState = "on" | "off" | "emergency_stopped";

let motorState: MotorState = "off";
let _wss: WebSocketServer | null = null;

export function getMotorState(): MotorState {
  return motorState;
}

export function setMotorCommand(command: "on" | "off" | "emergency_stop"): MotorState {
  if (command === "emergency_stop") {
    motorState = "emergency_stopped";
    logger.warn("Emergency stop commanded");
  } else if (command === "on") {
    motorState = "on";
    logger.info("Motor commanded ON");
  } else {
    motorState = "off";
    logger.info("Motor commanded OFF");
  }
  return motorState;
}

export function initMotorBroadcast(wss: WebSocketServer): void {
  _wss = wss;
}

export async function fireAlert(
  sessionId: number | null,
  level: "info" | "warning" | "error" | "critical" | "emergency",
  message: string,
) {
  try {
    let alertData: { id: number | string; timestamp: string; level: string; message: string; sessionId: number | null };

    if (db) {
      try {
        const [alert] = await db
          .insert(alertsTable)
          .values({ sessionId, level, message })
          .returning();
        alertData = {
          id: alert.id,
          timestamp: alert.timestamp.toISOString(),
          level: alert.level,
          message: alert.message,
          sessionId: alert.sessionId,
        };
      } catch {
        const alert = memStore.alerts.insert({ sessionId, level, message });
        alertData = {
          id: alert.id,
          timestamp: alert.timestamp.toISOString(),
          level: alert.level,
          message: alert.message,
          sessionId: alert.sessionId,
        };
      }
    } else {
      const alert = memStore.alerts.insert({ sessionId, level, message });
      alertData = {
        id: alert.id,
        timestamp: alert.timestamp.toISOString(),
        level: alert.level,
        message: alert.message,
        sessionId: alert.sessionId,
      };
    }

    if (_wss) {
      const msg = JSON.stringify({ type: "alert", data: alertData });
      _wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) client.send(msg);
      });
    }
  } catch (err) {
    logger.error({ err }, "Failed to fire alert");
  }
}
