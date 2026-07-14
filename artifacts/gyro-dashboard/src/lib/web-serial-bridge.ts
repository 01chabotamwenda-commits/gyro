/**
 * web-serial-bridge.ts — Browser-side USB serial bridge using the Web Serial API.
 *
 * Mirrors the Electron serial-manager.js API so the same ConnectDialog and
 * SystemTerminal components work without any changes.
 *
 * Supported in Chrome / Edge. Firefox and Safari require a polyfill or extension.
 */

import { apiUrl } from "./api-url";

async function postJson(url: string, body: object): Promise<unknown | null> {
  try {
    const res = await fetch(apiUrl(url), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return await res.json();
  } catch (err) {
    console.warn(`[web-serial] POST ${url} failed:`, err);
    return null;
  }
}

async function getJson(url: string): Promise<unknown | null> {
  try {
    const res = await fetch(apiUrl(url));
    return await res.json();
  } catch (err) {
    console.warn(`[web-serial] GET ${url} failed:`, err);
    return null;
  }
}

/* ─── Line-splitting transform stream ─────────────────────────────────────── */

class LineBreakTransformer implements Transformer<string, string> {
  private container = "";

  transform(chunk: string, controller: TransformStreamDefaultController<string>) {
    this.container += chunk;
    const lines = this.container.split("\n");
    this.container = lines.pop() ?? "";
    for (const line of lines) controller.enqueue(line);
  }

  flush(controller: TransformStreamDefaultController<string>) {
    controller.enqueue(this.container);
  }
}

/* ─── Handshake parsers (same as serial-manager.js) ───────────────────────── */

function parseDeviceInfoLine(line: string): { deviceId: string; version: string; baud: number; components: string[] } | null {
  try {
    const parts = line.split("|");
    const result = { deviceId: "ESP32", version: "1.0", baud: 115200, components: [] as string[] };
    for (const part of parts) {
      if (part.startsWith("DEVICE_INFO:")) {
        result.deviceId = part.slice("DEVICE_INFO:".length).trim();
      } else if (part.startsWith("VERSION:")) {
        result.version = part.slice("VERSION:".length).trim();
      } else if (part.startsWith("COMPONENTS:")) {
        result.components = part.slice("COMPONENTS:".length).split(",").map((c) => c.trim()).filter(Boolean);
      } else if (part.startsWith("BAUD:")) {
        result.baud = parseInt(part.slice("BAUD:".length), 10) || 115200;
      }
    }
    return result;
  } catch {
    return null;
  }
}

function parseHealthLine(line: string): Record<string, "OK" | "FAIL" | "UNKNOWN"> | null {
  try {
    const payload = line.startsWith("HEALTH:") ? line.slice("HEALTH:".length) : line;
    const health: Record<string, "OK" | "FAIL" | "UNKNOWN"> = {};
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

function normaliseReading(raw: Record<string, unknown>): Record<string, number> {
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

/* ─── Main bridge class ─────────────────────────────────────────────────────── */

export class WebSerialBridge {
  private port: SerialPort | null = null;
  private reader: ReadableStreamDefaultReader<string> | null = null;
  private closed = false;
  private connected = false;
  private connectedPort: string | null = null;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private onClosedCbs: Array<(d: { port: string }) => void> = [];
  private onErrorCbs: Array<(d: { port: string; error: string }) => void> = [];

  private pendingDeviceInfo: object | null = null;
  private pendingHealth: object | null = null;
  private deviceInfoTimer: ReturnType<typeof setTimeout> | null = null;
  private lastDeviceInfo: object | null = null;
  private lastConnectedPort: string | null = null;

  static isSupported(): boolean {
    return typeof navigator !== "undefined" && "serial" in navigator;
  }

  /** Returns true if the Serial API is accessible (not blocked by permissions policy). */
  static isPermitted(): boolean {
    return WebSerialBridge._permitted;
  }

  private static _permitted = true;

  async listPorts(): Promise<Array<{ path: string; manufacturer: string | null }>> {
    if (!navigator.serial) return [];
    try {
      const ports = await navigator.serial.getPorts();
      WebSerialBridge._permitted = true;
      return ports.map((p, i) => {
        const info = p.getInfo();
        const vid = info.usbVendorId?.toString(16).toUpperCase() ?? "";
        const pid = info.usbProductId?.toString(16).toUpperCase() ?? "";
        return {
          path: vid && pid ? `USB-${vid}:${pid}` : `Serial-${i}`,
          manufacturer: vid ? `VID 0x${vid}` : null,
        };
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("permissions policy") || msg.includes("disallowed")) {
        WebSerialBridge._permitted = false;
      }
      return [];
    }
  }

  async requestPort(): Promise<{ ok: boolean; error?: string }> {
    try {
      if (!navigator.serial) return { ok: false, error: "Web Serial API not available" };
      await navigator.serial.requestPort();
      return { ok: true };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { ok: false, error: msg };
    }
  }

  async connect(portPath: string, baudRate = 115200): Promise<{ ok: boolean; error?: string }> {
    try {
      if (!navigator.serial) return { ok: false, error: "Web Serial API not available" };

      const grantedPorts = await navigator.serial.getPorts();

      // Find a matching port among previously-granted ports
      let port = portPath
        ? grantedPorts.find((p) => {
            const info = p.getInfo();
            const vid = info.usbVendorId?.toString(16).toUpperCase() ?? "";
            const pid = info.usbProductId?.toString(16).toUpperCase() ?? "";
            const path = vid && pid ? `USB-${vid}:${pid}` : `Serial-${grantedPorts.indexOf(p)}`;
            return path === portPath;
          })
        : null;

      // If no match, prompt the user to select a port
      if (!port) {
        port = await navigator.serial.requestPort();
      }
      if (!port) return { ok: false, error: "No USB serial port selected" };

      await port.open({ baudRate });
      this.port = port;
      this.closed = false;
      this.connected = true;
      this.connectedPort = portPath;
      this.lastConnectedPort = portPath;

      await postJson("/api/serial/connect", { port: portPath });
      this.startReading();
      this.startPolling();

      port.addEventListener("disconnect", () => this.handleDisconnect());
      return { ok: true };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.onErrorCbs.forEach((cb) => cb({ port: portPath, error: msg }));
      return { ok: false, error: msg };
    }
  }

  async disconnect(): Promise<{ ok: boolean }> {
    this.handleDisconnect();
    return { ok: true };
  }

  status(): Promise<{ connected: boolean; port: string | null }> {
    return Promise.resolve({ connected: this.connected, port: this.connectedPort });
  }

  async writeRaw(text: string): Promise<{ ok: boolean; error?: string }> {
    if (!this.port || !this.port.writable || this.port.writable.locked) {
      return { ok: false, error: "No serial port open" };
    }
    try {
      const writer = this.port.writable.getWriter();
      const line = text.endsWith("\n") ? text : text + "\n";
      await writer.write(new TextEncoder().encode(line));
      writer.releaseLock();
      return { ok: true };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { ok: false, error: msg };
    }
  }

  async sendCommand(cmd: object): Promise<{ ok: boolean; error?: string }> {
    return this.writeRaw(JSON.stringify(cmd));
  }

  onClosed(cb: (d: { port: string }) => void): () => void {
    this.onClosedCbs.push(cb);
    return () => {
      const idx = this.onClosedCbs.indexOf(cb);
      if (idx >= 0) this.onClosedCbs.splice(idx, 1);
    };
  }

  onError(cb: (d: { port: string; error: string }) => void): () => void {
    this.onErrorCbs.push(cb);
    return () => {
      const idx = this.onErrorCbs.indexOf(cb);
      if (idx >= 0) this.onErrorCbs.splice(idx, 1);
    };
  }

  /* ─── Internals ─────────────────────────────────────────────────────────── */

  private handleDisconnect() {
    if (this.closed) return;
    this.closed = true;
    this.connected = false;
    const port = this.connectedPort;
    this.connectedPort = null;
    this.stopPolling();

    if (this.reader) {
      try { this.reader.cancel(); } catch { /* ignore */ }
      this.reader = null;
    }
    if (this.port) {
      try { this.port.close(); } catch { /* ignore */ }
      this.port = null;
    }

    void postJson("/api/serial/disconnect", {});
    this.onClosedCbs.forEach((cb) => cb({ port: port ?? "" }));
  }

  private startReading() {
    if (!this.port || !this.port.readable) return;

    const textDecoder = new TextDecoderStream();
    const readableStreamClosed = this.port.readable.pipeTo(textDecoder.writable as WritableStream<Uint8Array>);
    const reader = textDecoder.readable
      .pipeThrough(new TransformStream(new LineBreakTransformer()))
      .getReader();
    this.reader = reader;

    (async () => {
      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          if (value) this.handleLine(value.trim());
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn("[web-serial] read error:", msg);
        this.onErrorCbs.forEach((cb) => cb({ port: this.connectedPort ?? "", error: msg }));
      } finally {
        this.handleDisconnect();
      }
    })();
  }

  private handleLine(line: string) {
    if (!line || line.startsWith("//")) return;

    if (line.startsWith("DEVICE_INFO:")) {
      const info = parseDeviceInfoLine(line);
      if (info) {
        console.log(`[web-serial] DEVICE_INFO: ${info.deviceId} v${info.version}`);
        this.pendingDeviceInfo = info;
        this.scheduleDeviceInfoPost();
      }
      return;
    }

    if (line.startsWith("HEALTH:")) {
      const health = parseHealthLine(line);
      if (health) {
        const summary = Object.entries(health).map(([k, v]) => `${k}=${v}`).join(" ");
        console.log(`[web-serial] HEALTH: ${summary}`);
        this.pendingHealth = health;
        this.scheduleDeviceInfoPost();
      }
      return;
    }

    // IR remote command lines sent by the ESP32 ir_remote.h handler
    if (line.startsWith("CMD:") || line.startsWith("PID_")) {
      console.log(`[web-serial] IR command: ${line}`);
      void postJson("/api/ir/command", { line });
      return;
    }

    try {
      const raw = JSON.parse(line) as Record<string, unknown>;
      if (raw.status !== undefined && raw.rpm === undefined) return;
      const reading = normaliseReading(raw);
      void postJson("/api/readings/ingest", reading);
    } catch {
      // Non-JSON line — ignore
    }
  }

  private scheduleDeviceInfoPost() {
    if (this.deviceInfoTimer) clearTimeout(this.deviceInfoTimer);
    this.deviceInfoTimer = setTimeout(() => {
      if (!this.pendingDeviceInfo) return;
      const body = { ...this.pendingDeviceInfo, health: this.pendingHealth ?? {} };
      this.lastDeviceInfo = body;
      void postJson("/api/serial/device-info", body);
      this.pendingDeviceInfo = null;
      this.pendingHealth = null;
      this.deviceInfoTimer = null;
    }, 500);
  }

  private startPolling() {
    if (this.pollTimer) return;
    this.pollTimer = setInterval(async () => {
      // Liveness check
      const status = await getJson("/api/serial/status");
      if (status && !(status as { connected?: boolean }).connected && this.lastConnectedPort) {
        console.log(`[web-serial] Server lost hardware state — re-announcing ${this.lastConnectedPort}`);
        await postJson("/api/serial/connect", { port: this.lastConnectedPort });
        if (this.lastDeviceInfo) {
          await postJson("/api/serial/device-info", this.lastDeviceInfo);
        }
      }

      // Drain pending writes
      const data = await getJson("/api/serial/pending-write");
      if (!data || !Array.isArray((data as { writes?: unknown[] }).writes)) return;
      for (const text of (data as { writes: string[] }).writes) {
        await this.writeRaw(text);
      }
    }, 400);
  }

  private stopPolling() {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }
}

/* ─── Auto-register as window.serialBridge when available ──────────────────── */

if (WebSerialBridge.isSupported() && typeof window !== "undefined") {
  const w = window as unknown as { serialBridge?: unknown };
  if (!w.serialBridge) {
    w.serialBridge = new WebSerialBridge();
  }
}
