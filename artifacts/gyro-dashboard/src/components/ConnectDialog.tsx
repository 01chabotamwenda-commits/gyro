import React, { useEffect, useState, useCallback, useRef } from "react";
import { apiUrl } from "@/lib/api-url";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Wifi, Usb, RefreshCw, CheckCircle2, AlertCircle, Zap, X,
  Cable, Loader2, Monitor, Save, ChevronDown, ChevronUp,
  ShieldAlert, Play, Info,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { WebSerialBridge } from "@/lib/web-serial-bridge";
import { Input } from "@/components/ui/input";

// ── Electron bridge interfaces ────────────────────────────────────────────────

interface SerialBridge {
  listPorts: () => Promise<Array<{ path: string; manufacturer: string | null }>>;
  connect: (port: string, baudRate?: number) => Promise<{ ok: boolean; error?: string }>;
  disconnect: () => Promise<{ ok: boolean }>;
  status: () => Promise<{ connected: boolean; port: string | null }>;
  onClosed: (cb: (d: { port: string }) => void) => () => void;
  onError: (cb: (d: { port: string; error: string }) => void) => () => void;
}

interface ElectronBridge {
  isElectron: true;
  getServerConfig: () => Promise<{ serverHost: string; serverPort: number }>;
  setServerConfig: (c: { serverHost: string; serverPort: number }) => Promise<{ ok: boolean; error?: string }>;
  getServerStatus: () => Promise<{ running: boolean; pid: number | null; error?: string | null; logFile?: string }>;
  openServerLog: () => Promise<{ ok: boolean; logFile: string }>;
}

function getSerialBridge(): SerialBridge | null {
  const w = window as unknown as { serialBridge?: SerialBridge };
  return w.serialBridge ?? null;
}

function getElectronBridge(): ElectronBridge | null {
  const w = window as unknown as { electronBridge?: ElectronBridge };
  return w.electronBridge?.isElectron ? w.electronBridge : null;
}

// ── Hardware status hook ──────────────────────────────────────────────────────

function useHardwareStatus() {
  const [status, setStatus] = useState<{ connected: boolean; port: string | null; mode: string } | null>(null);

  useEffect(() => {
    const poll = async () => {
      try {
        const res = await fetch(apiUrl("/api/serial/status"));
        if (res.ok) {
          const data = await res.json() as { connected: boolean; port: string | null; mode: string };
          setStatus(data);
        }
      } catch { /* ignore */ }
    };
    void poll();
    const t = setInterval(() => void poll(), 1500);
    return () => clearInterval(t);
  }, []);

  return status;
}

// ── WiFi Discovery Section ────────────────────────────────────────────────────

interface Esp32Device {
  ip: string;
  name: string | null;
  connected: boolean;
}

type WifiPhase = "idle" | "scanning" | "found" | "connecting" | "timeout" | "notfound" | "servererror";

function WifiSection({ onConnected }: { onConnected?: () => void }) {
  const hwStatus = useHardwareStatus();
  const isConnected = hwStatus?.connected && hwStatus.port?.startsWith("wifi:");
  const clientIp = isConnected && hwStatus.port ? hwStatus.port.replace("wifi:", "") : null;

  const [phase, setPhase] = useState<WifiPhase>("idle");
  const [devices, setDevices] = useState<Esp32Device[]>([]);
  const [localIp, setLocalIp] = useState<string | null>(null);
  const [manualIp, setManualIp] = useState("");
  const [disconnecting, setDisconnecting] = useState(false);
  const connectingRef = useRef(false);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Clean up poll timer on unmount
  useEffect(() => {
    return () => { if (pollTimerRef.current) clearInterval(pollTimerRef.current); };
  }, []);

  // Detect TCP connection arriving while we wait
  useEffect(() => {
    if (isConnected && connectingRef.current) {
      connectingRef.current = false;
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
      onConnected?.();
    }
  }, [isConnected]);

  const scan = useCallback(async () => {
    setPhase("scanning");
    setDevices([]);
    try {
      const res = await fetch(apiUrl("/api/discovery/esp32"));
      if (!res.ok) { setPhase("servererror"); return; }
      const data = await res.json() as { ok: boolean; devices?: Esp32Device[]; localIp?: string };
      if (data.localIp) setLocalIp(data.localIp);
      if (data.ok && data.devices && data.devices.length > 0) {
        setDevices(data.devices);
        setPhase("found");
      } else {
        setPhase("notfound");
      }
    } catch {
      setPhase("servererror");
    }
  }, []);

  function connect(ip: string) {
    if (connectingRef.current) return;
    connectingRef.current = true;
    setPhase("connecting");

    // Poll /api/serial/status for up to 15s
    const deadline = Date.now() + 15_000;
    pollTimerRef.current = setInterval(async () => {
      try {
        const r = await fetch(apiUrl("/api/serial/status"));
        const s = await r.json() as { connected: boolean; port: string | null };
        if (s.connected && s.port?.startsWith("wifi:")) {
          if (pollTimerRef.current) clearInterval(pollTimerRef.current);
          connectingRef.current = false;
          onConnected?.();
          return;
        }
      } catch { /* ignore */ }
      if (Date.now() >= deadline) {
        if (pollTimerRef.current) clearInterval(pollTimerRef.current);
        connectingRef.current = false;
        setPhase("timeout");
      }
    }, 800);
  }

  // Keep disconnecting=true until the hardware actually reports disconnected
  // (hwStatus polling / WS event). This prevents a second click during the
  // brief window between socket.destroy() and the close handler completing.
  useEffect(() => {
    if (disconnecting && !isConnected) setDisconnecting(false);
  }, [disconnecting, isConnected]);

  async function disconnectWifi() {
    setDisconnecting(true);
    try {
      await fetch(apiUrl("/api/serial/disconnect"), { method: "POST" });
    } catch { setDisconnecting(false); /* network failure — re-enable button */ }
  }

  // ── Already connected ──
  if (isConnected) {
    return (
      <div className="rounded border border-chart-3/30 bg-chart-3/5 overflow-hidden">
        <div className="flex items-center gap-3 px-4 py-3">
          <CheckCircle2 className="w-5 h-5 text-chart-3 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-chart-3">ESP32 connected wirelessly</p>
            <p className="text-[10px] font-mono text-muted-foreground mt-0.5">{clientIp}</p>
          </div>
        </div>
        <div className="border-t border-chart-3/20 px-4 py-2.5 bg-chart-3/5">
          <Button
            size="sm"
            variant="outline"
            onClick={disconnectWifi}
            disabled={disconnecting}
            className="w-full border-destructive/50 text-destructive hover:bg-destructive/10 h-7"
          >
            {disconnecting
              ? <><Loader2 className="w-3 h-3 mr-1.5 animate-spin" />Disconnecting…</>
              : <><X className="w-3 h-3 mr-1.5" />Disconnect</>}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded border border-border bg-muted/10">
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border bg-muted/20">
        <Wifi className="w-4 h-4 text-primary" />
        <span className="text-xs font-bold text-foreground uppercase tracking-wider">Wireless</span>
      </div>

      <div className="p-4 space-y-3">
        {/* Scanning */}
        {phase === "scanning" && (
          <div className="flex flex-col items-center gap-2 py-5 text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin text-primary" />
            <p className="text-xs">Scanning network for ESP32…</p>
          </div>
        )}

        {/* Found devices */}
        {phase === "found" && (
          <div className="space-y-2">
            {devices.map(d => (
              <div
                key={d.ip}
                className="flex items-center justify-between gap-3 rounded border border-primary/30 bg-primary/5 px-3 py-2.5"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-2 h-2 rounded-full bg-chart-3 shrink-0 animate-pulse" />
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-foreground truncate">
                      {d.name ?? "GyroMonitor ESP32"}
                    </p>
                    <p className="text-[10px] font-mono text-muted-foreground">{d.ip}</p>
                  </div>
                </div>
                <Button
                  size="sm"
                  onClick={() => connect(d.ip)}
                  className="shrink-0 h-7 px-3 text-xs bg-primary hover:bg-primary/90 text-primary-foreground font-bold"
                >
                  <Zap className="w-3 h-3 mr-1" />Connect
                </Button>
              </div>
            ))}
            <button
              onClick={scan}
              className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors mt-1"
            >
              <RefreshCw className="w-2.5 h-2.5" /> Scan again
            </button>
          </div>
        )}

        {/* Connecting — waiting for TCP */}
        {phase === "connecting" && (
          <div className="flex flex-col items-center gap-3 py-5">
            <Loader2 className="w-5 h-5 animate-spin text-primary" />
            <p className="text-xs text-muted-foreground text-center">
              Waiting for ESP32 to connect…
            </p>
            <p className="text-[10px] text-muted-foreground/70 text-center max-w-[200px]">
              This takes a few seconds after the ESP32 boots.
            </p>
          </div>
        )}

        {/* Timeout — found but didn't connect in time */}
        {phase === "timeout" && (
          <div className="space-y-3">
            <div className="flex items-start gap-2.5 rounded border border-amber-500/30 bg-amber-500/5 px-3 py-2.5">
              <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="text-xs font-semibold text-amber-400">ESP32 not connecting back</p>
                <p className="text-[10px] text-muted-foreground">
                  The ESP32 was found on the network but didn't open a connection to this server.
                </p>
                {localIp && (
                  <p className="text-[10px] text-muted-foreground">
                    Make sure <span className="font-mono text-foreground">SERVER_IP</span> in the firmware is set to{" "}
                    <span className="font-mono font-semibold text-amber-400">{localIp}</span>
                    {" "}(this machine's current IP).
                  </p>
                )}
              </div>
            </div>
            <Button size="sm" variant="outline" onClick={scan} className="w-full">
              <RefreshCw className="w-3 h-3 mr-1.5" />Try again
            </Button>
          </div>
        )}

        {/* Server not reachable */}
        {phase === "servererror" && (
          <div className="space-y-3">
            <div className="flex items-start gap-2.5 rounded border border-destructive/30 bg-destructive/5 px-3 py-2.5">
              <AlertCircle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
              <div className="space-y-0.5">
                <p className="text-xs font-semibold text-destructive">API server not reachable</p>
                <p className="text-[10px] text-muted-foreground">
                  The local server isn't running. Start it from the <span className="font-semibold text-foreground">Desktop App Server</span> section below, then scan again.
                </p>
              </div>
            </div>
            <Button size="sm" variant="outline" onClick={scan} className="w-full">
              <RefreshCw className="w-3 h-3 mr-1.5" />Retry scan
            </Button>
          </div>
        )}

        {/* Not found */}
        {phase === "notfound" && (
          <div className="space-y-3">
            <div className="flex flex-col items-center gap-2 py-3 text-muted-foreground">
              <AlertCircle className="w-5 h-5" />
              <p className="text-xs text-center">No ESP32 found on this network</p>
            </div>

            {localIp && (
              <div className="flex items-start gap-2 rounded border border-border bg-muted/10 px-3 py-2">
                <Info className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" />
                <p className="text-[10px] text-muted-foreground leading-relaxed">
                  This machine's IP is{" "}
                  <span className="font-mono font-semibold text-foreground">{localIp}</span>.
                  {" "}Make sure <span className="font-mono text-foreground">SERVER_IP</span> in the firmware matches, then power-cycle the ESP32.
                </p>
              </div>
            )}

            {/* Manual IP connect */}
            <div className="space-y-2">
              <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">Connect by IP</p>
              <div className="flex gap-2">
                <Input
                  type="text"
                  placeholder="192.168.x.x"
                  value={manualIp}
                  onChange={e => setManualIp(e.target.value)}
                  className="h-8 text-xs font-mono border-border bg-background"
                />
                <Button
                  size="sm"
                  onClick={() => { if (manualIp.trim()) connect(manualIp.trim()); }}
                  disabled={!manualIp.trim()}
                  className="h-8 px-3 shrink-0 bg-primary hover:bg-primary/90 text-primary-foreground font-bold"
                >
                  <Zap className="w-3 h-3 mr-1" />Connect
                </Button>
              </div>
              <p className="text-[9px] text-muted-foreground/60 leading-relaxed">
                Enter the ESP32's IP (check your router's DHCP table or the ESP32's serial output).
                The ESP32 still needs the correct <span className="font-mono">SERVER_IP</span> to connect back.
              </p>
            </div>

            <Button size="sm" variant="outline" onClick={scan} className="w-full">
              <RefreshCw className="w-3 h-3 mr-1.5" />Scan again
            </Button>
          </div>
        )}

        {/* Idle fallback */}
        {phase === "idle" && (
          <Button size="sm" variant="outline" onClick={scan} className="w-full">
            <RefreshCw className="w-3 h-3 mr-1.5" />Scan for ESP32
          </Button>
        )}
      </div>
    </div>
  );
}

// ── USB Serial Section ────────────────────────────────────────────────────────

function SerialSection({ onConnected }: { onConnected?: () => void }) {
  const bridge = getSerialBridge();
  const { toast } = useToast();
  const [ports, setPorts] = useState<Array<{ path: string; manufacturer: string | null }>>([]);
  const [selectedPort, setSelectedPort] = useState("");
  const [baudRate] = useState(115200);
  const [status, setStatus] = useState<{ connected: boolean; port: string | null }>({ connected: false, port: null });
  const [scanning, setScanning] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [permitted, setPermitted] = useState(true);

  useEffect(() => {
    if (!bridge) return;
    void bridge.status().then(setStatus);
    const unsubClose = bridge.onClosed(d => {
      setStatus({ connected: false, port: null });
      toast({ title: "Serial port closed", description: `${d.port} disconnected`, variant: "destructive" });
    });
    const unsubErr = bridge.onError(d => {
      toast({ title: "Serial error", description: d.error, variant: "destructive" });
    });
    return () => { unsubClose(); unsubErr(); };
  }, []);

  const scan = useCallback(async () => {
    if (!bridge) return;
    setScanning(true);
    try {
      const list = await bridge.listPorts();
      setPermitted(WebSerialBridge.isPermitted());
      setPorts(list);
      if (list.length > 0 && !selectedPort) setSelectedPort(list[0].path);
    } finally {
      setScanning(false);
    }
  }, [bridge, selectedPort]);

  useEffect(() => {
    if (bridge) void scan();
  }, []);

  async function connect() {
    if (!bridge) return;
    setConnecting(true);
    try {
      const result = await bridge.connect(selectedPort, baudRate);
      if (result.ok) {
        setStatus({ connected: true, port: selectedPort || "Web Serial" });
        toast({ title: "ESP32 connected", description: `Live data from ${selectedPort || "Web Serial"}` });
        onConnected?.();
      } else {
        toast({ title: "Connection failed", description: result.error ?? "Unknown error", variant: "destructive" });
      }
    } finally {
      setConnecting(false);
    }
  }

  async function disconnect() {
    if (!bridge) return;
    await bridge.disconnect();
    setStatus({ connected: false, port: null });
    toast({ title: "Disconnected", description: "Serial port closed" });
  }

  if (!bridge) {
    return (
      <div className="rounded border border-border bg-muted/10">
        <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border bg-muted/20">
          <Cable className="w-4 h-4 text-muted-foreground" />
          <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">USB Serial</span>
        </div>
        <p className="px-4 py-3 text-[10px] text-muted-foreground">
          USB serial requires Chrome or Edge. Use Wi-Fi above for other browsers.
        </p>
      </div>
    );
  }

  if (!permitted) {
    return (
      <div className="rounded border border-amber-500/30 bg-amber-500/5">
        <div className="flex items-center gap-2 px-4 py-2.5 border-b border-amber-500/20">
          <ShieldAlert className="w-4 h-4 text-amber-400" />
          <span className="text-xs font-bold text-amber-400 uppercase tracking-wider">USB — Restricted</span>
        </div>
        <p className="px-4 py-3 text-[10px] text-muted-foreground">
          USB serial is blocked inside this preview. Open the app in a standalone browser tab (↗ button), or use Wi-Fi above.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded border border-border bg-muted/10">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-muted/20">
        <div className="flex items-center gap-2">
          <Cable className="w-4 h-4 text-primary" />
          <span className="text-xs font-bold text-foreground uppercase tracking-wider">USB Serial</span>
        </div>
        {status.connected && (
          <span className="flex items-center gap-1 text-[9px] font-mono text-chart-3">
            <CheckCircle2 className="w-3 h-3" />{status.port}
          </span>
        )}
      </div>

      <div className="p-4">
        {status.connected ? (
          <div className="space-y-3">
            <div className="flex items-center gap-3 rounded border border-chart-3/30 bg-chart-3/5 px-3 py-2.5">
              <CheckCircle2 className="w-4 h-4 text-chart-3 shrink-0" />
              <div>
                <p className="text-xs font-semibold text-chart-3">Hardware connected</p>
                <p className="text-[10px] font-mono text-muted-foreground">{status.port}</p>
              </div>
            </div>
            <Button
              size="sm" variant="outline" onClick={disconnect}
              className="w-full border-destructive/50 text-destructive hover:bg-destructive/10"
            >
              <X className="w-3 h-3 mr-1.5" />Disconnect
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            {/* Port selector */}
            <div className="flex gap-2">
              <select
                value={selectedPort}
                onChange={e => setSelectedPort(e.target.value)}
                className="flex-1 h-8 text-sm font-mono border border-border bg-background rounded px-2 text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              >
                {ports.length === 0 && <option value="">— no ports found —</option>}
                {ports.map(p => (
                  <option key={p.path} value={p.path}>
                    {p.path}{p.manufacturer ? ` (${p.manufacturer})` : ""}
                  </option>
                ))}
              </select>
              <Button
                size="sm" variant="outline" onClick={scan} disabled={scanning}
                className="shrink-0 px-2.5 h-8" title="Refresh ports"
              >
                <RefreshCw className={`w-3 h-3 ${scanning ? "animate-spin" : ""}`} />
              </Button>
            </div>

            <Button
              size="sm" onClick={connect}
              disabled={connecting || !selectedPort}
              className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-bold"
            >
              {connecting
                ? <><Loader2 className="w-3 h-3 mr-1.5 animate-spin" />Connecting…</>
                : <><Zap className="w-3 h-3 mr-1.5" />Connect</>}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Desktop App Server (advanced / collapsed) ─────────────────────────────────

function DesktopServerSection() {
  const bridge = getElectronBridge();
  const { toast } = useToast();
  const [expanded, setExpanded] = useState(false);
  const [host, setHost] = useState("127.0.0.1");
  const [port, setPort] = useState(5000);
  const [status, setStatus] = useState<{ running: boolean; pid: number | null; error?: string | null; logFile?: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!bridge) return;
    bridge.getServerConfig().then(cfg => { setHost(cfg.serverHost); setPort(cfg.serverPort); setLoaded(true); });
    bridge.getServerStatus().then(setStatus);
    const t = setInterval(() => bridge.getServerStatus().then(setStatus), 5000);
    return () => clearInterval(t);
  }, []);

  async function handleOpenLog() {
    if (!bridge) return;
    const result = await bridge.openServerLog();
    if (result.ok) {
      toast({ title: "Log file opened", description: result.logFile });
    }
  }

  if (!bridge) return null;

  async function handleSave() {
    if (!bridge) return;
    const portNum = Number(port);
    if (!host.trim() || isNaN(portNum) || portNum < 1 || portNum > 65535) {
      toast({ title: "Invalid address", description: "Check host and port.", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const result = await bridge.setServerConfig({ serverHost: host.trim(), serverPort: portNum });
      if (result.ok) {
        toast({ title: "Server config saved", description: `Restarting on ${host.trim()}:${portNum}` });
      } else {
        toast({ title: "Failed to save", description: result.error ?? "Unknown error", variant: "destructive" });
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded border border-border/50 bg-muted/5">
      <button
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-muted/20 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Monitor className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Desktop App Server</span>
          {status && (
            <span className={`flex items-center gap-1 text-[9px] font-mono ${status.running ? "text-chart-3" : "text-destructive"}`}>
              {status.running
                ? <><CheckCircle2 className="w-2.5 h-2.5" />running</>
                : <><AlertCircle className="w-2.5 h-2.5" />stopped</>}
            </span>
          )}
        </div>
        {expanded ? <ChevronUp className="w-3 h-3 text-muted-foreground" /> : <ChevronDown className="w-3 h-3 text-muted-foreground" />}
      </button>

      {expanded && (
        <div className="border-t border-border/50 p-4 space-y-3">
          {!loaded ? (
            <p className="text-[10px] text-muted-foreground">Loading…</p>
          ) : (
            <>
              {status && !status.running && status.error && (
                <div className="rounded border border-destructive/40 bg-destructive/10 px-2.5 py-2 space-y-1.5">
                  <p className="text-[10px] text-destructive leading-snug break-words">{status.error}</p>
                  <button
                    onClick={handleOpenLog}
                    className="text-[10px] font-semibold text-destructive underline underline-offset-2 hover:no-underline"
                  >
                    Open log file
                  </button>
                </div>
              )}
              <div className="flex items-center gap-2">
                <label className="text-[10px] text-muted-foreground shrink-0 w-20">Listen address</label>
                <Input type="text" value={host} onChange={e => setHost(e.target.value)} placeholder="127.0.0.1"
                  className="h-7 text-xs font-mono border-border bg-background focus-visible:ring-primary" />
              </div>
              <div className="flex items-center gap-2">
                <label className="text-[10px] text-muted-foreground shrink-0 w-20">Port</label>
                <Input type="number" value={port} onChange={e => setPort(Number(e.target.value))} min={1024} max={65535}
                  className="h-7 text-xs font-mono border-border bg-background focus-visible:ring-primary" />
              </div>
              <Button size="sm" onClick={handleSave} disabled={saving} className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-bold">
                {saving
                  ? <><RefreshCw className="w-3 h-3 mr-1.5 animate-spin" />Restarting…</>
                  : <><Save className="w-3 h-3 mr-1.5" />Save &amp; restart</>}
              </Button>
              {status?.logFile && (
                <button
                  onClick={handleOpenLog}
                  className="w-full text-[10px] text-muted-foreground hover:text-foreground text-center"
                >
                  View server log
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main dialog ───────────────────────────────────────────────────────────────

interface ConnectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ConnectDialog({ open, onOpenChange }: ConnectDialogProps) {
  const [tab, setTab] = useState<"wifi" | "usb">("wifi");

  function close() { onOpenChange(false); }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md bg-card border-border shadow-xl p-0 gap-0">
        <DialogHeader className="px-5 py-4 border-b border-border">
          <DialogTitle className="flex items-center gap-2 text-sm font-bold">
            <Usb className="w-4 h-4 text-primary" />
            Connect Hardware
          </DialogTitle>
        </DialogHeader>

        {/* Tabs */}
        <div className="flex border-b border-border px-5">
          {(["wifi", "usb"] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex items-center gap-1.5 py-2.5 px-3 text-xs font-semibold border-b-2 transition-colors -mb-px ${
                tab === t
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {t === "wifi" ? <Wifi className="w-3 h-3" /> : <Cable className="w-3 h-3" />}
              {t === "wifi" ? "Wi-Fi" : "USB"}
            </button>
          ))}
        </div>

        <div className="p-4 space-y-3">
          {tab === "wifi" && <WifiSection onConnected={close} />}
          {tab === "usb" && <SerialSection onConnected={close} />}
          <DesktopServerSection />
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── ESP32 Discovery Banner ────────────────────────────────────────────────────
// Non-modal floating card that background-scans every 10 s while hardware is
// disconnected. When a device is found it surfaces a prompt — the user must
// click Connect themselves. Modelled on the browser "new USB device detected"
// permission prompt.

// "pending" = ESP32 has TCP-connected to the server but awaits user acceptance
type BannerPhase = "hidden" | "found" | "pending" | "accepting" | "connecting" | "timeout" | "dismissed";

interface BannerState {
  phase: BannerPhase;
  devices: Esp32Device[];
  pendingIp: string | null;
  localIp: string | null;
}

export function Esp32DiscoveryBanner() {
  const hwStatus = useHardwareStatus();
  const hardwareConnected = Boolean(hwStatus?.connected);

  const [state, setState] = useState<BannerState>({ phase: "hidden", devices: [], pendingIp: null, localIp: null });
  const connectingRef = useRef(false);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const dismissedIpsRef = useRef<Set<string>>(new Set());

  // Background scan + pending-connection poll — runs while not connected
  useEffect(() => {
    if (hardwareConnected) {
      setState({ phase: "hidden", devices: [], pendingIp: null, localIp: null });
      return;
    }

    let scanTimer: ReturnType<typeof setInterval> | null = null;

    async function scan() {
      if (connectingRef.current) return;

      // ── 1. Check for a pending TCP connection first (highest priority) ──────
      try {
        const pr = await fetch(apiUrl("/api/wifi/pending"));
        if (pr.ok) {
          const pd = await pr.json() as { pending: { ip: string } | null };
          if (pd.pending && !dismissedIpsRef.current.has(pd.pending.ip)) {
            setState(prev => {
              if (prev.phase === "accepting") return prev;
              return { ...prev, phase: "pending", pendingIp: pd.pending!.ip };
            });
            return;
          }
        }
      } catch { /* ignore */ }

      // ── 2. mDNS / network discovery scan ────────────────────────────────────
      try {
        const res = await fetch(apiUrl("/api/discovery/esp32"));
        if (!res.ok) return;
        const data = await res.json() as { ok: boolean; devices?: Esp32Device[]; localIp?: string };
        const freshIp = data.localIp ?? null;
        if (data.ok && data.devices && data.devices.length > 0) {
          const newDevices = data.devices.filter(d => !dismissedIpsRef.current.has(d.ip));
          if (newDevices.length > 0) {
            setState(prev => {
              if (prev.phase === "pending" || prev.phase === "accepting") return prev;
              return { ...prev, phase: "found", devices: newDevices, localIp: freshIp ?? prev.localIp };
            });
            return;
          }
        }
        if (freshIp) setState(prev => ({ ...prev, localIp: freshIp }));
      } catch { /* ignore */ }
    }

    void scan();
    scanTimer = setInterval(() => void scan(), 3_000);
    return () => { if (scanTimer) clearInterval(scanTimer); };
  }, [hardwareConnected]);

  // When hardware finally activates (after Accept), hide the banner
  useEffect(() => {
    if (hardwareConnected) {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
      connectingRef.current = false;
      setState({ phase: "hidden", devices: [], pendingIp: null, localIp: null });
    }
  }, [hardwareConnected]);

  // Accept the pending TCP connection
  async function acceptPending() {
    if (connectingRef.current) return;
    connectingRef.current = true;
    setState(prev => ({ ...prev, phase: "accepting" }));
    try {
      await fetch(apiUrl("/api/wifi/accept"), { method: "POST" });
      // Banner hides itself once hardwareConnected becomes true (effect above)
    } catch {
      connectingRef.current = false;
      setState(prev => ({ ...prev, phase: "pending" }));
    }
  }

  // Reject / dismiss the pending TCP connection
  async function rejectPending() {
    const ip = state.pendingIp;
    if (ip) dismissedIpsRef.current.add(ip);
    connectingRef.current = false;
    setState(prev => ({ ...prev, phase: "hidden", pendingIp: null }));
    try { await fetch(apiUrl("/api/wifi/reject"), { method: "POST" }); } catch { /* ignore */ }
  }

  // "Connect" hint button (for "found" phase) — user has seen the device
  // via mDNS scan; clicking this just opens the banner detail so they know
  // what IP to expect. The ESP32 must still connect on its own.
  function connect(ip: string) {
    if (connectingRef.current) return;
    connectingRef.current = true;
    setState(prev => ({ ...prev, phase: "connecting" }));

    const deadline = Date.now() + 15_000;
    pollTimerRef.current = setInterval(async () => {
      // Check if pending connection appeared
      try {
        const pr = await fetch(apiUrl("/api/wifi/pending"));
        if (pr.ok) {
          const pd = await pr.json() as { pending: { ip: string } | null };
          if (pd.pending) {
            if (pollTimerRef.current) clearInterval(pollTimerRef.current);
            connectingRef.current = false;
            setState(prev => ({ ...prev, phase: "pending", pendingIp: pd.pending!.ip }));
            return;
          }
        }
      } catch { /* ignore */ }
      if (Date.now() >= deadline) {
        if (pollTimerRef.current) clearInterval(pollTimerRef.current);
        connectingRef.current = false;
        setState(prev => ({ ...prev, phase: "timeout" }));
      }
    }, 800);

    void ip;
  }

  function dismiss() {
    state.devices.forEach(d => dismissedIpsRef.current.add(d.ip));
    if (state.pendingIp) dismissedIpsRef.current.add(state.pendingIp);
    if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    connectingRef.current = false;
    setState(prev => ({ ...prev, phase: "dismissed" }));
    // If there was a pending connection, reject it
    if (state.phase === "pending") {
      void fetch(apiUrl("/api/wifi/reject"), { method: "POST" }).catch(() => {});
    }
  }

  if (state.phase === "hidden" || state.phase === "dismissed") return null;

  const device = state.devices[0];
  const isPendingPhase = state.phase === "pending" || state.phase === "accepting";

  return (
    <div className="fixed top-4 right-4 z-50 w-[22rem] rounded-lg border border-primary/40 bg-card shadow-2xl shadow-black/30 overflow-hidden">
      {/* Header */}
      <div className={`flex items-center gap-2.5 px-4 py-2.5 border-b ${isPendingPhase ? "bg-chart-3/10 border-chart-3/20" : "bg-primary/10 border-primary/20"}`}>
        <div className="relative shrink-0">
          <Wifi className={`w-4 h-4 ${isPendingPhase ? "text-chart-3" : "text-primary"}`} />
          <span className={`absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full animate-pulse ${isPendingPhase ? "bg-chart-3" : "bg-chart-3"}`} />
        </div>
        <span className="flex-1 text-xs font-bold text-foreground">
          {isPendingPhase ? "ESP32 wants to connect" : "ESP32 device found"}
        </span>
        {!isPendingPhase && (
          <button
            onClick={dismiss}
            className="text-muted-foreground hover:text-foreground transition-colors p-0.5 rounded"
            aria-label="Dismiss"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      <div className="p-4 space-y-3">

        {/* ── Pending — ESP32 connected, waiting for user approval ── */}
        {isPendingPhase && (
          <>
            <div className="flex items-center gap-3 rounded border border-chart-3/30 bg-chart-3/5 px-3 py-2.5">
              <div className="w-2 h-2 rounded-full bg-chart-3 shrink-0 animate-pulse" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-foreground">ESP32 at {state.pendingIp}</p>
                <p className="text-[10px] text-muted-foreground">TCP connection waiting for approval</p>
              </div>
            </div>
            {state.phase === "accepting" ? (
              <div className="flex flex-col items-center gap-2 py-2">
                <Loader2 className="w-4 h-4 animate-spin text-chart-3" />
                <p className="text-xs text-muted-foreground">Activating connection…</p>
              </div>
            ) : (
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={() => void acceptPending()}
                  className="flex-1 h-8 bg-chart-3 hover:bg-chart-3/90 text-white font-bold text-xs"
                >
                  <Zap className="w-3 h-3 mr-1.5" />Accept
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void rejectPending()}
                  className="h-8 px-3 text-xs border-destructive/40 text-destructive hover:bg-destructive/10"
                >
                  Reject
                </Button>
              </div>
            )}
          </>
        )}

        {/* ── Found — device on network, not yet connected ── */}
        {state.phase === "found" && device && (
          <>
            <div className="flex items-center gap-3 rounded border border-border bg-muted/10 px-3 py-2.5">
              <div className="w-2 h-2 rounded-full bg-chart-3 shrink-0 animate-pulse" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-foreground truncate">
                  {device.name ?? "GyroMonitor ESP32"}
                </p>
                <p className="text-[10px] font-mono text-muted-foreground">{device.ip}</p>
              </div>
            </div>

            {state.localIp && (
              <div className="flex items-start gap-2 rounded border border-border bg-muted/5 px-2.5 py-2">
                <Info className="w-3 h-3 text-primary shrink-0 mt-0.5" />
                <p className="text-[10px] text-muted-foreground leading-relaxed">
                  This machine's IP is{" "}
                  <span className="font-mono font-semibold text-foreground">{state.localIp}</span>.{" "}
                  Make sure <span className="font-mono text-foreground">SERVER_IP</span> in the firmware
                  matches, then power-cycle the ESP32.
                </p>
              </div>
            )}

            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={() => connect(device.ip)}
                className="flex-1 h-8 bg-primary hover:bg-primary/90 text-primary-foreground font-bold text-xs"
              >
                <Zap className="w-3 h-3 mr-1.5" />Waiting…
              </Button>
              <Button size="sm" variant="outline" onClick={dismiss} className="h-8 px-3 text-xs">
                Dismiss
              </Button>
            </div>
          </>
        )}

        {/* ── Connecting ── */}
        {state.phase === "connecting" && (
          <div className="flex flex-col items-center gap-2.5 py-3">
            <Loader2 className="w-5 h-5 animate-spin text-primary" />
            <p className="text-xs text-muted-foreground text-center">Waiting for ESP32 to connect…</p>
            <p className="text-[10px] text-muted-foreground/70 text-center max-w-[200px]">
              The ESP32 connects back to this server. Takes a few seconds after boot.
            </p>
          </div>
        )}

        {/* ── Timeout ── */}
        {state.phase === "timeout" && (
          <div className="space-y-3">
            <div className="flex items-start gap-2.5 rounded border border-amber-500/30 bg-amber-500/5 px-3 py-2.5">
              <AlertCircle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="text-xs font-semibold text-amber-400">ESP32 not connecting back</p>
                <p className="text-[10px] text-muted-foreground">
                  Device was found on the network but didn't open a TCP connection to this server.
                </p>
                {state.localIp && (
                  <p className="text-[10px] text-muted-foreground">
                    This machine's IP is{" "}
                    <span className="font-mono font-semibold text-foreground">{state.localIp}</span>.{" "}
                    Make sure <span className="font-mono text-foreground">SERVER_IP</span> in the firmware
                    matches, then power-cycle the ESP32.
                  </p>
                )}
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setState(prev => ({ ...prev, phase: "found" }))}
                className="flex-1 h-8 text-xs"
              >
                <RefreshCw className="w-3 h-3 mr-1.5" />Try again
              </Button>
              <Button size="sm" variant="outline" onClick={dismiss} className="h-8 px-3 text-xs">
                Dismiss
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Auto-detect hook ──────────────────────────────────────────────────────────

export function useAutoConnectDialog(): [boolean, (v: boolean) => void] {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const bridge = getSerialBridge();
    let prevCount = -1;
    let timer: ReturnType<typeof setInterval> | undefined;

    if (bridge) {
      async function poll() {
        if (!bridge) return;
        try {
          const ports = await bridge.listPorts();
          if (prevCount >= 0 && ports.length > prevCount) setOpen(true);
          prevCount = ports.length;
        } catch { /* ignore */ }
      }
      void poll();
      timer = setInterval(poll, 3000);
    }

    const nav = navigator as unknown as { usb?: { addEventListener: (e: string, cb: () => void) => void; removeEventListener: (e: string, cb: () => void) => void } };
    function onUsbConnect() { setOpen(true); }
    nav.usb?.addEventListener("connect", onUsbConnect);

    return () => {
      if (timer) clearInterval(timer);
      nav.usb?.removeEventListener("connect", onUsbConnect);
    };
  }, []);

  return [open, setOpen];
}
