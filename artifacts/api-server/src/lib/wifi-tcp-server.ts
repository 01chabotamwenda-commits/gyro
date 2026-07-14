/**
 * wifi-tcp-server.ts
 *
 * Raw TCP server that the ESP32 connects to when running in Wi-Fi mode.
 * Listens on TCP_PORT (default 5001, configurable via WIFI_TCP_PORT env var).
 *
 * Protocol (same newline-delimited text the serial bridge parses):
 *   DEVICE_INFO:<id>|VERSION:<v>|COMPONENTS:<c1,c2>|BAUD:<b>
 *   HEALTH:<KEY>=<STATUS>[;<KEY>=<STATUS>...]
 *   {"rpm":...,"tiltX":...,...}   ← telemetry JSON
 *   STATUS:MOTOR=ON / OFF / ESTOP
 *
 * Commands are sent back over the same socket as newline-terminated strings
 * e.g.  CMD:MOTOR_START\n
 */

import * as net from "net";
import { logger } from "./logger";
import {
  setHardwareConnected,
  setDeviceInfo,
  componentsToCaps,
  broadcastToClients,
  broadcastHardwareConnected,
} from "./hardware-mode";
import {
  setHardwareDeviceInfo,
  clearHardwareDeviceInfo,
  setConnectivityMode,
} from "./connectivityStore";
import { memStore } from "./mem-store";
import { getSettings } from "./settingsStore";
import { getMotorState, setMotorCommand, fireAlert } from "./motor";
import { db, readingsTable, alertsTable, sessionsTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";

export const WIFI_TCP_PORT = Number(process.env["WIFI_TCP_PORT"] ?? 5001);

// The ESP32 streams a telemetry reading roughly once a second. If we see no
// data at all for this long, treat the link as dead and free the slot up —
// see the setTimeout() usage below for why this matters.
const WIFI_IDLE_TIMEOUT_MS = 15_000;

// How long to wait after a TCP disconnect before treating a running session
// as truly lost. WiFi/serial jitter can drop the link for a few seconds
// without the ESP32 itself having a problem — don't nuke the session for that.
const DISCONNECT_GRACE_MS = 8_000;

let _activeSocket: net.Socket | null = null;
let _tcpServer: net.Server | null = null;
// True from the moment disconnectWifi() is called until the socket's "close"
// handler finishes. Used by the ingest route to stay in the WiFi branch and
// avoid a second teardown through the USB-serial path during that window.
let _pendingWifiDisconnect = false;

// ── Pending connection gate ───────────────────────────────────────────────────
// When an ESP32 connects for the first time (i.e. not a grace-window reconnect),
// the socket is held here until the user clicks Accept in the dashboard.
// If no action is taken within PENDING_ACCEPT_TIMEOUT_MS the socket is dropped.
let _pendingSocket: net.Socket | null = null;
let _pendingIp: string | null = null;
let _pendingTimer: ReturnType<typeof setTimeout> | null = null;
const PENDING_ACCEPT_TIMEOUT_MS = 60_000; // 60 s to accept or reject

export function getPendingConnection(): { ip: string } | null {
  if (_pendingSocket && !_pendingSocket.destroyed && _pendingIp) {
    return { ip: _pendingIp };
  }
  return null;
}

export function acceptPendingWifi(): boolean {
  if (!_pendingSocket || _pendingSocket.destroyed || !_pendingIp) return false;
  if (_pendingTimer) { clearTimeout(_pendingTimer); _pendingTimer = null; }
  const socket = _pendingSocket;
  const ip = _pendingIp;
  _pendingSocket = null;
  _pendingIp = null;
  activateSocket(socket, ip);
  return true;
}

export function rejectPendingWifi(): boolean {
  if (!_pendingSocket || _pendingSocket.destroyed) return false;
  if (_pendingTimer) { clearTimeout(_pendingTimer); _pendingTimer = null; }
  const ip = _pendingIp;
  _pendingSocket.destroy();
  _pendingSocket = null;
  _pendingIp = null;
  logger.info({ ip }, "WiFi: pending connection rejected by user");
  return true;
}

// Set while we're waiting out DISCONNECT_GRACE_MS after a drop, before
// deciding the hardware is really gone and closing the running session.
let _graceTimer: ReturnType<typeof setTimeout> | null = null;

/** True while we're in the post-disconnect grace window awaiting a reconnect. */
export function isHardwareGrace(): boolean {
  return _graceTimer !== null;
}

/** Send a command string to the currently connected ESP32 (Wi-Fi). */
export function sendWifiCommand(cmd: string): boolean {
  if (!_activeSocket || _activeSocket.destroyed) return false;
  try {
    _activeSocket.write(cmd + "\n");
    logger.info({ cmd }, "WiFi: sent command to ESP32");
    return true;
  } catch (err) {
    logger.warn({ err, cmd }, "WiFi: failed to write command to socket");
    return false;
  }
}

export function isWifiConnected(): boolean {
  return _activeSocket !== null && !_activeSocket.destroyed;
}

/**
 * True while a WiFi connection is active OR while a disconnect is in flight
 * (i.e. socket.destroy() called but the "close" handler hasn't finished yet).
 * Use this instead of isWifiConnected() in the ingest disconnect route so that
 * a second POST /api/serial/disconnect during the brief teardown window doesn't
 * fall through into the USB-serial cleanup path and fire duplicate broadcasts.
 */
export function isWifiMode(): boolean {
  return _pendingWifiDisconnect || (_activeSocket !== null && !_activeSocket.destroyed);
}

/**
 * Force-close the active WiFi TCP connection from outside this module.
 * The socket's own "close" handler fires and handles all state cleanup
 * (hardware_disconnected broadcast, session teardown, alerts, etc.).
 * Returns true if a socket was actually destroyed, false if nothing was connected.
 */
export function disconnectWifi(): boolean {
  if (!_activeSocket || _activeSocket.destroyed) return false;
  _pendingWifiDisconnect = true;
  _activeSocket.destroy();
  return true;
}

// ── helpers (mirror of the ingest route logic) ────────────────────────────────

async function getLatestSession() {
  if (!db) return memStore.sessions.getLatest();
  try {
    const rows = await db.select().from(sessionsTable).orderBy(desc(sessionsTable.id)).limit(1);
    return rows[0] ?? null;
  } catch {
    return memStore.sessions.getLatest();
  }
}

async function closeRunningSession(sessionId: number | null): Promise<void> {
  try {
    const session = await getLatestSession();
    if (!session || session.status !== "running") return;
    const now = new Date();
    if (db) {
      try {
        await db.update(sessionsTable).set({ status: "completed", stoppedAt: now }).where(eq(sessionsTable.id, session.id));
      } catch {
        memStore.sessions.update(session.id, { status: "completed", stoppedAt: now });
      }
    } else {
      memStore.sessions.update(session.id, { status: "completed", stoppedAt: now });
    }
    setMotorCommand("off");
    const elapsed = session.startedAt
      ? Math.floor((now.getTime() - new Date(session.startedAt).getTime()) / 1000)
      : null;
    const elapsedStr = elapsed
      ? `${Math.floor(elapsed / 3600)}h ${Math.floor((elapsed % 3600) / 60)}m ${elapsed % 60}s`
      : "unknown";
    broadcastToClients({
      type: "session_update",
      data: { id: String(session.id), status: "completed", stoppedAt: now.toISOString(), motorState: "emergency_stopped" },
    });
    await fireAlert(sessionId ?? session.id, "critical",
      `[SAFETY] Session #${session.id} auto-closed — ESP32 WiFi disconnected (elapsed ${elapsedStr})`
    ).catch(() => {});
  } catch (err) {
    logger.error({ err }, "WiFi: failed to close session on disconnect");
  }
}

async function ingestReading(data: Record<string, unknown>): Promise<void> {
  const tiltX      = (data["tiltX"]      as number) ?? 0;
  const tiltY      = (data["tiltY"]      as number) ?? 0;
  const rotationZ  = (data["rotationZ"]  as number) ?? 0;
  const rpm        = (data["rpm"]        as number) ?? 0;
  const temperature = (data["temperature"] as number) ?? (data["temp"] as number) ?? 25;
  const motorPwm   = (data["motorPwm"]   as number) ?? (data["pwm"]  as number) ?? 0;
  // Firmware sends the real IMU-derived vibration as "vibrationRMS"; accept
  // "vibration" too in case an older/alt firmware build uses that key.
  const vibration      = (data["vibrationRMS"]   as number) ?? (data["vibration"] as number) ?? 0;
  // Simple-moving-average-smoothed tilt angle (pre reference-subtraction) —
  // what the tilt chart should plot, distinct from tiltX/Y which are
  // post-reference error.
  const filteredAngleX = (data["filteredAngleX"] as number) ?? tiltX;
  const filteredAngleY = (data["filteredAngleY"] as number) ?? tiltY;
  // Actual ESC pulse width in µs (firmware sends this as "escPulse").
  const motorPulseUs   = (data["escPulse"] as number) ?? (data["motorPulseUs"] as number) ?? 0;
  const vibrationFreq  = (data["vibrationFreq"]  as number) ?? 0;
  const sessionId      = (data["sessionId"]      as number | null) ?? null;
  const irCommand  = typeof data["irCommand"] === "string" ? data["irCommand"] : null;

  const now = new Date();
  const settings = getSettings();

  if (getMotorState() !== "emergency_stopped") {
    const tiltMag = Math.sqrt(tiltX * tiltX + tiltY * tiltY);
    const vibVal  = vibration > 0 ? vibration : (rpm / 14000) * 8.5;

    // [DEV MODE] Max-tilt emergency stop disabled — tilt angle does not trigger
    // motor stop during development. Re-enable by uncommenting the block below.
    // if (tiltMag > settings.maxTiltAngle) {
    //   setMotorCommand("emergency_stop");
    //   sendWifiCommand("CMD:EMERGENCY_STOP");
    //   void fireAlert(sessionId, "critical",
    //     `[SAFETY] Tilt ${tiltMag.toFixed(2)}° exceeds max ${settings.maxTiltAngle}° — emergency stop`);
    //   void closeRunningSession(sessionId);
    // } else
    if (temperature >= settings.tempCritThreshold) {
      setMotorCommand("emergency_stop");
      sendWifiCommand("CMD:EMERGENCY_STOP");
      void fireAlert(sessionId, "critical",
        `[SAFETY] Temperature ${temperature.toFixed(1)}°C >= critical ${settings.tempCritThreshold}°C`);
      void closeRunningSession(sessionId);
    } else if (vibVal >= settings.vibCritThreshold) {
      setMotorCommand("emergency_stop");
      sendWifiCommand("CMD:EMERGENCY_STOP");
      void fireAlert(sessionId, "critical",
        `[SAFETY] Vibration ${vibVal.toFixed(2)} >= critical ${settings.vibCritThreshold}`);
      void closeRunningSession(sessionId);
    } else if (temperature >= settings.tempWarnThreshold) {
      void fireAlert(sessionId, "warning",
        `[SAFETY] Temperature ${temperature.toFixed(1)}°C >= warning ${settings.tempWarnThreshold}°C`);
    } else if (vibVal >= settings.vibWarnThreshold) {
      void fireAlert(sessionId, "warning",
        `[SAFETY] Vibration ${vibVal.toFixed(2)} >= warning ${settings.vibWarnThreshold}`);
    }
  }

  const vibVal = vibration > 0 ? vibration : (rpm / 14000) * 8.5;
  let readingId: number;

  if (db) {
    try {
      const [row] = await Promise.race([
        db.insert(readingsTable)
          .values({ sessionId, tiltX, tiltY, rotationZ, rpm, temperature, motorPwm, vibration: vibVal, filteredAngleX, filteredAngleY, motorPulseUs })
          .returning(),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error("DB timeout")), 2000)),
      ]);
      readingId = row.id;
    } catch {
      const row = memStore.readings.insert({ sessionId, tiltX, tiltY, rotationZ, rpm, temperature, motorPwm, vibration: vibVal, filteredAngleX, filteredAngleY, motorPulseUs });
      readingId = row.id;
    }
  } else {
    const row = memStore.readings.insert({ sessionId, tiltX, tiltY, rotationZ, rpm, temperature, motorPwm, vibration: vibVal, filteredAngleX, filteredAngleY, motorPulseUs });
    readingId = row.id;
  }

  broadcastToClients({
    type: "reading",
    data: { id: readingId, timestamp: now.toISOString(), tiltX, tiltY, rotationZ, rpm, temperature, motorPwm, vibration: vibVal, vibrationFreq, filteredAngleX, filteredAngleY, motorPulseUs },
  });

  // Forward irCommand field from the telemetry JSON to the IR command feed
  // and to the System Events alert log.
  // Normalize to lowercase before the sentinel guard so "NONE"/"None" are also suppressed.
  if (irCommand && irCommand.trim().toLowerCase() !== "none") {
    const irLine = `CMD:IR_${irCommand.trim().toUpperCase()}`;
    broadcastToClients({
      type: "ir_command",
      data: { line: irLine, timestamp: now.toISOString() },
    });
    broadcastToClients({
      type: "alert",
      data: {
        id: Date.now(),
        timestamp: now.toISOString(),
        level: "info",
        message: `[IR] ${irCommand.toUpperCase()}`,
      },
    });
  }
}

// ── Line parser ───────────────────────────────────────────────────────────────

function parseLine(line: string, clientIp: string): void {
  line = line.trim();
  if (!line) return;

  // JSON telemetry
  if (line.startsWith("{")) {
    try {
      const data = JSON.parse(line) as Record<string, unknown>;
      // Boot status message — not a reading
      if (data["status"] === "boot") {
        logger.info({ msg: data["msg"] }, "WiFi: ESP32 boot");
        return;
      }
      void ingestReading(data);
    } catch {
      logger.warn({ line }, "WiFi: failed to parse JSON line");
    }
    return;
  }

  // Device info handshake
  if (line.startsWith("DEVICE_INFO:")) {
    const parts: Record<string, string> = {};
    line.replace("DEVICE_INFO:", "").split("|").forEach(seg => {
      const [k, ...rest] = seg.split(":");
      if (k) parts[k.trim()] = rest.join(":").trim();
    });
    const deviceId = parts["DEVICE_INFO"] ?? parts[""] ?? "esp32WiFi";
    const version  = parts["VERSION"]  ?? "unknown";
    const baud     = Number(parts["BAUD"] ?? 0);
    const components = (parts["COMPONENTS"] ?? "MPU6050").split(",").map(s => s.trim()).filter(Boolean);
    const capabilities = componentsToCaps(components);

    setDeviceInfo({ deviceId, version, baud, components, capabilities, health: {} });
    setHardwareDeviceInfo({ ip: clientIp, firmwareVersion: version });
    broadcastHardwareConnected();

    broadcastToClients({
      type: "alert",
      data: {
        id: Date.now(),
        timestamp: new Date().toISOString(),
        level: "info",
        message: `[WIFI] Device: ${deviceId} v${version} · Components: ${components.join(", ")} · IP: ${clientIp}`,
      },
    });
    return;
  }

  // Health line
  if (line.startsWith("HEALTH:")) {
    logger.info({ health: line }, "WiFi: health report");
    return;
  }

  // Status reply
  if (line.startsWith("STATUS:")) {
    logger.info({ status: line }, "WiFi: status from ESP32");
    const statusVal = line.replace("STATUS:", "");
    broadcastToClients({
      type: "alert",
      data: {
        id: Date.now(),
        timestamp: new Date().toISOString(),
        level: "info",
        message: `[ESP32-WiFi] ${statusVal}`,
      },
    });
    return;
  }

  // IR remote command lines (firmware echoes them over serial/WiFi)
  if (line.startsWith("CMD:IR_")) {
    broadcastToClients({
      type: "ir_command",
      data: { line, timestamp: new Date().toISOString() },
    });
    return;
  }

  logger.debug({ line }, "WiFi: unhandled line from ESP32");
}

// ── Socket activation (shared by accept path and grace-window reconnect) ──────

function activateSocket(socket: net.Socket, clientIp: string): void {
  _activeSocket = socket;

  // Detect a dead peer even when the ESP32 vanishes without a clean TCP
  // close (power loss, WiFi drop mid-session) — a plain "close" listener
  // never fires in that case, so _activeSocket would stay set forever and
  // permanently reject every future reconnect until the whole desktop app
  // is restarted. Two layers of defense:
  //  1. setKeepAlive: OS-level probes that eventually error out a socket
  //     whose peer is unreachable, but this can take minutes by default.
  //  2. setTimeout: app-level idle timeout — the ESP32 streams a JSON
  //     reading roughly once a second, so no data for WIFI_IDLE_TIMEOUT_MS
  //     means the link is dead; destroy it immediately so a reconnect can
  //     succeed right away instead of waiting on OS-level detection.
  socket.setKeepAlive(true, 5000);
  socket.setTimeout(WIFI_IDLE_TIMEOUT_MS);

  setHardwareConnected(true, `wifi:${clientIp}`);
  setConnectivityMode("wifi_sta");
  setHardwareDeviceInfo({ ip: clientIp, port: `wifi:${clientIp}` });

  broadcastHardwareConnected();
  broadcastToClients({
    type: "alert",
    data: {
      id: Date.now(),
      timestamp: new Date().toISOString(),
      level: "info",
      message: `[WIFI] ESP32 connected wirelessly from ${clientIp}`,
    },
  });

  if (db) {
    db.insert(alertsTable)
      .values({ sessionId: null, level: "info", message: `[WIFI] ESP32 connected from ${clientIp}` })
      .catch(() => {});
  } else {
    memStore.alerts.insert({ sessionId: null, level: "info", message: `[WIFI] ESP32 connected from ${clientIp}` });
  }

  // Line buffer
  let buf = "";
  socket.setEncoding("utf8");

  socket.on("data", (chunk: string) => {
    buf += chunk;
    const lines = buf.split("\n");
    buf = lines.pop() ?? "";
    lines.forEach(line => parseLine(line, clientIp));
  });

  socket.on("close", () => {
    logger.info({ ip: clientIp }, "WiFi: ESP32 disconnected");
    _activeSocket = null;
    _pendingWifiDisconnect = false;
    setHardwareConnected(false);
    clearHardwareDeviceInfo();

    void (async () => {
      const session = await getLatestSession();
      const sessionRunning = session?.status === "running" || session?.status === "warning";

      if (!sessionRunning) {
        // Nothing at stake — tear down immediately as before.
        broadcastToClients({ type: "hardware_disconnected", data: { timestamp: new Date().toISOString() } });
        broadcastToClients({
          type: "alert",
          data: { id: Date.now(), timestamp: new Date().toISOString(), level: "warning", message: `[WIFI] ESP32 (${clientIp}) disconnected` },
        });
        if (db) {
          db.insert(alertsTable).values({ sessionId: null, level: "warning", message: `[WIFI] ESP32 disconnected (${clientIp})` }).catch(() => {});
        } else {
          memStore.alerts.insert({ sessionId: null, level: "warning", message: `[WIFI] ESP32 disconnected (${clientIp})` });
        }
        return;
      }

      // A session is running — hold off on the harsh teardown for a grace
      // window in case this is a momentary WiFi/serial drop, not a real
      // disconnect. Surface a soft "reconnecting" signal instead.
      logger.warn({ ip: clientIp }, `WiFi: link dropped mid-session — waiting ${DISCONNECT_GRACE_MS}ms for reconnect before closing session #${session!.id}`);
      broadcastToClients({
        type: "hardware_grace",
        data: { timestamp: new Date().toISOString(), graceMs: DISCONNECT_GRACE_MS },
      });
      broadcastToClients({
        type: "alert",
        data: {
          id: Date.now(),
          timestamp: new Date().toISOString(),
          level: "info",
          message: `[WIFI] ESP32 (${clientIp}) link dropped — waiting ${Math.round(DISCONNECT_GRACE_MS / 1000)}s for reconnect`,
        },
      });

      _graceTimer = setTimeout(() => {
        _graceTimer = null;
        logger.warn({ ip: clientIp }, "WiFi: grace window elapsed with no reconnect — closing session");
        void closeRunningSession(null);

        broadcastToClients({ type: "hardware_disconnected", data: { timestamp: new Date().toISOString() } });
        broadcastToClients({
          type: "alert",
          data: { id: Date.now(), timestamp: new Date().toISOString(), level: "warning", message: `[WIFI] ESP32 (${clientIp}) disconnected` },
        });
        if (db) {
          db.insert(alertsTable).values({ sessionId: null, level: "warning", message: `[WIFI] ESP32 disconnected (${clientIp})` }).catch(() => {});
        } else {
          memStore.alerts.insert({ sessionId: null, level: "warning", message: `[WIFI] ESP32 disconnected (${clientIp})` });
        }
      }, DISCONNECT_GRACE_MS);
    })();
  });

  socket.on("error", (err) => {
    logger.error({ err, ip: clientIp }, "WiFi: socket error");
  });

  socket.on("timeout", () => {
    logger.warn({ ip: clientIp }, `WiFi: no data for ${WIFI_IDLE_TIMEOUT_MS}ms — treating link as dead, freeing slot`);
    socket.destroy();
  });
}

// ── TCP server ────────────────────────────────────────────────────────────────

export function initWifiTcpServer(): void {
  _tcpServer = net.createServer((socket) => {
    const clientIp = socket.remoteAddress ?? "unknown";
    logger.info({ ip: clientIp }, "WiFi: ESP32 connected via TCP");

    // Only one hardware device at a time (active or pending)
    if (_activeSocket && !_activeSocket.destroyed) {
      logger.warn({ ip: clientIp }, "WiFi: second connection rejected — already have an active device");
      socket.write("ERROR:ALREADY_CONNECTED\n");
      socket.destroy();
      return;
    }

    // If a reconnect lands while we're still inside the grace window from a
    // prior drop, cancel the pending "close the session" timer — the link is
    // back, nothing to tear down. Auto-accept: no user confirmation needed for
    // a reconnect since the user already approved this device.
    if (_graceTimer) {
      clearTimeout(_graceTimer);
      _graceTimer = null;
      logger.info({ ip: clientIp }, "WiFi: ESP32 reconnected within grace window — session left running");
      broadcastToClients({
        type: "hardware_reconnected",
        data: { timestamp: new Date().toISOString() },
      });
      broadcastToClients({
        type: "alert",
        data: {
          id: Date.now(),
          timestamp: new Date().toISOString(),
          level: "info",
          message: `[WIFI] ESP32 reconnected from ${clientIp} — session resumed`,
        },
      });
      activateSocket(socket, clientIp);
      return;
    }

    // Fresh (first-time) connection — hold in pending state until user accepts.
    // Reject any concurrent pending connection first.
    if (_pendingSocket && !_pendingSocket.destroyed) {
      _pendingSocket.destroy();
      if (_pendingTimer) { clearTimeout(_pendingTimer); _pendingTimer = null; }
    }
    _pendingSocket = socket;
    _pendingIp = clientIp;

    // Broadcast so the dashboard banner can show the Accept / Reject prompt.
    broadcastToClients({
      type: "wifi_pending",
      data: { ip: clientIp, timestamp: new Date().toISOString() },
    });
    logger.info({ ip: clientIp }, "WiFi: ESP32 connection pending user acceptance");

    // Auto-reject after timeout so a stale socket doesn't block future connects.
    _pendingTimer = setTimeout(() => {
      if (_pendingSocket === socket) {
        logger.warn({ ip: clientIp }, `WiFi: pending connection timed out after ${PENDING_ACCEPT_TIMEOUT_MS / 1000}s — auto-rejected`);
        rejectPendingWifi();
      }
    }, PENDING_ACCEPT_TIMEOUT_MS);

    // If the ESP32 disconnects while pending (e.g. it reboots), clean up.
    socket.once("close", () => {
      if (_pendingSocket === socket) {
        if (_pendingTimer) { clearTimeout(_pendingTimer); _pendingTimer = null; }
        _pendingSocket = null;
        _pendingIp = null;
        broadcastToClients({ type: "wifi_pending_gone", data: { ip: clientIp } });
      }
    });
    socket.once("error", () => { /* close fires after error */ });
  });

  _tcpServer.listen(WIFI_TCP_PORT, "0.0.0.0", () => {
    logger.info({ port: WIFI_TCP_PORT }, `WiFi TCP server listening — ESP32 should connect to SERVER_IP:${WIFI_TCP_PORT}`);
  });

  _tcpServer.on("error", (err) => {
    logger.error({ err }, "WiFi TCP server error");
  });
}
