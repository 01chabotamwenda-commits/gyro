/**
 * serial-manager.js — ESP32 USB serial port manager for the Electron main process.
 *
 * Responsibilities:
 *   1. List available COM / tty ports (SerialPort.list).
 *   2. Open a port, attach a readline parser, and forward each JSON line to the
 *      API server via HTTP POST /api/readings/ingest.
 *   3. Notify the API server when the port opens / closes so it can switch between
 *      simulator mode and hardware mode.
 *   4. Parse Option 1 Hardware Handshake lines from firmware startup:
 *        DEVICE_INFO:esp32LOGIC|VERSION:1.0|COMPONENTS:MPU6050,ESC,TEMP_SENSOR|BAUD:115200
 *        HEALTH:MPU6050=OK|ESC=OK|TEMP_SENSOR=FAIL
 *      Posts parsed capabilities to /api/serial/device-info so the server can
 *      show/hide dashboard panels and display health status badges.
 *   5. Poll GET /api/serial/pending-write so the web terminal can queue commands
 *      that are forwarded here and written to the physical ESP32 serial port.
 *
 * Expected JSON format from the ESP32 firmware (one object per newline, 4 Hz):
 *   {"rpm":1500.5,"tiltX":2.3,"tiltY":-1.1,"rotationZ":150.2,"temp":45.2,"pwm":75,"vibration":2.5}
 *
 * Field aliases understood (firmware flexibility):
 *   rpm        → rpm
 *   tiltX / tilt_x → tiltX
 *   tiltY / tilt_y → tiltY
 *   rotationZ / rotation_z → rotationZ
 *   temp / temperature → temperature
 *   pwm / motorPwm / motor_pwm → motorPwm
 *   vibration / vibr → vibration
 */

"use strict";

const { SerialPort } = require("serialport");
const { ReadlineParser } = require("@serialport/parser-readline");

let _openPort = null;
let _apiBase = "http://127.0.0.1:5000";

// Accumulate DEVICE_INFO and HEALTH lines before posting device info.
// Both lines can arrive within the first 2 seconds of connection.
let _pendingDeviceInfo = null;
let _pendingHealth = null;
let _deviceInfoTimer = null;

// Polling interval for pending serial writes (web terminal → ESP32)
let _pollInterval = null;
const POLL_INTERVAL_MS = 400;

// Liveness tracking: detect server restarts while the port is already open
let _serverWasReachable = false;
let _lastConnectedPort = null;
let _lastDeviceInfo = null;

// ─── Configuration ────────────────────────────────────────────────────────────

function setApiBase(base) {
  _apiBase = base;
}

// ─── Port listing ─────────────────────────────────────────────────────────────

async function listPorts() {
  const ports = await SerialPort.list();
  return ports.map((p) => ({
    path: p.path,
    manufacturer: p.manufacturer || null,
    serialNumber: p.serialNumber || null,
    vendorId: p.vendorId || null,
    productId: p.productId || null,
    pnpId: p.pnpId || null,
  }));
}

// ─── Normalise a raw sensor object from the ESP32 ────────────────────────────

function normalise(raw) {
  return {
    rpm:         Number(raw.rpm ?? 0),
    tiltX:       Number(raw.tiltX ?? raw.tilt_x ?? 0),
    tiltY:       Number(raw.tiltY ?? raw.tilt_y ?? 0),
    rotationZ:   Number(raw.rotationZ ?? raw.rotation_z ?? 0),
    temperature: Number(raw.temperature ?? raw.temp ?? 25),
    motorPwm:    Number(raw.motorPwm ?? raw.motor_pwm ?? raw.pwm ?? 0),
    vibration:   Number(raw.vibration ?? raw.vibr ?? 0),
    vibrationFreq: Number(raw.vibrationFreq ?? raw.vibration_freq ?? 0),
  };
}

// ─── Hardware Handshake parsers ───────────────────────────────────────────────

/**
 * Parse a DEVICE_INFO line from ESP32 firmware startup.
 *
 * Format:
 *   DEVICE_INFO:esp32LOGIC|VERSION:1.0|COMPONENTS:MPU6050,ESC,TEMP_SENSOR|BAUD:115200
 *
 * Returns: { deviceId, version, baud, components } or null if unparseable.
 */
function parseDeviceInfoLine(line) {
  try {
    const parts = line.split("|");
    const result = { deviceId: "ESP32", version: "1.0", baud: 115200, components: [] };
    for (const part of parts) {
      if (part.startsWith("DEVICE_INFO:")) {
        result.deviceId = part.slice("DEVICE_INFO:".length).trim();
      } else if (part.startsWith("VERSION:")) {
        result.version = part.slice("VERSION:".length).trim();
      } else if (part.startsWith("COMPONENTS:")) {
        result.components = part.slice("COMPONENTS:".length)
          .split(",")
          .map((c) => c.trim())
          .filter(Boolean);
      } else if (part.startsWith("BAUD:")) {
        result.baud = parseInt(part.slice("BAUD:".length), 10) || 115200;
      }
    }
    return result;
  } catch {
    return null;
  }
}

/**
 * Parse a HEALTH line from ESP32 firmware startup.
 *
 * Format:
 *   HEALTH:MPU6050=OK|ESC=OK|TEMP_SENSOR=FAIL|SD_CARD=FAIL
 *
 * Returns: Record<string, "OK"|"FAIL"|"UNKNOWN"> or null if unparseable.
 */
function parseHealthLine(line) {
  try {
    const payload = line.startsWith("HEALTH:") ? line.slice("HEALTH:".length) : line;
    const health = {};
    for (const part of payload.split("|")) {
      const eqIdx = part.indexOf("=");
      if (eqIdx < 0) continue;
      const component = part.slice(0, eqIdx).trim();
      const status = part.slice(eqIdx + 1).trim().toUpperCase();
      if (component) {
        health[component] = status === "OK" ? "OK" : status === "FAIL" ? "FAIL" : "UNKNOWN";
      }
    }
    return health;
  } catch {
    return null;
  }
}

/**
 * Debounce-post device info. We wait up to 500 ms after the first handshake
 * line so both DEVICE_INFO and HEALTH can arrive before we POST.
 */
function scheduleDeviceInfoPost() {
  if (_deviceInfoTimer) clearTimeout(_deviceInfoTimer);
  _deviceInfoTimer = setTimeout(() => {
    if (!_pendingDeviceInfo) return;
    const body = {
      ...(_pendingDeviceInfo),
      health: _pendingHealth ?? {},
    };
    // Cache for re-announce after server restart
    _lastDeviceInfo = body;
    postJson(`${_apiBase}/api/serial/device-info`, body).then((result) => {
      if (result?.capabilities) {
        const caps = result.capabilities;
        const capStr = Object.entries(caps)
          .filter(([, v]) => v)
          .map(([k]) => k)
          .join(", ");
        console.log(`[serial] Capabilities confirmed: ${capStr || "none"}`);
      }
    });
    _pendingDeviceInfo = null;
    _pendingHealth = null;
    _deviceInfoTimer = null;
  }, 500);
}

// ─── HTTP helpers (Node 18+ / Electron 20+ built-in fetch) ───────────────────

/**
 * POST JSON to the API server with a generous timeout.
 * Timeout is 10 s — the ingest route may take up to 2 s when falling back
 * from a slow/dead DB connection to the in-memory store.
 */
async function postJson(url, body) {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) {
      console.warn(`[serial] POST ${url} → HTTP ${res.status}`);
      return null;
    }
    return await res.json();
  } catch (err) {
    console.warn(`[serial] POST ${url} failed: ${err.message}`);
    return null;
  }
}

/**
 * Post a sensor reading with one retry on failure.
 * Drops the reading after 2 attempts so a slow server never backs up the queue.
 */
async function postReading(reading) {
  const url = `${_apiBase}/api/readings/ingest`;
  const result = await postJson(url, reading);
  if (result) return result;

  // One retry after 500 ms
  await new Promise((r) => setTimeout(r, 500));
  const retry = await postJson(url, reading);
  if (!retry) {
    console.warn(`[serial] Dropping reading after retry — API server not responding on ${_apiBase}`);
  }
  return retry;
}

async function getJson(url) {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(2000),
    });
    return await res.json();
  } catch {
    return null;
  }
}

// ─── Pending-write polling (web terminal → ESP32) ─────────────────────────────

/**
 * Start polling GET /api/serial/pending-write.
 * Any queued strings (written by POST /api/serial/write from the web terminal)
 * are forwarded directly to the open serial port.
 * Only runs while a port is open.
 */
function startWritePoller() {
  if (_pollInterval) return;
  _pollInterval = setInterval(async () => {
    if (!_openPort || !_openPort.isOpen) return;

    // ── Liveness / re-announce check ──────────────────────────────────────
    // Poll the server's serial status. If the server was previously unreachable
    // (or has just restarted) and comes back reporting no hardware connection,
    // re-post /api/serial/connect so the dashboard recovers automatically.
    const status = await getJson(`${_apiBase}/api/serial/status`);
    const serverReachable = status !== null;

    if (serverReachable && !status.connected && _lastConnectedPort) {
      // Server is up but doesn't know about the open port — re-announce.
      console.log(`[serial] Server lost hardware state — re-announcing ${_lastConnectedPort}`);
      await postJson(`${_apiBase}/api/serial/connect`, { port: _lastConnectedPort });
      if (_lastDeviceInfo) {
        await postJson(`${_apiBase}/api/serial/device-info`, _lastDeviceInfo);
      }
    }

    _serverWasReachable = serverReachable;

    // ── Drain pending writes ───────────────────────────────────────────────
    const data = await getJson(`${_apiBase}/api/serial/pending-write`);
    if (!data || !Array.isArray(data.writes) || data.writes.length === 0) return;
    console.log(`[serial] poller: got ${data.writes.length} pending write(s)`);
    for (const text of data.writes) {
      try {
        const line = typeof text === "string"
          ? (text.endsWith("\n") ? text : text + "\n")
          : "";
        if (!line.trim()) continue;
        console.log(`[serial] poller: forwarding: "${line.trim()}"`);
        _openPort.write(line, (err) => {
          if (err) console.warn(`[serial] pending-write error: ${err.message}`);
          else      console.log(`[serial] pending-write forwarded: ${line.trim()}`);
        });
      } catch (err) {
        console.warn(`[serial] pending-write forward failed: ${err.message}`);
      }
    }
  }, POLL_INTERVAL_MS);
}

function stopWritePoller() {
  if (_pollInterval) {
    clearInterval(_pollInterval);
    _pollInterval = null;
  }
}

// ─── Connect ─────────────────────────────────────────────────────────────────

/**
 * Open a serial port and start forwarding readings to the API.
 *
 * @param {string} portPath  e.g. "COM3" or "/dev/ttyUSB0"
 * @param {number} baudRate  default 115200
 * @param {{ onData?, onError?, onClose? }} callbacks
 * @returns {Promise<{ path: string, baudRate: number }>}
 */
function connect(portPath, baudRate = 115200, callbacks = {}) {
  return new Promise((resolve, reject) => {
    // Close any previously open port
    if (_openPort && _openPort.isOpen) {
      try { _openPort.close(); } catch { /* ignore */ }
    }

    // Reset handshake state
    _pendingDeviceInfo = null;
    _pendingHealth = null;
    if (_deviceInfoTimer) { clearTimeout(_deviceInfoTimer); _deviceInfoTimer = null; }

    const port = new SerialPort({ path: portPath, baudRate }, (err) => {
      if (err) return reject(err);
    });

    const parser = port.pipe(new ReadlineParser({ delimiter: "\n" }));

    port.on("open", () => {
      _openPort = port;
      _lastConnectedPort = portPath;
      _serverWasReachable = true;
      console.log(`[serial] Port open: ${portPath} @ ${baudRate} baud`);
      postJson(`${_apiBase}/api/serial/connect`, { port: portPath });
      startWritePoller();
      resolve({ path: portPath, baudRate });
    });

    port.on("error", (err) => {
      console.error(`[serial] Error on ${portPath}:`, err.message);
      if (callbacks.onError) callbacks.onError(err.message);
      reject(err);
    });

    port.on("close", () => {
      console.log(`[serial] Port closed: ${portPath}`);
      _openPort = null;
      _lastConnectedPort = null;
      _lastDeviceInfo = null;
      stopWritePoller();
      postJson(`${_apiBase}/api/serial/disconnect`, {});
      if (callbacks.onClose) callbacks.onClose();
    });

    parser.on("data", (line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("//")) return;

      // ── Option 1 Hardware Handshake lines ────────────────────────────────
      if (trimmed.startsWith("DEVICE_INFO:")) {
        const info = parseDeviceInfoLine(trimmed);
        if (info) {
          console.log(`[serial] DEVICE_INFO: ${info.deviceId} v${info.version} — components: ${info.components.join(", ")}`);
          _pendingDeviceInfo = info;
          scheduleDeviceInfoPost();
        }
        return;
      }

      if (trimmed.startsWith("HEALTH:")) {
        const health = parseHealthLine(trimmed);
        if (health) {
          const summary = Object.entries(health).map(([k, v]) => `${k}=${v}`).join(" ");
          console.log(`[serial] HEALTH: ${summary}`);
          _pendingHealth = health;
          scheduleDeviceInfoPost();
        }
        return;
      }

      // ── IR remote / PID command lines from firmware ───────────────────────
      // Firmware prints e.g. "CMD:IR_CH", "CMD:IR_EMERGENCY_STOP" when an
      // IR button is pressed. Forward them to the API so the dashboard IR
      // feed is updated.
      if (trimmed.startsWith("CMD:") || trimmed.startsWith("PID_")) {
        console.log(`[serial] IR/CMD line: ${trimmed}`);
        postJson(`${_apiBase}/api/ir/command`, { line: trimmed }).catch(() => {});
        return;
      }

      // ── Normal JSON sensor data ───────────────────────────────────────────
      try {
        const raw = JSON.parse(trimmed);
        if (raw.status !== undefined && raw.rpm === undefined) return;
        const reading = normalise(raw);
        postReading(reading);
        if (callbacks.onData) callbacks.onData(reading);
      } catch {
        // Non-JSON line (debug print, etc.) — ignore
      }
    });
  });
}

// ─── Send a command to the ESP32 ──────────────────────────────────────────────

/**
 * Send a JSON command to the connected ESP32.
 * @param {object} cmd  e.g. { cmd: "motor", pwm: 128 } or { cmd: "stop" }
 */
function sendCommand(cmd) {
  if (!_openPort || !_openPort.isOpen) {
    return Promise.reject(new Error("No serial port open"));
  }
  return new Promise((resolve, reject) => {
    const line = JSON.stringify(cmd) + "\n";
    _openPort.write(line, (err) => {
      if (err) return reject(err);
      resolve();
    });
  });
}

/**
 * Write a raw string to the serial port (serial-monitor style).
 * A newline is appended automatically if the string doesn't already end with one.
 * @param {string} text  e.g. "1500" or "y"
 */
function writeRaw(text) {
  console.log(`[serial] writeRaw called with: "${text}"`);
  if (!_openPort || !_openPort.isOpen) {
    const err = "No serial port open";
    console.warn(`[serial] writeRaw rejected: ${err}`);
    return Promise.reject(new Error(err));
  }
  return new Promise((resolve, reject) => {
    const line = text.endsWith("\n") ? text : text + "\n";
    console.log(`[serial] writeRaw sending to port: "${line.trim()}"`);
    _openPort.write(line, (err) => {
      if (err) {
        console.error(`[serial] writeRaw error: ${err.message}`);
        return reject(err);
      }
      console.log(`[serial] writeRaw success`);
      resolve();
    });
  });
}

// ─── Disconnect ───────────────────────────────────────────────────────────────

function disconnect() {
  stopWritePoller();
  return new Promise((resolve) => {
    if (_openPort && _openPort.isOpen) {
      _openPort.close((err) => {
        _openPort = null;
        resolve(err ? err.message : null);
      });
    } else {
      _openPort = null;
      resolve(null);
    }
  });
}

// ─── Status ───────────────────────────────────────────────────────────────────

function isConnected() {
  return Boolean(_openPort && _openPort.isOpen);
}

function getConnectedPort() {
  return _openPort?.path ?? null;
}

module.exports = {
  setApiBase,
  listPorts,
  connect,
  disconnect,
  sendCommand,
  writeRaw,
  isConnected,
  getConnectedPort,
};
