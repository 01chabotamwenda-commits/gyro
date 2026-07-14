import { createServer } from "http";
import { WebSocketServer } from "ws";
import app from "./app";
import { logger } from "./lib/logger";
import { initHardwareMode, isHardwareConnected, getConnectedAt, getDeviceInfo } from "./lib/hardware-mode";
import { initMotorBroadcast } from "./lib/motor";
import { initWifiTcpServer, WIFI_TCP_PORT } from "./lib/wifi-tcp-server";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error("PORT environment variable is required but was not provided.");
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const host = process.env["HOST"] ?? "0.0.0.0";

const httpServer = createServer(app);

const wss = new WebSocketServer({ server: httpServer, path: "/api/ws" });

wss.on("connection", (ws) => {
  logger.info("WebSocket client connected");
  ws.on("close", () => logger.info("WebSocket client disconnected"));
  ws.on("error", (err) => logger.error({ err }, "WebSocket error"));

  // Greet the new client with current hardware state so the dashboard
  // immediately knows hardware is connected even after a page refresh or
  // a brief server restart — without waiting for the next ingest event.
  if (isHardwareConnected()) {
    const connectedAt = getConnectedAt();
    const deviceInfo = getDeviceInfo();
    ws.send(JSON.stringify({
      type: "hardware_connected",
      data: {
        port: deviceInfo?.port ?? "",
        connectedAt: connectedAt?.toISOString() ?? new Date().toISOString(),
        deviceInfo,
      },
    }));
  }
});

httpServer.listen(port, host, () => {
  logger.info({ port, host }, "Server listening");

  // Wire up hardware-mode broadcast with the same WebSocket server
  initHardwareMode(wss);
  initMotorBroadcast(wss);

  // Start the Wi-Fi TCP server for wireless ESP32 connections
  initWifiTcpServer();
  logger.info({ tcpPort: WIFI_TCP_PORT }, "WiFi TCP server started — ESP32 can connect wirelessly");
});
