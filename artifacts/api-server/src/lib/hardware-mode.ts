/**
 * hardware-mode.ts
 *
 * Tracks whether a real ESP32 is connected via USB serial.
 * When connected all broadcasts come through `broadcastToClients()`
 * from the ingest route.
 *
 * Capability mapping is honest about what each component can provide:
 *   MPU6050 → imu (tilt X/Y, rotation Z) + vibration (derived from accelerometer)
 *   DS18B20 / NTC / TEMP → temperature
 *   ESC / MOTOR / PWM   → motor + rpm
 *   SD / SD_CARD        → sdcard
 */

import { WebSocketServer, WebSocket } from "ws";
import { logger } from "./logger";
import { memStore } from "./mem-store";

let _wss: WebSocketServer | null = null;
let _connected = false;
let _port = "";
let _lastReadingAt: Date | null = null;
let _connectedAt: Date | null = null;

export interface Capabilities {
  imu: boolean;
  motor: boolean;
  temperature: boolean;
  vibration: boolean;
  sdcard: boolean;
}

export interface DeviceInfo {
  deviceId: string;
  version: string;
  baud: number;
  port: string;
  components: string[];
  capabilities: Capabilities;
  health: Record<string, "OK" | "FAIL" | "UNKNOWN">;
  connectedAt: string;
}

let _deviceInfo: DeviceInfo | null = null;

const DEFAULT_CAPS: Capabilities = {
  imu: false, motor: false, temperature: false, vibration: false, sdcard: false,
};

/**
 * Map raw component names from firmware to capability flags.
 *
 * Each capability requires SPECIFIC hardware — the MPU6050 alone cannot provide
 * temperature readings or RPM; those need dedicated sensors:
 *
 *   imu        — MPU6050, MPU9250, ICM-42688, any IMU/GYRO chip
 *   vibration  — MPU6050 accelerometer (derived), any ACCEL or PIEZO sensor
 *   temperature — DS18B20, NTC thermistor, BME280, any explicit TEMP sensor
 *   motor/rpm  — ESC with feedback, hall-effect sensor, encoder, or tachometer
 *   sdcard     — SD card module on SPI
 */
export function componentsToCaps(components: string[]): Capabilities {
  const upper = components.map((c) => c.toUpperCase());
  return {
    imu: upper.some(
      (n) => n.includes("MPU") || n.includes("IMU") || n.includes("GYRO") || n.includes("ICM") || n.includes("LSM")
    ),
    // Vibration can be derived from MPU6050 accelerometer data — no separate sensor needed
    vibration: upper.some(
      (n) =>
        n.includes("MPU") ||
        n.includes("IMU") ||
        n.includes("ACCEL") ||
        n.includes("ICM") ||
        n.includes("LSM") ||
        n.includes("VIBR") ||
        n.includes("PIEZO")
    ),
    // Temperature needs a DEDICATED temperature sensor — MPU6050 does NOT provide this
    temperature: upper.some(
      (n) =>
        n.includes("TEMP") ||
        n.includes("DS18") ||
        n.includes("NTC") ||
        n.includes("BME") ||
        n.includes("BMP") ||
        n.includes("DHT") ||
        n.includes("LM35")
    ),
    // Motor/RPM needs an ESC, motor controller, hall-effect sensor, or encoder
    motor: upper.some(
      (n) =>
        n.includes("ESC") ||
        n.includes("MOTOR") ||
        n.includes("PWM") ||
        n.includes("HALL") ||
        n.includes("ENCODER") ||
        n.includes("TACHO") ||
        n.includes("RPM")
    ),
    sdcard: upper.some((n) => n.includes("SD")),
  };
}

export function initHardwareMode(wss: WebSocketServer): void {
  _wss = wss;
}

export function setHardwareConnected(connected: boolean, port = ""): void {
  _connected = connected;
  _port = port;
  if (connected) {
    _connectedAt = new Date();
    memStore.readings.clear();
    logger.info({ port }, "Hardware connected — stale data cleared");
  } else {
    _connectedAt = null;
    _deviceInfo = null;
  }
  logger.info({ connected, port }, "Hardware connection state changed");
}

export function setDeviceInfo(info: Omit<DeviceInfo, "port" | "connectedAt">): void {
  _deviceInfo = {
    ...info,
    port: _port,
    connectedAt: (_connectedAt ?? new Date()).toISOString(),
  };
  logger.info({ deviceId: info.deviceId, components: info.components }, "Device info registered");
}

export function isHardwareConnected(): boolean {
  return _connected;
}

export function getConnectedAt(): Date | null {
  return _connectedAt;
}

export function getHardwareStatus() {
  return {
    connected: _connected,
    port: _port,
    lastReadingAt: _lastReadingAt?.toISOString() ?? null,
    mode: _connected ? "hardware" : "waiting",
  };
}

export function getDeviceInfo(): DeviceInfo | null {
  return _deviceInfo;
}

export function getCapabilities(): Capabilities {
  return _deviceInfo?.capabilities ?? DEFAULT_CAPS;
}

export function broadcastToClients(payload: object): void {
  if (!_wss) {
    logger.debug({ wssExists: false }, "broadcastToClients: WSS not initialized");
    return;
  }
  const msg = JSON.stringify(payload);
  const msgType = (payload as { type?: string }).type ?? "unknown";
  let sentCount = 0;
  _wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(msg);
      sentCount++;
    }
  });
  logger.debug({ msgType, clientsConnected: _wss.clients.size, sentTo: sentCount }, `broadcast: sent ${msgType} to ${sentCount} client(s)`);
  if (msgType === "reading") {
    _lastReadingAt = new Date();
  }
}

/** Broadcast hardware_connected so the frontend flushes its cache and
 *  enables capability-aware panels. */
export function broadcastHardwareConnected(): void {
  broadcastToClients({
    type: "hardware_connected",
    data: {
      port: _port,
      connectedAt: _connectedAt?.toISOString() ?? new Date().toISOString(),
      deviceInfo: _deviceInfo,
    },
  });
}
