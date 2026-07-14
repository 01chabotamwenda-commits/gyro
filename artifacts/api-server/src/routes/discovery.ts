import { Router, type Request, type Response } from "express";
import os from "os";
import net from "net";
import dns from "dns";
import { logger } from "../lib/logger";
import { isWifiConnected } from "../lib/wifi-tcp-server";

const router = Router();

interface DiscoveredDevice {
  ip: string;
  reachable: boolean;
  portOpen: number | null;
  response: string | null;
  error: string | null;
}

/** Find the first non-internal IPv4 address and its /24 subnet */
function getLocalSubnet(): { ip: string; subnet: string } | null {
  const interfaces = os.networkInterfaces();
  for (const [, addrs] of Object.entries(interfaces)) {
    for (const addr of addrs ?? []) {
      if (addr.family === "IPv4" && !addr.internal && !addr.address.startsWith("127.")) {
        const parts = addr.address.split(".");
        const subnet = `${parts[0]}.${parts[1]}.${parts[2]}`;
        return { ip: addr.address, subnet };
      }
    }
  }
  return null;
}

/** Try TCP connect to a host:port with timeout */
function tryTcpConnect(ip: string, port: number, timeoutMs = 800): Promise<{ open: boolean; banner: string | null; error: string | null }> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let banner = "";
    let resolved = false;

    socket.setTimeout(timeoutMs);

    socket.on("connect", () => {
      // If we connect to port 5001, immediately close — we just need reachability
      // If port 80, try a quick HTTP GET
      if (port === 80) {
        socket.write("GET / HTTP/1.0\r\nHost: " + ip + "\r\n\r\n");
      } else {
        socket.destroy();
        if (!resolved) { resolved = true; resolve({ open: true, banner: null, error: null }); }
      }
    });

    socket.on("data", (data) => {
      banner += data.toString("utf-8").slice(0, 200);
    });

    socket.on("timeout", () => {
      socket.destroy();
      if (!resolved) { resolved = true; resolve({ open: false, banner: null, error: "timeout" }); }
    });

    socket.on("error", (err) => {
      if (!resolved) { resolved = true; resolve({ open: false, banner: null, error: err.message }); }
    });

    socket.on("close", () => {
      if (!resolved) {
        resolved = true;
        resolve({ open: banner.length > 0, banner: banner || null, error: null });
      }
    });

    socket.connect(port, ip);
  });
}

/**
 * GET /api/discovery/scan
 * Scan the local /24 subnet for ESP32 devices.
 * Probes port 5001 (app TCP server) and port 80 (HTTP).
 */
router.get("/discovery/scan", async (_req: Request, res: Response) => {
  const local = getLocalSubnet();
  if (!local) {
    return res.status(500).json({ ok: false, error: "Could not determine local network interface" });
  }

  logger.info("[discovery] scanning subnet %s.0/24 from %s", local.subnet, local.ip);

  const devices: DiscoveredDevice[] = [];
  const promises: Promise<void>[] = [];

  for (let i = 1; i <= 254; i++) {
    const ip = `${local.subnet}.${i}`;
    if (ip === local.ip) continue; // skip self

    promises.push(
      (async () => {
        // Fast check: try port 5001 first (our app server TCP)
        const tcp5001 = await tryTcpConnect(ip, 5001, 600);
        if (tcp5001.open) {
          devices.push({ ip, reachable: true, portOpen: 5001, response: null, error: null });
          return;
        }
        // Fallback: try HTTP on port 80
        const http80 = await tryTcpConnect(ip, 80, 600);
        if (http80.open) {
          devices.push({ ip, reachable: true, portOpen: 80, response: http80.banner, error: null });
          return;
        }
      })()
    );

    // Batch in groups of 64 to avoid overwhelming the event loop
    if (promises.length % 64 === 0) {
      await Promise.all(promises.splice(0, 64));
    }
  }

  await Promise.all(promises);

  logger.info("[discovery] found %d device(s)", devices.length);
  return res.json({ ok: true, subnet: `${local.subnet}.0/24`, localIp: local.ip, devices });
});

/**
 * GET /api/discovery/local-ip
 * Return the server's local IPv4 address for the WiFi interface.
 */
router.get("/discovery/local-ip", (_req: Request, res: Response) => {
  const local = getLocalSubnet();
  if (!local) {
    return res.status(500).json({ ok: false, error: "Could not determine local IP" });
  }
  return res.json({ ok: true, ip: local.ip });
});

/** Resolve a hostname with a timeout (ms). Returns null on failure. */
function resolveHostname(hostname: string, timeoutMs = 2000): Promise<string | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), timeoutMs);
    dns.lookup(hostname, 4, (err, address) => {
      clearTimeout(timer);
      resolve(err ? null : address);
    });
  });
}

/** Check if an IP's HTTP port 80 banner looks like the GyroMonitor ESP32 */
function isEsp32Banner(banner: string | null): boolean {
  if (!banner) return false;
  const lower = banner.toLowerCase();
  return lower.includes("gyro") || lower.includes("esp32") || lower.includes("gyromonitor");
}

/**
 * GET /api/discovery/esp32
 * Fast ESP32-specific discovery:
 *  1. Try gyromonitor.local (mDNS)
 *  2. Fall back to /24 subnet scan on port 80 filtered by banner
 * Returns { ok, devices: [{ ip, name, connected }] }
 */
router.get("/discovery/esp32", async (_req: Request, res: Response) => {
  const alreadyConnected = isWifiConnected();

  // 1. Try mDNS hostname first
  const mdnsIp = await resolveHostname("gyromonitor.local", 2000);
  if (mdnsIp) {
    const probe = await tryTcpConnect(mdnsIp, 80, 1000);
    if (probe.open) {
      logger.info("[discovery/esp32] found via mDNS at %s", mdnsIp);
      return res.json({
        ok: true,
        devices: [{ ip: mdnsIp, name: "GyroMonitor (gyromonitor.local)", connected: alreadyConnected }],
      });
    }
  }

  // 2. Subnet scan — port 80 only, 400 ms timeout
  const local = getLocalSubnet();
  if (!local) {
    return res.json({ ok: true, devices: [] });
  }

  logger.info("[discovery/esp32] mDNS miss — scanning %s.0/24", local.subnet);

  const found: Array<{ ip: string; name: string | null; connected: boolean }> = [];
  const batch: Promise<void>[] = [];

  for (let i = 1; i <= 254; i++) {
    const ip = `${local.subnet}.${i}`;
    if (ip === local.ip) continue;

    batch.push(
      (async () => {
        const r = await tryTcpConnect(ip, 80, 400);
        if (r.open && isEsp32Banner(r.banner)) {
          found.push({ ip, name: "GyroMonitor ESP32", connected: alreadyConnected });
        }
      })()
    );

    if (batch.length % 64 === 0) await Promise.all(batch.splice(0, 64));
  }
  await Promise.all(batch);

  logger.info("[discovery/esp32] found %d ESP32(s)", found.length);
  return res.json({ ok: true, subnet: `${local.subnet}.0/24`, localIp: local.ip, devices: found });
});

export default router;
