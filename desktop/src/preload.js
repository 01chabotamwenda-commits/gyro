/**
 * Electron preload — runs in the renderer context with limited Node access.
 *
 * Parses the API base URL + WebSocket URL that the main process passed via
 * `additionalArguments`, then exposes them (and safe IPC bridges) to the
 * React app through `contextBridge`.
 */

"use strict";

const { contextBridge, ipcRenderer } = require("electron");

// Pull values injected by main.js via BrowserWindow.webPreferences.additionalArguments
let apiBase  = null;
let wsUrl    = null;
let platform = null;

for (const arg of process.argv) {
  if (arg.startsWith("--gyro-api-base="))  apiBase  = arg.slice("--gyro-api-base=".length);
  if (arg.startsWith("--gyro-ws-url="))    wsUrl    = arg.slice("--gyro-ws-url=".length);
  if (arg.startsWith("--gyro-platform="))  platform = arg.slice("--gyro-platform=".length);
}

// Expose the API base URL so main.tsx can call setBaseUrl() on startup
contextBridge.exposeInMainWorld("__GYRO_API_BASE__", apiBase);

// Expose the platform so the renderer can decide whether to show custom controls
contextBridge.exposeInMainWorld("__GYRO_PLATFORM__", platform);

// Window controls — only meaningful on Windows / Linux (mac uses native traffic lights)
contextBridge.exposeInMainWorld("windowBridge", {
  minimize:    () => ipcRenderer.invoke("window:minimize"),
  maximize:    () => ipcRenderer.invoke("window:maximize"),
  close:       () => ipcRenderer.invoke("window:close"),
  isMaximized: () => ipcRenderer.invoke("window:isMaximized"),
  onMaximizeChanged: (cb) => {
    const handler = (_, val) => cb(val);
    ipcRenderer.on("window:maximizeChanged", handler);
    return () => ipcRenderer.off("window:maximizeChanged", handler);
  },
});

// Expose the WebSocket URL for use-websocket.ts
contextBridge.exposeInMainWorld("__GYRO_WS_URL__", wsUrl);

// Expose the server-config + status bridge for the Settings page
contextBridge.exposeInMainWorld("electronBridge", {
  /** Is the app running inside Electron? (always true here) */
  isElectron: true,

  /** Get the currently saved server config { serverHost, serverPort } */
  getServerConfig: () => ipcRenderer.invoke("get-server-config"),

  /**
   * Save a new server config and restart the API server.
   * @param {{ serverHost: string, serverPort: number }} config
   */
  setServerConfig: (config) => ipcRenderer.invoke("set-server-config", config),

  /** Check whether the API server child process is running */
  getServerStatus: () => ipcRenderer.invoke("get-server-status"),

  /** Reveal the api-server.log file in the OS file explorer (or open its folder) */
  openServerLog: () => ipcRenderer.invoke("open-server-log"),
});

// Expose the serial port bridge for the Settings page → SerialDevicePanel
contextBridge.exposeInMainWorld("serialBridge", {
  /** List all available serial ports */
  listPorts: () => ipcRenderer.invoke("serial:list"),

  /**
   * Open a serial port and start streaming data to the API server.
   * @param {string} port  e.g. "COM3" or "/dev/ttyUSB0"
   * @param {number} [baudRate=115200]
   */
  connect: (port, baudRate) => ipcRenderer.invoke("serial:connect", { port, baudRate }),

  /** Close the active serial port */
  disconnect: () => ipcRenderer.invoke("serial:disconnect"),

  /** Get current connection state */
  status: () => ipcRenderer.invoke("serial:status"),

  /**
   * Send a JSON command to the ESP32.
   * @param {object} cmd  e.g. { cmd: "motor", pwm: 128 } or { cmd: "stop" }
   */
  send: (cmd) => ipcRenderer.invoke("serial:send", cmd),

  /**
   * Write a raw string to the ESP32 (serial-monitor style input).
   * A newline is appended automatically.
   * @param {string} text  e.g. "1500" or "y"
   */
  writeRaw: (text) => ipcRenderer.invoke("serial:writeRaw", text),

  /**
   * Subscribe to port-closed events (fired when the port closes unexpectedly).
   * @param {function} callback
   * @returns {function} unsubscribe function
   */
  onClosed: (callback) => {
    const handler = (_, data) => callback(data);
    ipcRenderer.on("serial:closed", handler);
    return () => ipcRenderer.off("serial:closed", handler);
  },

  /**
   * Subscribe to serial error events.
   * @param {function} callback
   * @returns {function} unsubscribe function
   */
  onError: (callback) => {
    const handler = (_, data) => callback(data);
    ipcRenderer.on("serial:error", handler);
    return () => ipcRenderer.off("serial:error", handler);
  },
});
