/**
 * Gyro Monitor — Electron main process
 *
 * Responsibilities:
 *  1. Read / write persistent server config (host + port) from userData JSON.
 *  2. Spawn the bundled Express API server as a child process.
 *  3. Create the BrowserWindow and load the built React frontend.
 *  4. Expose IPC handlers so the Settings page can read / change the server config.
 *  5. Manage the USB serial connection to the ESP32 (list ports, connect, disconnect).
 */

"use strict";

const { app, BrowserWindow, ipcMain, shell } = require("electron");
const path = require("path");
const fs = require("fs");
const { spawn } = require("child_process");
const serialManager = require("./serial-manager");

// ─── Defaults ─────────────────────────────────────────────────────────────────

const DEFAULT_CONFIG = {
  serverHost: "127.0.0.1",
  serverPort: 5000,
};

// The API server always runs its ESP32 WiFi TCP listener on this port
// (see artifacts/api-server/src/lib/wifi-tcp-server.ts — WIFI_TCP_PORT,
// matched by the firmware's hardcoded SERVER_PORT). It must never collide
// with the HTTP/WebSocket port the dashboard talks to, or one of the two
// listeners fails silently with EADDRINUSE.
const WIFI_TCP_RESERVED_PORT = 5001;

/**
 * Resolve the HTTP/WebSocket port to actually use, nudging it out of the way
 * of the reserved ESP32 TCP port if they happen to collide (e.g. a stale
 * saved config). This lets the user leave whatever port they already have
 * saved without manually editing it — the app just avoids the conflict.
 */
function resolveHttpPort(config) {
  if (config.serverPort === WIFI_TCP_RESERVED_PORT) {
    const fallback = config.serverPort + 1;
    console.warn(
      `[gyro] Configured server port ${config.serverPort} collides with the reserved ESP32 WiFi TCP port ${WIFI_TCP_RESERVED_PORT} — using ${fallback} for the HTTP/WebSocket server instead.`
    );
    return fallback;
  }
  return config.serverPort;
}

// ─── Config persistence ───────────────────────────────────────────────────────

function getConfigPath() {
  return path.join(app.getPath("userData"), "gyro-config.json");
}

function readConfig() {
  try {
    const raw = fs.readFileSync(getConfigPath(), "utf-8");
    const loaded = { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
    
    // Validate: 0.0.0.0 is invalid for client connections, reset to defaults
    if (loaded.serverHost === "0.0.0.0" || loaded.serverPort === 8050) {
      console.warn("[gyro] Invalid config detected (0.0.0.0 or port 8050), resetting to defaults");
      return { ...DEFAULT_CONFIG };
    }
    
    return loaded;
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

function writeConfig(config) {
  try {
    fs.mkdirSync(path.dirname(getConfigPath()), { recursive: true });
    fs.writeFileSync(getConfigPath(), JSON.stringify(config, null, 2), "utf-8");
    return true;
  } catch (err) {
    console.error("[gyro] failed to write config:", err.message);
    return false;
  }
}

// ─── API server child process ─────────────────────────────────────────────────

let apiProcess = null;
// Tracks the most recent failure so the UI (and the log file) can explain
// *why* the server shows "stopped" — a packaged Electron app has no visible
// console, so without this the only place errors go is a black hole.
let lastServerError = null;

function getLogFilePath() {
  return path.join(app.getPath("userData"), "api-server.log");
}

let logStream = null;
function getLogStream() {
  if (!logStream) {
    try {
      logStream = fs.createWriteStream(getLogFilePath(), { flags: "a" });
    } catch (err) {
      console.error("[gyro] failed to open log file:", err.message);
    }
  }
  return logStream;
}

function logLine(line) {
  const stamped = `[${new Date().toISOString()}] ${line}`;
  console.log(stamped);
  const stream = getLogStream();
  if (stream) stream.write(stamped.endsWith("\n") ? stamped : stamped + "\n");
}

function getApiServerPath() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, "api-server", "index.mjs");
  }
  return path.resolve(__dirname, "..", "..", "artifacts", "api-server", "dist", "index.mjs");
}

function startApiServer(config) {
  stopApiServer();

  const serverPath = getApiServerPath();
  if (!fs.existsSync(serverPath)) {
    lastServerError = `API server bundle not found at ${serverPath}. The installer may be missing packaged resources.`;
    logLine(`[gyro] ${lastServerError}`);
    return;
  }

  const httpPort = resolveHttpPort(config);

  lastServerError = null;
  logLine(`[gyro] Starting API server → http://${config.serverHost}:${httpPort} (bundle: ${serverPath})`);

  // Tell the serial manager which base URL to post readings to
  serialManager.setApiBase(`http://${config.serverHost}:${httpPort}`);

  // Run the server with Electron's own bundled Node runtime (via
  // ELECTRON_RUN_AS_NODE) instead of spawning the system "node" binary.
  // Packaged end-user machines are NOT guaranteed to have Node.js installed
  // or on PATH — spawning "node" directly fails silently (ENOENT) with no
  // "error" listener attached, which is why the server always showed
  // "stopped" once the app was installed on a machine without Node.js.
  // Start from the Electron process's own env (for PATH, etc.), but
  // explicitly strip DATABASE_URL rather than just "not setting" it — if
  // DATABASE_URL is present anywhere in the parent environment (a leftover
  // system/user env var, a shell the app was launched from, etc.), spreading
  // ...process.env silently lets it leak through to the child. That's what
  // caused the server to try (and fail) to authenticate against a dev Neon
  // Postgres instance on a packaged desktop install instead of using the
  // local SQLite store. Deleting it here guarantees offline mode regardless
  // of what the host environment happens to have set.
  const childEnv = { ...process.env };
  delete childEnv.DATABASE_URL;

  apiProcess = spawn(process.execPath, ["--enable-source-maps", serverPath], {
    env: {
      ...childEnv,
      ELECTRON_RUN_AS_NODE: "1",
      PORT: String(httpPort),
      HOST: config.serverHost,
      NODE_ENV: "production",
      // GYRO_DATA_DIR must be a stable, writable, per-OS folder — NOT the
      // default process.cwd(), which can resolve to a read-only install
      // directory once the app is packaged — so history and settings
      // survive app restarts, updates, and reinstalls.
      GYRO_DATA_DIR: app.getPath("userData"),
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  apiProcess.stdout.on("data", (d) => logLine(`[api] ${d}`.trimEnd()));
  apiProcess.stderr.on("data", (d) => logLine(`[api] ${d}`.trimEnd()));
  apiProcess.on("error", (err) => {
    lastServerError = `Failed to spawn API server: ${err.message}`;
    logLine(`[gyro] ${lastServerError}`);
    apiProcess = null;
  });
  apiProcess.on("exit", (code, signal) => {
    logLine(`[gyro] API server exited (code=${code} signal=${signal})`);
    // A clean SIGTERM from stopApiServer() (e.g. during a config-driven
    // restart) isn't a failure — don't surface it as an error in the UI.
    if (!(signal === "SIGTERM" && code === null)) {
      lastServerError = `API server exited unexpectedly (code=${code}, signal=${signal}). Check the log file for details.`;
    }
    apiProcess = null;
  });
}

function stopApiServer() {
  if (apiProcess) {
    logLine("[gyro] Stopping API server…");
    try { apiProcess.kill("SIGTERM"); } catch { /* ignore */ }
    apiProcess = null;
  }
}

// ─── Browser window ───────────────────────────────────────────────────────────

let mainWindow = null;

function getFrontendPath() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, "frontend", "index.html");
  }
  return path.resolve(
    __dirname, "..", "..", "artifacts", "gyro-dashboard", "dist", "public", "index.html"
  );
}

function createWindow(config) {
  const isMac = process.platform === "darwin";
  const httpPort = resolveHttpPort(config);

  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 600,
    title: "Gyro Monitor — Copperbelt University",
    backgroundColor: "#09090b",
    // Hide the native OS title bar so the React app can draw its own themed one
    ...(isMac
      ? { titleBarStyle: "hidden", trafficLightPosition: { x: 14, y: 10 } }
      : { frame: false }),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      additionalArguments: [
        `--gyro-api-base=http://${config.serverHost}:${httpPort}`,
        `--gyro-ws-url=ws://${config.serverHost}:${httpPort}/api/ws`,
        isMac ? "--gyro-platform=mac" : `--gyro-platform=${process.platform}`,
      ],
    },
  });

  mainWindow.setMenuBarVisibility(false);

  const frontendPath = getFrontendPath();
  if (!fs.existsSync(frontendPath)) {
    mainWindow.loadURL(
      "data:text/html," +
        encodeURIComponent(`
        <!DOCTYPE html>
        <html>
        <body style="background:#09090b;color:#f8fafc;font-family:monospace;padding:2rem">
          <h2 style="color:#f87171">Gyro Monitor — Build Required</h2>
          <p>The React frontend hasn't been built yet. Run:</p>
          <pre style="background:#18181b;padding:1rem;border-radius:6px">
  pnpm --filter @workspace/api-server run build
  pnpm --filter @workspace/gyro-dashboard run build</pre>
          <p>Then restart the app.</p>
          <p style="color:#71717a;font-size:0.8em">Expected path: ${frontendPath}</p>
        </body>
        </html>`)
    );
  } else {
    mainWindow.loadFile(frontendPath);
  }

  bindMaximizeEvents(mainWindow);
  mainWindow.on("closed", () => { mainWindow = null; });

  // ── DevTools keyboard shortcut ─────────────────────────────────────────────
  // The app has no native menu bar, so F12 / Ctrl+Shift+I are dead by default.
  // Register them via before-input-event so the developer can open DevTools
  // in the packaged build to diagnose crashes without needing a debug build.
  mainWindow.webContents.on("before-input-event", (event, input) => {
    if (input.type !== "keyDown") return;
    const devToolsShortcut =
      input.key === "F12" ||
      (input.control && input.shift && (input.key === "I" || input.key === "i")) ||
      (input.meta    && input.alt   && (input.key === "I" || input.key === "i"));
    if (devToolsShortcut) {
      mainWindow.webContents.toggleDevTools();
      event.preventDefault();
    }
  });
}

// ─── IPC handlers — window controls ───────────────────────────────────────────

ipcMain.handle("window:minimize",   () => mainWindow?.minimize());
ipcMain.handle("window:maximize",   () => {
  if (!mainWindow) return;
  mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize();
});
ipcMain.handle("window:close",      () => mainWindow?.close());
ipcMain.handle("window:isMaximized",() => mainWindow?.isMaximized() ?? false);

// Forward maximize / unmaximize events to the renderer so the button icon updates
function bindMaximizeEvents(win) {
  const send = (v) => win.webContents.send("window:maximizeChanged", v);
  win.on("maximize",   () => send(true));
  win.on("unmaximize", () => send(false));
}

// ─── IPC handlers — server config ─────────────────────────────────────────────

ipcMain.handle("get-server-config", () => readConfig());

ipcMain.handle("set-server-config", async (_, newConfig) => {
  const config = { ...readConfig(), ...newConfig };
  const saved = writeConfig(config);
  if (!saved) return { ok: false, error: "Failed to write config file" };

  startApiServer(config);

  if (mainWindow) {
    setTimeout(() => {
      if (mainWindow) mainWindow.webContents.reload();
    }, 1200);
  }

  return { ok: true, config };
});

ipcMain.handle("get-server-status", () => ({
  running: apiProcess !== null,
  pid: apiProcess?.pid ?? null,
  error: lastServerError,
  logFile: getLogFilePath(),
}));

ipcMain.handle("open-server-log", () => {
  const logPath = getLogFilePath();
  if (fs.existsSync(logPath)) {
    shell.showItemInFolder(logPath);
  } else {
    shell.openPath(path.dirname(logPath));
  }
  return { ok: true, logFile: logPath };
});

// ─── IPC handlers — serial port (ESP32) ───────────────────────────────────────

/** List all available serial ports */
ipcMain.handle("serial:list", async () => {
  try {
    return await serialManager.listPorts();
  } catch (err) {
    console.error("[gyro] serial list error:", err.message);
    return [];
  }
});

/**
 * Open a serial port and start streaming readings to the API server.
 * @param {{ port: string, baudRate?: number }} args
 */
ipcMain.handle("serial:connect", async (_, { port, baudRate = 115200 }) => {
  try {
    await serialManager.connect(port, baudRate, {
      onClose: () => {
        console.log("[gyro] serial port closed");
        // Notify renderer that the port closed unexpectedly
        if (mainWindow) {
          mainWindow.webContents.send("serial:closed", { port });
        }
      },
      onError: (errMsg) => {
        if (mainWindow) {
          mainWindow.webContents.send("serial:error", { port, error: errMsg });
        }
      },
    });
    return { ok: true, port };
  } catch (err) {
    console.error("[gyro] serial connect error:", err.message);
    return { ok: false, error: err.message };
  }
});

/** Close the active serial port */
ipcMain.handle("serial:disconnect", async () => {
  try {
    await serialManager.disconnect();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

/** Return current serial connection state */
ipcMain.handle("serial:status", () => ({
  connected: serialManager.isConnected(),
  port: serialManager.getConnectedPort(),
}));

/**
 * Send a raw JSON command to the connected ESP32.
 * @param {object} cmd e.g. { cmd: "motor", pwm: 128 } or { cmd: "stop" }
 */
ipcMain.handle("serial:send", async (_, cmd) => {
  try {
    await serialManager.sendCommand(cmd);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle("serial:writeRaw", async (_, text) => {
  console.log(`[main] IPC serial:writeRaw received: "${text}"`);
  try {
    await serialManager.writeRaw(text);
    console.log(`[main] IPC serial:writeRaw success`);
    return { ok: true };
  } catch (err) {
    console.error(`[main] IPC serial:writeRaw failed: ${err.message}`);
    return { ok: false, error: err.message };
  }
});

// ─── API server readiness probe ───────────────────────────────────────────────

/**
 * Poll GET /api/healthz until the API server responds, then resolve.
 * Gives up after `maxMs` milliseconds and resolves anyway so the window
 * still opens even if the server fails to start.
 */
function waitForApiServer(config, maxMs = 15000) {
  const httpPort = resolveHttpPort(config);
  const url = `http://${config.serverHost}:${httpPort}/api/healthz`;
  const deadline = Date.now() + maxMs;

  return new Promise((resolve) => {
    function probe() {
      fetch(url, { signal: AbortSignal.timeout(1000) })
        .then((r) => {
          if (r.ok) {
            console.log(`[gyro] API server is ready on port ${httpPort}`);
            resolve();
          } else {
            retry();
          }
        })
        .catch(retry);
    }

    function retry() {
      if (Date.now() >= deadline) {
        console.warn(`[gyro] API server did not respond within ${maxMs}ms — opening window anyway`);
        resolve();
        return;
      }
      setTimeout(probe, 300);
    }

    probe();
  });
}

// ─── App lifecycle ────────────────────────────────────────────────────────────

app.whenReady().then(async () => {
  const config = readConfig();
  startApiServer(config);

  // Wait until the API server is actually accepting requests before opening
  // the window. This prevents the serial bridge from posting to a port that
  // isn't listening yet, which caused the timeout cascade on first launch.
  await waitForApiServer(config);

  createWindow(config);

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow(readConfig());
  });
});

app.on("window-all-closed", () => {
  serialManager.disconnect().catch(() => {});
  stopApiServer();
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  serialManager.disconnect().catch(() => {});
  stopApiServer();
});
