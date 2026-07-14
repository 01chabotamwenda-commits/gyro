import React, { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  useGetSettings,
  useUpdateSettings,
  useGetConnectivity,
  useGetConnectivityConfig,
  useUpdateConnectivityConfig,
  useGetSession,
  getGetSettingsQueryKey,
  getGetConnectivityQueryKey,
  getGetConnectivityConfigQueryKey,
} from "@workspace/api-client-react";
import type { ConnectivityConfigInput } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from "@/components/ui/form";
import { ArrowLeft, Save, Wifi, Bluetooth, Eye, EyeOff, Signal, Monitor, RefreshCw, CheckCircle2, AlertCircle, Usb, Zap, X, ChevronDown, ChevronUp, BookOpen, ShieldAlert, Gauge, Radio, HardDrive, Cpu, MonitorDot, Sun, Moon, Info, Lock } from "lucide-react";
import { AlertBehaviorSettings } from "@/components/AlertBehaviorSettings";
import { Link } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { useTheme } from "@/hooks/use-theme";
import { SdCardPanel } from "@/components/SdCardPanel";
import { FirmwarePanel } from "@/components/FirmwarePanel";

// ─── Types for the Electron bridge ───────────────────────────────────────────

interface ElectronBridge {
  isElectron: true;
  getServerConfig: () => Promise<{ serverHost: string; serverPort: number }>;
  setServerConfig: (c: { serverHost: string; serverPort: number }) => Promise<{ ok: boolean; error?: string }>;
  getServerStatus: () => Promise<{ running: boolean; pid: number | null }>;
}

function getElectronBridge(): ElectronBridge | null {
  const w = window as unknown as { electronBridge?: ElectronBridge };
  return w.electronBridge?.isElectron ? w.electronBridge : null;
}

// ─── Desktop server panel ─────────────────────────────────────────────────────

function DesktopServerPanel() {
  const bridge = getElectronBridge();
  const { toast } = useToast();
  const [host, setHost] = useState("127.0.0.1");
  const [port, setPort] = useState(5000);
  const [status, setStatus] = useState<{ running: boolean; pid: number | null } | null>(null);
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!bridge) return;
    bridge.getServerConfig().then(cfg => {
      setHost(cfg.serverHost);
      setPort(cfg.serverPort);
      setLoaded(true);
    });
    bridge.getServerStatus().then(setStatus);
    const t = setInterval(() => bridge.getServerStatus().then(setStatus), 5000);
    return () => clearInterval(t);
  }, []);

  async function handleSave() {
    if (!bridge) return;
    // Basic validation
    const portNum = Number(port);
    if (!host.trim() || isNaN(portNum) || portNum < 1 || portNum > 65535) {
      toast({ title: "Invalid address", description: "Check the host and port values.", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const result = await bridge.setServerConfig({ serverHost: host.trim(), serverPort: portNum });
      if (result.ok) {
        toast({ title: "Server config saved", description: `Restarting on ${host.trim()}:${portNum} — window will reload.` });
      } else {
        toast({ title: "Failed to save", description: result.error ?? "Unknown error", variant: "destructive" });
      }
    } catch (e) {
      toast({ title: "IPC error", description: String(e), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  // In a browser (not Electron), show a subtle placeholder
  if (!bridge) {
    return (
      <Card className="bg-card border-border/70 shadow-sm opacity-60">
        <CardHeader className="py-3 px-4 border-b border-border/70 bg-muted/30">
          <CardTitle className="text-xs font-bold tracking-wider text-muted-foreground uppercase flex items-center gap-2">
            <Monitor className="w-3.5 h-3.5" />
            Desktop App Server
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4">
          <p className="text-[10px] text-muted-foreground">
            Only available when running as an Electron desktop app. In the browser, the API server address is managed by the Replit proxy.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-card border-border/70 shadow-sm">
      <CardHeader className="py-3 px-4 border-b border-border/70 bg-muted/30">
        <CardTitle className="text-xs font-bold tracking-wider text-muted-foreground uppercase flex items-center gap-2">
          <Monitor className="w-3.5 h-3.5" />
          Desktop App Server
          {status && (
            <span className={`ml-auto flex items-center gap-1 text-[9px] font-mono normal-case ${status.running ? "text-chart-3" : "text-destructive"}`}>
              {status.running
                ? <><CheckCircle2 className="w-2.5 h-2.5" /> running (PID {status.pid})</>
                : <><AlertCircle className="w-2.5 h-2.5" /> stopped</>}
            </span>
          )}
        </CardTitle>
        <p className="text-[11px] text-muted-foreground mt-0.5">
          Configure the address the embedded API server listens on. Default is <span className="font-mono">127.0.0.1:5000</span> (loopback only).
          Change to <span className="font-mono">0.0.0.0</span> to accept connections from other devices on the network.
        </p>
      </CardHeader>
      <CardContent className="p-4 space-y-4">
        {!loaded ? (
          <p className="text-[10px] text-muted-foreground">Loading…</p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-4 items-start">
              <div>
                <label className="text-xs font-semibold text-foreground block mb-1">Listen address</label>
                <p className="text-[10px] text-muted-foreground leading-tight">
                  IP the server binds to.<br />
                  <span className="font-mono">127.0.0.1</span> = this machine only<br />
                  <span className="font-mono">0.0.0.0</span> = all network interfaces
                </p>
              </div>
              <Input
                type="text"
                autoComplete="off"
                value={host}
                onChange={e => setHost(e.target.value)}
                placeholder="127.0.0.1"
                className="h-8 text-sm font-mono border-border bg-background focus-visible:ring-primary"
              />
            </div>

            <div className="grid grid-cols-2 gap-4 items-start">
              <div>
                <label className="text-xs font-semibold text-foreground block mb-1">Port</label>
                <p className="text-[10px] text-muted-foreground leading-tight">
                  TCP port for the API server.<br />Default: <span className="font-mono">5000</span>
                </p>
              </div>
              <Input
                type="number"
                value={port}
                onChange={e => setPort(Number(e.target.value))}
                min={1024}
                max={65535}
                className="h-8 text-sm font-mono border-border bg-background focus-visible:ring-primary"
              />
            </div>

            <div className="bg-muted/20 border border-border/60 rounded px-3 py-2">
              <p className="text-[10px] text-muted-foreground">
                <span className="text-foreground font-medium">Current:</span>{" "}
                <span className="font-mono">{host}:{port}</span>
                {" "}·{" "}
                API: <span className="font-mono">http://{host}:{port}/api</span>
                {" "}·{" "}
                WebSocket: <span className="font-mono">ws://{host}:{port}/api/ws</span>
              </p>
            </div>

            <div className="pt-1 border-t border-border/40 flex items-center gap-3">
              <Button
                size="sm"
                onClick={handleSave}
                disabled={saving}
                className="bg-primary hover:bg-primary/90 text-primary-foreground font-bold px-4"
              >
                {saving
                  ? <><RefreshCw className="w-3 h-3 mr-1.5 animate-spin" />Restarting…</>
                  : <><Save className="w-3 h-3 mr-1.5" />Save &amp; restart server</>}
              </Button>
              <p className="text-[9px] text-muted-foreground">
                Saving kills the current server process, starts a new one on the new address, and reloads the window.
              </p>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Serial device panel (ESP32 USB) ─────────────────────────────────────────

interface SerialBridge {
  listPorts: () => Promise<Array<{ path: string; manufacturer: string | null }>>;
  connect: (port: string, baudRate?: number) => Promise<{ ok: boolean; error?: string }>;
  disconnect: () => Promise<{ ok: boolean }>;
  status: () => Promise<{ connected: boolean; port: string | null }>;
  send: (cmd: object) => Promise<{ ok: boolean; error?: string }>;
  onClosed: (cb: (d: { port: string }) => void) => () => void;
  onError: (cb: (d: { port: string; error: string }) => void) => () => void;
}

function getSerialBridge(): SerialBridge | null {
  const w = window as unknown as { serialBridge?: SerialBridge };
  return w.serialBridge ?? null;
}

function SerialDevicePanel() {
  const bridge = getSerialBridge();
  const { toast } = useToast();
  const [ports, setPorts] = React.useState<Array<{ path: string; manufacturer: string | null }>>([]);
  const [selectedPort, setSelectedPort] = React.useState("");
  const [baudRate, setBaudRate] = React.useState(115200);
  const [status, setStatus] = React.useState<{ connected: boolean; port: string | null }>({ connected: false, port: null });
  const [scanning, setScanning] = React.useState(false);
  const [connecting, setConnecting] = React.useState(false);

  useEffect(() => {
    if (!bridge) return;
    bridge.status().then(setStatus);
    const poll = setInterval(() => bridge.status().then(setStatus), 2000);
    const unsubClose = bridge.onClosed((d) => {
      setStatus({ connected: false, port: null });
      toast({ title: "Serial port closed", description: `${d.port} disconnected — reconnect ESP32 to resume data`, variant: "destructive" });
    });
    const unsubErr = bridge.onError((d) => {
      toast({ title: "Serial error", description: d.error, variant: "destructive" });
    });
    return () => { clearInterval(poll); unsubClose(); unsubErr(); };
  }, []);

  async function scan() {
    if (!bridge) return;
    setScanning(true);
    try {
      const list = await bridge.listPorts();
      setPorts(list);
      if (list.length > 0 && !selectedPort) setSelectedPort(list[0].path);
    } finally {
      setScanning(false);
    }
  }

  async function connect() {
    if (!bridge || !selectedPort) return;
    setConnecting(true);
    try {
      const result = await bridge.connect(selectedPort, baudRate);
      if (result.ok) {
        setStatus({ connected: true, port: selectedPort });
        toast({ title: "ESP32 connected", description: `Live data from ${selectedPort} at ${baudRate.toLocaleString()} baud` });
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
    toast({ title: "Disconnected", description: "Serial port closed — reconnect ESP32 to resume data" });
  }

  if (!bridge) {
    return (
      <Card className="bg-card border-border/70 shadow-sm opacity-60">
        <CardHeader className="py-3 px-4 border-b border-border/70 bg-muted/30">
          <CardTitle className="text-xs font-bold tracking-wider text-muted-foreground uppercase flex items-center gap-2">
            <Usb className="w-3.5 h-3.5" />
            Serial Device (ESP32)
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4">
          <p className="text-[10px] text-muted-foreground">
            USB serial access is only available in the Electron desktop app. In the browser, no sensor data is available until an ESP32 connects.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-card border-border/70 shadow-sm">
      <CardHeader className="py-3 px-4 border-b border-border/70 bg-muted/30">
        <CardTitle className="text-xs font-bold tracking-wider text-muted-foreground uppercase flex items-center gap-2">
          <Usb className="w-3.5 h-3.5" />
          Serial Device (ESP32)
          {status.connected && (
            <span className="ml-auto flex items-center gap-1 text-[9px] font-mono normal-case text-chart-3">
              <CheckCircle2 className="w-2.5 h-2.5" /> {status.port}
            </span>
          )}
        </CardTitle>
        <p className="text-[11px] text-muted-foreground mt-0.5">
          Connect your ESP32 via USB. Sensor data will appear once a device is connected.
        </p>
      </CardHeader>
      <CardContent className="p-4 space-y-4">
        {status.connected ? (
          <div className="space-y-3">
            <div className="bg-chart-3/10 border border-chart-3/30 rounded px-3 py-2 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-chart-3 shrink-0" />
              <div>
                <p className="text-xs font-semibold text-chart-3">Hardware mode active</p>
                <p className="text-[10px] text-muted-foreground">
                  Receiving data from <span className="font-mono">{status.port}</span>
                </p>
              </div>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={disconnect}
              className="w-full border-destructive/50 text-destructive hover:bg-destructive/10"
            >
              <X className="w-3 h-3 mr-1.5" /> Disconnect
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-4 items-start">
              <div>
                <label className="text-xs font-semibold text-foreground block mb-1">COM Port</label>
                <p className="text-[10px] text-muted-foreground leading-tight">
                  USB serial port the ESP32 is on. Click scan to detect.
                </p>
              </div>
              <div className="flex gap-1.5">
                <select
                  value={selectedPort}
                  onChange={e => setSelectedPort(e.target.value)}
                  className="flex-1 h-8 text-sm font-mono border border-border bg-background rounded px-2 text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  {ports.length === 0 && <option value="">— scan first —</option>}
                  {ports.map(p => (
                    <option key={p.path} value={p.path}>
                      {p.path}{p.manufacturer ? ` (${p.manufacturer})` : ""}
                    </option>
                  ))}
                </select>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={scan}
                  disabled={scanning}
                  className="shrink-0 px-2 h-8"
                  title="Scan for ports"
                >
                  <RefreshCw className={`w-3 h-3 ${scanning ? "animate-spin" : ""}`} />
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 items-start">
              <div>
                <label className="text-xs font-semibold text-foreground block mb-1">Baud rate</label>
                <p className="text-[10px] text-muted-foreground leading-tight">
                  Must match <code className="font-mono text-foreground">Serial.begin()</code> in the firmware.
                </p>
              </div>
              <select
                value={baudRate}
                onChange={e => setBaudRate(Number(e.target.value))}
                className="h-8 text-sm font-mono border border-border bg-background rounded px-2 text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              >
                {[9600, 19200, 38400, 57600, 115200, 230400, 460800].map(b => (
                  <option key={b} value={b}>{b.toLocaleString()}</option>
                ))}
              </select>
            </div>

            <Button
              size="sm"
              onClick={connect}
              disabled={connecting || !selectedPort}
              className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-bold"
            >
              {connecting
                ? <><RefreshCw className="w-3 h-3 mr-1.5 animate-spin" />Connecting…</>
                : <><Zap className="w-3 h-3 mr-1.5" />Connect to ESP32</>}
            </Button>

            {ports.length > 0 && (
              <div className="border border-border/40 rounded p-2 space-y-1">
                <p className="text-[9px] text-muted-foreground uppercase tracking-wider">Detected ports</p>
                {ports.map(p => (
                  <button
                    key={p.path}
                    onClick={() => setSelectedPort(p.path)}
                    className={`w-full text-left flex items-baseline gap-2 px-2 py-1 rounded text-[10px] transition-colors ${selectedPort === p.path ? "bg-primary/10 text-primary" : "hover:bg-muted/40 text-foreground"}`}
                  >
                    <span className="font-mono">{p.path}</span>
                    {p.manufacturer && <span className="text-muted-foreground truncate">{p.manufacturer}</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

type ConnMode = "usb" | "wifi_sta" | "wifi_ap" | "ble" | "none";

const MODES: { value: ConnMode; label: string; icon: React.ReactNode }[] = [
  { value: "usb",     label: "USB Serial",    icon: <Usb className="w-3 h-3" /> },
  { value: "wifi_sta", label: "WiFi Station", icon: <Wifi className="w-3 h-3" /> },
  { value: "wifi_ap", label: "WiFi Hotspot",  icon: <Signal className="w-3 h-3" /> },
  { value: "ble",     label: "Bluetooth BLE", icon: <Bluetooth className="w-3 h-3" /> },
];

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between py-1.5 border-b border-border/50 last:border-0">
      <span className="text-[10px] text-muted-foreground uppercase tracking-wider shrink-0 mr-4">{label}</span>
      <span className="text-xs font-mono text-foreground text-right">{value}</span>
    </div>
  );
}

function formatUptime(s: number) {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${m}m ${sec}s`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
}

function ConnectivitySection({ saveRef }: { saveRef: React.RefObject<(() => void) | null> }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: status } = useGetConnectivity({
    query: { refetchInterval: 3000, queryKey: getGetConnectivityQueryKey() },
  });
  const { data: config } = useGetConnectivityConfig({
    query: { queryKey: getGetConnectivityConfigQueryKey() },
  });
  const updateConfig = useUpdateConnectivityConfig();

  const [mode, setMode] = useState<ConnMode>("usb");
  const [wifiSsid, setWifiSsid] = useState("");
  const [wifiPassword, setWifiPassword] = useState("");
  const [showWifiPw, setShowWifiPw] = useState(false);
  const [wifiUseStaticIp, setWifiUseStaticIp] = useState(false);
  const [wifiStaticIp, setWifiStaticIp] = useState("");
  const [wifiSubnet, setWifiSubnet] = useState("255.255.255.0");
  const [wifiGateway, setWifiGateway] = useState("");
  const [apSsid, setApSsid] = useState("GyroMonitor");
  const [apPassword, setApPassword] = useState("");
  const [showApPw, setShowApPw] = useState(false);
  const [apChannel, setApChannel] = useState(6);
  const [apMaxConn, setApMaxConn] = useState(4);
  const [bleName, setBleName] = useState("GyroMonitor");
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (config && !loaded) {
      setMode(config.mode as ConnMode);
      setWifiSsid(config.wifiSsid);
      setWifiUseStaticIp(config.wifiUseStaticIp);
      setWifiStaticIp(config.wifiStaticIp ?? "");
      setWifiSubnet(config.wifiSubnet ?? "255.255.255.0");
      setWifiGateway(config.wifiGateway ?? "");
      setApSsid(config.apSsid);
      setApChannel(config.apChannel);
      setApMaxConn(config.apMaxConn);
      setBleName(config.bleName);
      setLoaded(true);
    }
  }, [config, loaded]);

  React.useEffect(() => { saveRef.current = handleApply; });

  function handleApply() {
    const payload: ConnectivityConfigInput = { mode };
    if (mode === "wifi_sta") {
      payload.wifiSsid = wifiSsid;
      if (wifiPassword.length > 0) payload.wifiPassword = wifiPassword;
      payload.wifiUseStaticIp = wifiUseStaticIp;
      if (wifiUseStaticIp) {
        payload.wifiStaticIp = wifiStaticIp;
        payload.wifiSubnet = wifiSubnet;
        payload.wifiGateway = wifiGateway;
      }
    } else if (mode === "wifi_ap") {
      payload.apSsid = apSsid;
      if (apPassword.length > 0) payload.apPassword = apPassword;
      payload.apChannel = apChannel;
      payload.apMaxConn = apMaxConn;
    } else if (mode === "ble") {
      payload.bleName = bleName;
    }

    updateConfig.mutate(
      { data: payload },
      {
        onSuccess: () => {
          setWifiPassword("");
          setApPassword("");
          queryClient.invalidateQueries({ queryKey: getGetConnectivityQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetConnectivityConfigQueryKey() });
          toast({
            title: "Connection settings saved",
            description:
              mode === "usb"
                ? "USB mode recorded. Connect the device from the Serial panel above."
                : "Server expects the ESP32 in this mode. The ESP32 firmware must independently be configured to match.",
          });
        },
        onError: () => {
          toast({ title: "Failed to apply settings", variant: "destructive" });
        },
      }
    );
  }

  const fieldClass = "h-8 text-sm font-mono border-border bg-background focus-visible:ring-primary";
  const labelClass = "text-xs font-semibold text-foreground";
  const descClass = "text-[10px] text-muted-foreground mt-0.5 leading-tight";

  return (
    <Card className="bg-card border-border/70 shadow-sm">
      <CardHeader className="py-3 px-4 border-b border-border/70 bg-muted/30">
        <CardTitle className="text-xs font-bold tracking-wider text-muted-foreground uppercase">
          Device Connection
        </CardTitle>
        <p className="text-[11px] text-muted-foreground mt-0.5">
          ESP32 wireless link used to stream sensor data to this dashboard.
        </p>
      </CardHeader>

      <CardContent className="p-0">
        <form onSubmit={(e) => { e.preventDefault(); handleApply(); }}>
        <div className="flex min-h-0">

          {/* ── Left: mode selector + config fields ── */}
          <div className="flex-1 min-w-0 p-4 space-y-4">

            {/* Mode selector */}
            <div>
              <p className={labelClass + " mb-2"}>Connection mode</p>
              <div className="flex gap-1 p-1 bg-muted/40 rounded border border-border/60">
                {MODES.map((m) => (
                  <button
                    key={m.value}
                    type="button"
                    onClick={() => setMode(m.value)}
                    className={`flex-1 flex items-center justify-center gap-1.5 text-xs py-1.5 px-2 rounded transition-colors ${
                      mode === m.value
                        ? "bg-card text-foreground font-semibold shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {m.icon}
                    {m.label}
                  </button>
                ))}
              </div>
            </div>

            {/* USB mode — no config, just a pointer */}
            {mode === "usb" && (
              <div className="rounded border border-border/60 bg-muted/20 p-3 space-y-1.5">
                <p className="text-xs font-semibold text-foreground flex items-center gap-2">
                  <Usb className="w-3.5 h-3.5 text-muted-foreground" />
                  USB Serial (primary mode)
                </p>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  USB connections are managed by the <span className="text-foreground font-semibold">Serial Device</span> panel at the top of this page.
                  Select a port, click <span className="font-semibold">Connect</span>, and data will stream automatically.
                </p>
                <p className="text-[10px] text-muted-foreground leading-relaxed">
                  No additional configuration is needed here for USB mode.
                </p>
              </div>
            )}

            {/* WiFi/BLE note banner */}
            {(mode === "wifi_sta" || mode === "wifi_ap" || mode === "ble") && (
              <div className="rounded border border-amber-500/30 bg-amber-500/5 p-2.5 flex gap-2">
                <Info className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
                <p className="text-[10px] text-muted-foreground leading-relaxed">
                  <span className="font-semibold text-foreground">These settings record what the server expects</span> — they do not configure the ESP32 hardware.
                  Your ESP32 firmware must independently be compiled or configured to use the same mode and credentials.
                </p>
              </div>
            )}

            {/* WiFi Station fields */}
            {mode === "wifi_sta" && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-4 items-start">
                  <div>
                    <p className={labelClass}>Network name (SSID)</p>
                    <p className={descClass}>The WiFi network the ESP32 joins</p>
                  </div>
                  <Input
                    autoComplete="username"
                    value={wifiSsid}
                    onChange={(e) => setWifiSsid(e.target.value)}
                    placeholder="e.g. Lab-WiFi-5G"
                    className={fieldClass}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4 items-start">
                  <div>
                    <p className={labelClass}>Password</p>
                    <p className={descClass}>
                      {config?.wifiPasswordSet
                        ? "A password is stored — leave blank to keep it"
                        : "WPA2 password for the network"}
                    </p>
                  </div>
                  <div className="relative">
                    <Input
                      type={showWifiPw ? "text" : "password"}
                      autoComplete="new-password"
                      value={wifiPassword}
                      onChange={(e) => setWifiPassword(e.target.value)}
                      placeholder={config?.wifiPasswordSet ? "••••••••" : "Enter password"}
                      className={fieldClass + " pr-8"}
                    />
                    <button
                      type="button"
                      onClick={() => setShowWifiPw((v) => !v)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {showWifiPw ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 items-center">
                  <div>
                    <p className={labelClass}>Use static IP address</p>
                    <p className={descClass}>Off = use DHCP (recommended)</p>
                  </div>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={wifiUseStaticIp}
                      onChange={(e) => setWifiUseStaticIp(e.target.checked)}
                      className="accent-primary"
                    />
                    <span className="text-xs text-muted-foreground">{wifiUseStaticIp ? "Enabled" : "Disabled"}</span>
                  </label>
                </div>

                {wifiUseStaticIp && (
                  <div className="pl-3 border-l-2 border-border space-y-2">
                    {[
                      { label: "Static IP", placeholder: "192.168.1.42", value: wifiStaticIp, set: setWifiStaticIp },
                      { label: "Subnet mask", placeholder: "255.255.255.0", value: wifiSubnet, set: setWifiSubnet },
                      { label: "Gateway", placeholder: "192.168.1.1", value: wifiGateway, set: setWifiGateway },
                    ].map((f) => (
                      <div key={f.label} className="grid grid-cols-2 gap-4 items-center">
                        <p className="text-xs text-foreground">{f.label}</p>
                        <Input
                          value={f.value}
                          onChange={(e) => f.set(e.target.value)}
                          placeholder={f.placeholder}
                          className={fieldClass}
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* WiFi AP fields */}
            {mode === "wifi_ap" && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-4 items-start">
                  <div>
                    <p className={labelClass}>Hotspot name (SSID)</p>
                    <p className={descClass}>Name of the network the ESP32 broadcasts</p>
                  </div>
                  <Input
                    autoComplete="username"
                    value={apSsid}
                    onChange={(e) => setApSsid(e.target.value)}
                    placeholder="GyroMonitor"
                    className={fieldClass}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4 items-start">
                  <div>
                    <p className={labelClass}>Hotspot password</p>
                    <p className={descClass}>Min 8 characters (WPA2). Leave blank for open</p>
                  </div>
                  <div className="relative">
                    <Input
                      type={showApPw ? "text" : "password"}
                      autoComplete="new-password"
                      value={apPassword}
                      onChange={(e) => setApPassword(e.target.value)}
                      placeholder="Leave blank to keep current"
                      className={fieldClass + " pr-8"}
                    />
                    <button
                      type="button"
                      onClick={() => setShowApPw((v) => !v)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {showApPw ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 items-start">
                  <div>
                    <p className={labelClass}>Channel</p>
                    <p className={descClass}>WiFi channel 1 – 13</p>
                  </div>
                  <Input
                    type="number"
                    min={1}
                    max={13}
                    value={apChannel}
                    onChange={(e) => setApChannel(Number(e.target.value))}
                    className={fieldClass}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4 items-start">
                  <div>
                    <p className={labelClass}>Max connections</p>
                    <p className={descClass}>Maximum simultaneous clients (1 – 5)</p>
                  </div>
                  <Input
                    type="number"
                    min={1}
                    max={5}
                    value={apMaxConn}
                    onChange={(e) => setApMaxConn(Number(e.target.value))}
                    className={fieldClass}
                  />
                </div>

                <p className="text-[10px] text-muted-foreground bg-muted/30 rounded p-2 border border-border/50">
                  In hotspot mode the ESP32 creates its own network at <span className="font-mono">192.168.4.1</span>.
                  Connect your laptop or phone to the ESP32 hotspot to reach the dashboard.
                </p>
              </div>
            )}

            {/* BLE fields */}
            {mode === "ble" && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-4 items-start">
                  <div>
                    <p className={labelClass}>Device name</p>
                    <p className={descClass}>Name advertised over Bluetooth</p>
                  </div>
                  <Input
                    autoComplete="off"
                    value={bleName}
                    onChange={(e) => setBleName(e.target.value)}
                    placeholder="GyroMonitor"
                    className={fieldClass}
                  />
                </div>
                <p className="text-[10px] text-muted-foreground bg-muted/30 rounded p-2 border border-border/50">
                  BLE uses GATT service UUID <span className="font-mono">0x181A</span> (Environmental Sensing).
                  The characteristic UUID for readings is auto-assigned. Pair via your OS Bluetooth settings or a BLE scanner app.
                </p>
              </div>
            )}
          </div>

          {/* ── Divider ── */}
          <div className="w-px bg-border/60 shrink-0" />

          {/* ── Right: device status + apply button ── */}
          <div className="w-72 shrink-0 p-4 flex flex-col gap-4">
            {status ? (
              <>
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2">Device status</p>
                  <div className="bg-muted/20 rounded border border-border/60 px-3 py-1">
                    <InfoRow
                      label="Status"
                      value={
                        <span className={`flex items-center gap-1.5 justify-end ${status.connected ? "text-chart-3" : "text-muted-foreground"}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${status.connected ? "bg-chart-3" : "bg-muted-foreground"}`} />
                          {status.connected ? "Connected" : "Not connected"}
                        </span>
                      }
                    />
                    {status.ip && <InfoRow label="IP address" value={status.ip} />}
                    {status.ssid && status.mode !== "none" && (
                      <InfoRow label={status.mode === "wifi_ap" ? "Hotspot SSID" : "Network"} value={status.ssid} />
                    )}
                    {status.rssi !== null && status.rssi !== undefined && (
                      <InfoRow label="Signal" value={`${status.rssi} dBm — ${status.signalQuality}`} />
                    )}
                    {status.apClients !== null && status.apClients !== undefined && (
                      <InfoRow label="Clients" value={`${status.apClients} connected`} />
                    )}
                    {status.bleDevice && (
                      <InfoRow label="Paired device" value={status.bleDevice} />
                    )}
                    <InfoRow label="MAC address" value={status.mac} />
                    <InfoRow label="Firmware" value={status.firmwareVersion} />
                    <InfoRow label="Uptime" value={formatUptime(status.uptimeSeconds)} />
                  </div>
                </div>
              </>
            ) : (
              <p className="text-[10px] text-muted-foreground">No device status available.</p>
            )}
          </div>

        </div>
        </form>
      </CardContent>
    </Card>
  );
}

// ─── Settings Guide ───────────────────────────────────────────────────────────

const GUIDE_SECTIONS = [
  {
    icon: <ShieldAlert className="w-4 h-4 text-destructive" />,
    title: "Safety Limits",
    what: "Hard limits that automatically stop the gyroscope if exceeded.",
    how: "Set Max Tilt Angle to the maximum physical lean your rig can handle before things go wrong. Set Temperature Warning and Critical to the motor's rated operating range — warning logs an alert, critical triggers an emergency stop.",
    why: "Prevents mechanical damage, overheating, and runaway spinning in the event of a mounting failure or thermal problem.",
  },
  {
    icon: <Gauge className="w-4 h-4 text-primary" />,
    title: "Performance",
    what: "Default operating targets applied when starting a new session.",
    how: "Target RPM is the flywheel speed the motor controller will regulate to. Duration is how long the session should run before auto-stopping. Both can be overridden per-session from the Dashboard.",
    why: "Saves you from entering the same values every run. Calibrate once, run many.",
  },
  {
    icon: <Radio className="w-4 h-4 text-chart-2" />,
    title: "Device Connection",
    what: "Controls how the ESP32 talks to this dashboard wirelessly.",
    how: "WiFi Station — the ESP32 joins your existing network (most common). WiFi Hotspot — the ESP32 creates its own network; connect your laptop to it. Bluetooth BLE — for devices without WiFi. Enter your credentials and click Apply to push config to the device.",
    why: "The ESP32 and dashboard must be on the same network so sensor data can stream in real time over WebSocket.",
  },
  {
    icon: <Usb className="w-4 h-4 text-muted-foreground" />,
    title: "Serial Device (ESP32)",
    what: "Direct USB cable connection to the ESP32 (desktop app only).",
    how: "Click Scan to detect COM ports, select the one the ESP32 is on, set baud rate to match your firmware (default 115200), then Connect.",
    why: "Useful when WiFi isn't available or during initial firmware bring-up. USB also provides the fastest and most reliable data path.",
  },
  {
    icon: <HardDrive className="w-4 h-4 text-chart-3" />,
    title: "SD Card Storage",
    what: "Manages the onboard SD card that the ESP32 logs readings to.",
    how: "\"On Card\" shows how many readings are stored on the card. Click Sync now to pull them into this dashboard's database. The toggle enables or disables SD logging on the device.",
    why: "If WiFi drops mid-session, data is still safely captured locally. Syncing imports it so you can analyse it in Sessions and Predictions.",
  },
  {
    icon: <Cpu className="w-4 h-4 text-chart-4" />,
    title: "Firmware Update (OTA)",
    what: "Flashes new firmware to the ESP32 over-the-air without a USB cable.",
    how: "Compile your firmware in the Arduino IDE and export the .bin file. Upload it here and click Flash firmware. The ESP32 downloads, verifies, and reboots into the new firmware automatically.",
    why: "Lets you update firmware without physical access to the device. Useful once the gyroscope is mounted and wired up.",
  },
  {
    icon: <MonitorDot className="w-4 h-4 text-muted-foreground" />,
    title: "Desktop App Server",
    what: "Configures the embedded API server that runs inside the Electron desktop app.",
    how: "Change the listen address to 0.0.0.0 if you want other devices on your LAN to reach the dashboard. Leave it at 127.0.0.1 (default) for local-only access. Port defaults to 5000.",
    why: "The desktop app bundles a local API server so you don't need a cloud deployment — everything runs on your machine.",
  },
];

function SettingsGuide() {
  const [open, setOpen] = useState(false);
  return (
    <div className="mb-5 border border-border/60 rounded-lg bg-card overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/20 transition-colors text-left"
      >
        <BookOpen className="w-4 h-4 text-primary shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-xs font-bold text-foreground">Settings Guide</p>
          <p className="text-[10px] text-muted-foreground">What each section does, when to use it, and why it's here</p>
        </div>
        {open
          ? <ChevronUp className="w-4 h-4 text-muted-foreground shrink-0" />
          : <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />}
      </button>

      {open && (
        <div className="border-t border-border/60 grid grid-cols-2 gap-px bg-border/40">
          {GUIDE_SECTIONS.map((s) => (
            <div key={s.title} className="bg-card px-4 py-3 space-y-1.5">
              <div className="flex items-center gap-2">
                {s.icon}
                <p className="text-xs font-bold text-foreground">{s.title}</p>
              </div>
              <p className="text-[10px] text-foreground/80 leading-relaxed">
                <span className="font-semibold text-foreground">What it is: </span>{s.what}
              </p>
              <p className="text-[10px] text-foreground/80 leading-relaxed">
                <span className="font-semibold text-foreground">How to use it: </span>{s.how}
              </p>
              <p className="text-[10px] text-muted-foreground leading-relaxed">
                <span className="font-medium text-foreground/70">Why it's here: </span>{s.why}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const settingsSchema = z.object({
  targetRpm: z.coerce.number().int().min(500).max(14000),
  targetDurationHours: z.coerce.number().min(0.5).max(48),
  maxTiltAngle: z.coerce.number().min(1).max(45),
  tempWarnThreshold: z.coerce.number().min(30).max(90),
  tempCritThreshold: z.coerce.number().min(35).max(100),
  vibWarnThreshold: z.coerce.number().min(0.5).max(30),
  vibCritThreshold: z.coerce.number().min(1).max(50),
  pidKp: z.coerce.number().min(0).max(500),
  pidKi: z.coerce.number().min(0).max(50),
  pidKd: z.coerce.number().min(0).max(50),
  pidSetpointDeg: z.coerce.number().min(0).max(45),
  pidDeadbandDeg: z.coerce.number().min(0).max(10),
  pidIntegralMax: z.coerce.number().min(1).max(2000),
  pidBaseThrottle: z.coerce.number().int().min(1050).max(1800),
  armThrottleUs: z.coerce.number().int().min(900).max(1300),
  motorSpeedStepUs: z.coerce.number().int().min(1).max(200),
  minThrottleUs: z.coerce.number().int().min(1000).max(2000),
  maxThrottleUs: z.coerce.number().int().min(1000).max(2000),
  irKpStep: z.coerce.number().min(0.1).max(20),
  irKiStep: z.coerce.number().min(0.1).max(20),
  irKdStep: z.coerce.number().min(0.1).max(20),
  irKnlStep: z.coerce.number().min(0.1).max(20),
  autoNlThreshDeg: z.coerce.number().min(0).max(20),
  autoMinRpm: z.coerce.number().min(0).max(5000),
  autoMaxCorrectionUs: z.coerce.number().min(10).max(2000),
  rpmTimeoutMs: z.coerce.number().int().min(100).max(10000),
  rpmReportIntervalMs: z.coerce.number().int().min(10).max(5000),
  telemetryIntervalMs: z.coerce.number().int().min(50).max(5000),
}).refine((v) => v.minThrottleUs < v.maxThrottleUs, {
  message: "Min Throttle must be less than Max Throttle",
  path: ["maxThrottleUs"],
}).refine((v) => v.motorSpeedStepUs < v.maxThrottleUs - v.minThrottleUs, {
  message: "Manual Speed Step must be smaller than the throttle range",
  path: ["motorSpeedStepUs"],
}).refine((v) => v.armThrottleUs < v.minThrottleUs, {
  message: "Starting Pulse must be less than Min Throttle",
  path: ["armThrottleUs"],
});

type SettingsForm = z.infer<typeof settingsSchema>;


const PERFORMANCE_FIELDS = [
  {
    name: "targetRpm" as const,
    label: "Default Target RPM",
    description: "Flywheel target speed for new sessions",
    unit: "RPM",
    step: "100",
  },
  {
    name: "targetDurationHours" as const,
    label: "Default Duration",
    description: "Target run duration for new sessions",
    unit: "hours",
    step: "0.5",
  },
];

const PID_GAINS = [
  {
    name: "pidKp" as const,
    label: "Kp — Proportional",
    description: "Throttle boost per degree of tilt error. Increase to react faster; too high causes oscillation.",
    unit: "",
    step: "0.5",
  },
  {
    name: "pidKi" as const,
    label: "Ki — Integral",
    description: "Removes steady-state tilt that Kp alone cannot fix. Keep low to avoid integral windup.",
    unit: "",
    step: "0.1",
  },
  {
    name: "pidKd" as const,
    label: "Kd — Derivative",
    description: "Brakes the response when tilt is changing quickly. Reduces overshoot and ringing.",
    unit: "",
    step: "0.05",
  },
];

const SPEED_STEP_FIELD = {
  name: "motorSpeedStepUs" as const,
  label: "Manual Speed Step",
  description: "Throttle change per press of Speed Up/Down, keyboard h/l, or the IR remote's VOL+/VOL- keys.",
  unit: "µs",
  step: "1",
};

const THROTTLE_LIMIT_FIELDS = [
  {
    name: "minThrottleUs" as const,
    label: "Min Throttle",
    description: "Lower safety bound — manual and PID throttle writes are clamped above this.",
    unit: "µs",
    step: "10",
  },
  {
    name: "maxThrottleUs" as const,
    label: "Max Throttle",
    description: "Upper safety bound — manual and PID throttle writes are clamped below this.",
    unit: "µs",
    step: "10",
  },
];

const IR_STEP_FIELDS = [
  {
    name: "irKpStep" as const,
    label: "Kp Step",
    description: "Increment applied by IR remote buttons 1 (up) / 4 (down).",
    unit: "",
    step: "0.1",
  },
  {
    name: "irKiStep" as const,
    label: "Ki Step",
    description: "Increment applied by IR remote buttons 2 (up) / 5 (down).",
    unit: "",
    step: "0.1",
  },
  {
    name: "irKdStep" as const,
    label: "Kd Step",
    description: "Increment applied by IR remote buttons 3 (up) / 6 (down).",
    unit: "",
    step: "0.1",
  },
  {
    name: "irKnlStep" as const,
    label: "Nonlinear Boost Step",
    description: "Increment applied to the nonlinear boost factor via serial/IR tuning.",
    unit: "",
    step: "0.1",
  },
];

const AUTO_TUNING_FIELDS = [
  {
    name: "autoNlThreshDeg" as const,
    label: "Nonlinear Boost Threshold",
    description: "Tilt angle above which the extra √|e| correction term kicks in.",
    unit: "°",
    step: "0.1",
  },
  {
    name: "autoMinRpm" as const,
    label: "Auto-Mode Min RPM",
    description: "Auto (balance) mode is blocked below this flywheel speed — not enough angular momentum yet.",
    unit: "RPM",
    step: "10",
  },
  {
    name: "autoMaxCorrectionUs" as const,
    label: "Max PID Correction",
    description: "Output saturation clamp on the PID correction. Also stops integral windup once reached.",
    unit: "µs",
    step: "10",
  },
];

const TIMING_FIELDS = [
  {
    name: "rpmTimeoutMs" as const,
    label: "RPM Sensor Timeout",
    description: "No pulse for this long and the RPM sensor is reported as stalled/idle.",
    unit: "ms",
    step: "50",
  },
  {
    name: "rpmReportIntervalMs" as const,
    label: "RPM Report Interval",
    description: "How often the RPM sensor reading is recomputed and sent.",
    unit: "ms",
    step: "10",
  },
  {
    name: "telemetryIntervalMs" as const,
    label: "Telemetry Interval",
    description: "How often tilt/temperature/vibration readings are sent to the dashboard.",
    unit: "ms",
    step: "10",
  },
];

const PID_CFG_FIELDS = [
  {
    name: "pidSetpointDeg" as const,
    label: "Setpoint",
    description: "Target tilt angle. 0° = perfectly level. Adjust only if the IMU is mounted off-axis.",
    unit: "°",
    step: "0.1",
  },
  {
    name: "pidDeadbandDeg" as const,
    label: "Dead-band",
    description: "Tilt errors smaller than this are treated as zero (sensor noise floor). Too small = hunting.",
    unit: "°",
    step: "0.1",
  },
  {
    name: "pidIntegralMax" as const,
    label: "Integral limit",
    description: "Anti-windup clamp on the integral term in throttle µs. Prevents runaway integration at saturation.",
    unit: "µs",
    step: "10",
  },
];

export default function Settings() {
  const { data: settings, isLoading } = useGetSettings();
  const updateSettings = useUpdateSettings();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { theme, toggleTheme } = useTheme();
  const connectivitySaveRef = React.useRef<(() => void) | null>(null);

  // Settings must not be pushed to the ESP32 from the app while a session is
  // active or the motor is running — the firmware, dashboard PID button, and
  // IR remote all treat app pushes as authoritative, and a mid-run edit can
  // race the running system (e.g. flip auto mode back off). Tuning PID gains
  // while running is still possible, but only from the IR remote, and only
  // with auto mode off.
  const { data: session } = useGetSession({ query: { refetchInterval: 2000 } });
  const settingsLocked =
    session?.motorState === "on" ||
    session?.status === "running" ||
    session?.status === "warning";

  const form = useForm<SettingsForm>({
    resolver: zodResolver(settingsSchema),
    defaultValues: {
      targetRpm: 8000,
      targetDurationHours: 24,
      maxTiltAngle: 45,
      tempWarnThreshold: 55,
      tempCritThreshold: 65,
      vibWarnThreshold: 4.5,
      vibCritThreshold: 7.1,
      pidKp: 30.0,
      pidKi: 1.5,
      pidKd: 3.0,
      pidSetpointDeg: 0.0,
      pidDeadbandDeg: 0.5,
      pidIntegralMax: 250.0,
      pidBaseThrottle: 1100,
      armThrottleUs: 1000,
      motorSpeedStepUs: 5,
      minThrottleUs: 1200,
      maxThrottleUs: 1400,
      irKpStep: 1.0,
      irKiStep: 0.5,
      irKdStep: 0.5,
      irKnlStep: 0.5,
      autoNlThreshDeg: 3.0,
      autoMinRpm: 500,
      autoMaxCorrectionUs: 700,
      rpmTimeoutMs: 2000,
      rpmReportIntervalMs: 250,
      telemetryIntervalMs: 500,
    },
  });

  useEffect(() => {
    if (settings) {
      form.reset({
        targetRpm: settings.targetRpm,
        targetDurationHours: settings.targetDurationHours,
        maxTiltAngle: settings.maxTiltAngle,
        tempWarnThreshold: settings.tempWarnThreshold,
        tempCritThreshold: settings.tempCritThreshold,
        vibWarnThreshold: settings.vibWarnThreshold ?? 4.5,
        vibCritThreshold: settings.vibCritThreshold ?? 7.1,
        pidKp: settings.pidKp,
        pidKi: settings.pidKi,
        pidKd: settings.pidKd,
        pidSetpointDeg: settings.pidSetpointDeg ?? 0.0,
        pidDeadbandDeg: settings.pidDeadbandDeg ?? 0.5,
        pidIntegralMax: settings.pidIntegralMax ?? 250.0,
        pidBaseThrottle: settings.pidBaseThrottle ?? 1100,
        armThrottleUs: settings.armThrottleUs ?? 1000,
        motorSpeedStepUs: settings.motorSpeedStepUs ?? 5,
        minThrottleUs: settings.minThrottleUs ?? 1200,
        maxThrottleUs: settings.maxThrottleUs ?? 1400,
        irKpStep: settings.irKpStep ?? 1.0,
        irKiStep: settings.irKiStep ?? 0.5,
        irKdStep: settings.irKdStep ?? 0.5,
        irKnlStep: settings.irKnlStep ?? 0.5,
        autoNlThreshDeg: settings.autoNlThreshDeg ?? 3.0,
        autoMinRpm: settings.autoMinRpm ?? 500,
        autoMaxCorrectionUs: settings.autoMaxCorrectionUs ?? 700,
        rpmTimeoutMs: settings.rpmTimeoutMs ?? 2000,
        rpmReportIntervalMs: settings.rpmReportIntervalMs ?? 250,
        telemetryIntervalMs: settings.telemetryIntervalMs ?? 500,
      });
    }
  }, [settings]);

  function onSubmit(values: SettingsForm) {
    if (settingsLocked) {
      toast({
        title: "Settings locked",
        description: "Stop the session and motor before changing settings from the app.",
        variant: "destructive",
      });
      return;
    }
    updateSettings.mutate(
      { data: values },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetSettingsQueryKey() });
          toast({
            title: "Settings saved",
            description: "Configuration has been updated and applied.",
          });
        },
        onError: (err: any) => {
          const locked = err?.response?.status === 423;
          toast({
            title: locked ? "Settings locked" : "Save failed",
            description: locked
              ? "Stop the session and motor before changing settings from the app."
              : "Could not update settings. Check server connection.",
            variant: "destructive",
          });
        },
      }
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground font-sans flex flex-col">
      <header className="border-b border-border bg-card/80 backdrop-blur px-4 py-2 flex items-center gap-4 shrink-0">
        <Link href="/">
          <button className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="w-3.5 h-3.5" />
            Dashboard
          </button>
        </Link>
        <div className="h-4 w-px bg-border" />
        <div>
          <p className="text-[10px] text-muted-foreground uppercase tracking-widest">Motorized Gyroscope Dashboard</p>
          <h1 className="text-sm font-bold text-foreground leading-tight">Settings</h1>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={toggleTheme}
            className="p-1.5 rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
            title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          >
            {theme === "dark" ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
          </button>
          <Link href="/guide">
            <button className="flex items-center gap-2 text-xs bg-primary/10 hover:bg-primary/20 text-primary border border-primary/30 rounded-md px-3 py-1.5 transition-colors font-semibold">
              <BookOpen className="w-3.5 h-3.5" />
              Getting Started Guide
            </button>
          </Link>
        </div>
      </header>

      <main className="flex-1 p-6">

        {/* ── Connection panels — always at top, no scrolling required ─────── */}
        <div className="grid grid-cols-2 gap-4 mb-4">
          <SerialDevicePanel />
          <DesktopServerPanel />
        </div>

        <SettingsGuide />

        {settingsLocked && (
          <div className="mb-4 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 flex items-center gap-2">
            <Lock className="w-3.5 h-3.5 text-amber-500 shrink-0" />
            <p className="text-[11px] text-amber-600 dark:text-amber-400">
              Settings are locked while a session is active or the motor is running — changing values from the app mid-run can fight with the live system.
              Stop the session and motor to edit here, or use the IR remote to tune PID gains (only while auto mode is off).
            </p>
          </div>
        )}

        {isLoading ? (
          <div className="text-center text-muted-foreground text-sm py-12">Loading settings…</div>
        ) : (
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)}>
              <fieldset disabled={settingsLocked} className="grid grid-cols-2 gap-4">

                {/* Performance defaults */}
                <Card className="bg-card border-border/70 shadow-sm">
                  <CardHeader className="py-3 px-4 border-b border-border/70 bg-muted/30">
                    <CardTitle className="text-xs font-bold tracking-wider text-muted-foreground uppercase flex items-center gap-2">
                      <Gauge className="w-3.5 h-3.5 text-primary" />
                      Performance
                    </CardTitle>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      Default targets applied when starting a new session. Safety thresholds are configured via the{" "}
                      <span className="text-foreground font-medium">Thresholds</span> button on the dashboard.
                    </p>
                  </CardHeader>
                  <CardContent className="p-4 space-y-4">
                    {PERFORMANCE_FIELDS.map((f) => (
                      <FormField
                        key={f.name}
                        control={form.control}
                        name={f.name}
                        render={({ field }) => (
                          <FormItem className="grid grid-cols-2 gap-4 items-start space-y-0">
                            <div>
                              <FormLabel className="text-xs font-semibold text-foreground">{f.label}</FormLabel>
                              <FormDescription className="text-[10px] text-muted-foreground mt-0.5 leading-tight">
                                {f.description}
                              </FormDescription>
                            </div>
                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <FormControl>
                                  <Input
                                    type="number"
                                    step={f.step}
                                    className="h-8 text-sm font-mono border-border bg-background focus-visible:ring-primary"
                                    {...field}
                                  />
                                </FormControl>
                                <span className="text-xs text-muted-foreground shrink-0 w-8">{f.unit}</span>
                              </div>
                              <FormMessage className="text-[10px]" />
                            </div>
                          </FormItem>
                        )}
                      />
                    ))}
                  </CardContent>
                </Card>

                {/* PID Tuning */}
                <Card className="bg-card border-border/70 shadow-sm">
                  <CardHeader className="py-3 px-4 border-b border-border/70 bg-muted/30">
                    <CardTitle className="text-xs font-bold tracking-wider text-muted-foreground uppercase flex items-center gap-2">
                      <Cpu className="w-3.5 h-3.5 text-primary" />
                      PID Tuning (Auto Mode)
                    </CardTitle>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      Controls the ESP32's tilt-stabilisation loop. Feedback is tilt angle (not RPM).
                      Gain changes are pushed live via <code className="font-mono text-[10px]">CMD:SET_PID</code>;
                      config changes via <code className="font-mono text-[10px]">CMD:SET_PID_CFG</code>.
                    </p>
                  </CardHeader>
                  <CardContent className="p-4 space-y-5">

                    {/* Gains sub-group */}
                    <div className="space-y-1">
                      <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider pb-2 border-b border-border/40">
                        Controller Gains
                      </p>
                      <div className="space-y-4 pt-2">
                        {PID_GAINS.map((f) => (
                          <FormField
                            key={f.name}
                            control={form.control}
                            name={f.name}
                            render={({ field }) => (
                              <FormItem className="grid grid-cols-2 gap-4 items-start space-y-0">
                                <div>
                                  <FormLabel className="text-xs font-semibold text-foreground">{f.label}</FormLabel>
                                  <FormDescription className="text-[10px] text-muted-foreground mt-0.5 leading-tight">
                                    {f.description}
                                  </FormDescription>
                                </div>
                                <div className="space-y-1">
                                  <div className="flex items-center gap-2">
                                    <FormControl>
                                      <Input
                                        type="number"
                                        step={f.step}
                                        className="h-8 text-sm font-mono border-border bg-background focus-visible:ring-primary"
                                        {...field}
                                      />
                                    </FormControl>
                                  </div>
                                  <FormMessage className="text-[10px]" />
                                </div>
                              </FormItem>
                            )}
                          />
                        ))}
                      </div>
                    </div>

                    {/* Base throttle sub-group */}
                    <div className="space-y-1">
                      <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider pb-2 border-b border-border/40">
                        Throttle Control
                      </p>
                      <div className="pt-2">
                        <FormField
                          control={form.control}
                          name="pidBaseThrottle"
                          render={({ field }) => (
                            <FormItem className="grid grid-cols-2 gap-4 items-start space-y-0">
                              <div>
                                <FormLabel className="text-xs font-semibold text-foreground">
                                  Base (Idle) Throttle
                                  <span className="ml-1 text-muted-foreground font-normal">µs</span>
                                </FormLabel>
                                <FormDescription className="text-[10px] text-muted-foreground mt-0.5 leading-tight">
                                  The minimum pulse width while PID is active (1050–1800 µs). The controller adds or subtracts from this floor — the motor never drops below it.
                                </FormDescription>
                                <p className="text-[9px] text-muted-foreground/70 mt-1 font-mono">
                                  1050 = min idle · 1100 = default · 1800 = full throttle
                                </p>
                              </div>
                              <div className="space-y-2">
                                <div className="flex items-center gap-2">
                                  <FormControl>
                                    <Input
                                      type="number"
                                      step="10"
                                      min={1050}
                                      max={1800}
                                      className="h-8 text-sm font-mono border-border bg-background focus-visible:ring-primary"
                                      {...field}
                                    />
                                  </FormControl>
                                  <span className="text-xs text-muted-foreground shrink-0">µs</span>
                                </div>
                                <div className="w-full bg-muted/30 rounded-full h-1.5 overflow-hidden">
                                  <div
                                    className="bg-primary h-1.5 rounded-full transition-all"
                                    style={{ width: `${((Number(field.value) - 1050) / 750) * 100}%` }}
                                  />
                                </div>
                                <p className="text-[9px] text-muted-foreground text-right font-mono">
                                  {(((Number(field.value) - 1050) / 750) * 100).toFixed(0)}% throttle range
                                </p>
                                <FormMessage className="text-[10px]" />
                              </div>
                            </FormItem>
                          )}
                        />
                      </div>
                      <div className="pt-4">
                        <FormField
                          control={form.control}
                          name="armThrottleUs"
                          render={({ field }) => (
                            <FormItem className="grid grid-cols-2 gap-4 items-start space-y-0">
                              <div>
                                <FormLabel className="text-xs font-semibold text-foreground">
                                  Starting Pulse
                                  <span className="ml-1 text-muted-foreground font-normal">µs</span>
                                </FormLabel>
                                <FormDescription className="text-[10px] text-muted-foreground mt-0.5 leading-tight">
                                  The armed-but-not-spinning pulse sent to the ESC whenever the motor is off (900–1300 µs). Must stay below Min Throttle.
                                </FormDescription>
                              </div>
                              <div className="space-y-1">
                                <div className="flex items-center gap-2">
                                  <FormControl>
                                    <Input
                                      type="number"
                                      step="10"
                                      min={900}
                                      max={1300}
                                      className="h-8 text-sm font-mono border-border bg-background focus-visible:ring-primary"
                                      {...field}
                                    />
                                  </FormControl>
                                  <span className="text-xs text-muted-foreground shrink-0">µs</span>
                                </div>
                                <FormMessage className="text-[10px]" />
                              </div>
                            </FormItem>
                          )}
                        />
                      </div>
                    </div>

                    {/* Algorithm config sub-group */}
                    <div className="space-y-1">
                      <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider pb-2 border-b border-border/40">
                        Algorithm Configuration
                      </p>
                      <div className="space-y-4 pt-2">
                        {PID_CFG_FIELDS.map((f) => (
                          <FormField
                            key={f.name}
                            control={form.control}
                            name={f.name}
                            render={({ field }) => (
                              <FormItem className="grid grid-cols-2 gap-4 items-start space-y-0">
                                <div>
                                  <FormLabel className="text-xs font-semibold text-foreground">
                                    {f.label}
                                    {f.unit && <span className="ml-1 text-muted-foreground font-normal">{f.unit}</span>}
                                  </FormLabel>
                                  <FormDescription className="text-[10px] text-muted-foreground mt-0.5 leading-tight">
                                    {f.description}
                                  </FormDescription>
                                </div>
                                <div className="space-y-1">
                                  <div className="flex items-center gap-2">
                                    <FormControl>
                                      <Input
                                        type="number"
                                        step={f.step}
                                        className="h-8 text-sm font-mono border-border bg-background focus-visible:ring-primary"
                                        {...field}
                                      />
                                    </FormControl>
                                    {f.unit && (
                                      <span className="text-xs text-muted-foreground shrink-0">{f.unit}</span>
                                    )}
                                  </div>
                                  <FormMessage className="text-[10px]" />
                                </div>
                              </FormItem>
                            )}
                          />
                        ))}
                      </div>
                    </div>

                  </CardContent>
                </Card>

                {/* Firmware Tuning */}
                <Card className="bg-card border-border/70 shadow-sm">
                  <CardHeader className="py-3 px-4 border-b border-border/70 bg-muted/30">
                    <CardTitle className="text-xs font-bold tracking-wider text-muted-foreground uppercase flex items-center gap-2">
                      <Cpu className="w-3.5 h-3.5 text-primary" />
                      Firmware Tuning
                    </CardTitle>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      These used to be hardcoded constants requiring a reflash to change. They're now pushed live
                      to the ESP32 (<code className="font-mono text-[10px]">CMD:SET_*</code>) — the firmware keeps
                      its compiled values as fallbacks if the app never overrides them.
                    </p>
                  </CardHeader>
                  <CardContent className="p-4 space-y-5">

                    {/* Manual speed step */}
                    <div className="space-y-1">
                      <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider pb-2 border-b border-border/40">
                        Manual Speed Control
                      </p>
                      <div className="pt-2">
                        <FormField
                          control={form.control}
                          name={SPEED_STEP_FIELD.name}
                          render={({ field }) => (
                            <FormItem className="grid grid-cols-2 gap-4 items-start space-y-0">
                              <div>
                                <FormLabel className="text-xs font-semibold text-foreground">{SPEED_STEP_FIELD.label}</FormLabel>
                                <FormDescription className="text-[10px] text-muted-foreground mt-0.5 leading-tight">
                                  {SPEED_STEP_FIELD.description}
                                </FormDescription>
                              </div>
                              <div className="space-y-1">
                                <div className="flex items-center gap-2">
                                  <FormControl>
                                    <Input
                                      type="number"
                                      step={SPEED_STEP_FIELD.step}
                                      className="h-8 text-sm font-mono border-border bg-background focus-visible:ring-primary"
                                      {...field}
                                    />
                                  </FormControl>
                                  <span className="text-xs text-muted-foreground shrink-0">{SPEED_STEP_FIELD.unit}</span>
                                </div>
                                <FormMessage className="text-[10px]" />
                              </div>
                            </FormItem>
                          )}
                        />
                      </div>
                    </div>

                    {/* Throttle safety limits */}
                    <div className="space-y-1">
                      <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider pb-2 border-b border-border/40">
                        Throttle Safety Limits
                      </p>
                      <div className="space-y-4 pt-2">
                        {THROTTLE_LIMIT_FIELDS.map((f) => (
                          <FormField
                            key={f.name}
                            control={form.control}
                            name={f.name}
                            render={({ field }) => (
                              <FormItem className="grid grid-cols-2 gap-4 items-start space-y-0">
                                <div>
                                  <FormLabel className="text-xs font-semibold text-foreground">{f.label}</FormLabel>
                                  <FormDescription className="text-[10px] text-muted-foreground mt-0.5 leading-tight">
                                    {f.description}
                                  </FormDescription>
                                </div>
                                <div className="space-y-1">
                                  <div className="flex items-center gap-2">
                                    <FormControl>
                                      <Input
                                        type="number"
                                        step={f.step}
                                        className="h-8 text-sm font-mono border-border bg-background focus-visible:ring-primary"
                                        {...field}
                                      />
                                    </FormControl>
                                    <span className="text-xs text-muted-foreground shrink-0">{f.unit}</span>
                                  </div>
                                  <FormMessage className="text-[10px]" />
                                </div>
                              </FormItem>
                            )}
                          />
                        ))}
                      </div>
                    </div>

                    {/* IR remote tuning steps */}
                    <div className="space-y-1">
                      <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider pb-2 border-b border-border/40">
                        IR Remote Tuning Steps
                      </p>
                      <div className="space-y-4 pt-2">
                        {IR_STEP_FIELDS.map((f) => (
                          <FormField
                            key={f.name}
                            control={form.control}
                            name={f.name}
                            render={({ field }) => (
                              <FormItem className="grid grid-cols-2 gap-4 items-start space-y-0">
                                <div>
                                  <FormLabel className="text-xs font-semibold text-foreground">{f.label}</FormLabel>
                                  <FormDescription className="text-[10px] text-muted-foreground mt-0.5 leading-tight">
                                    {f.description}
                                  </FormDescription>
                                </div>
                                <div className="space-y-1">
                                  <div className="flex items-center gap-2">
                                    <FormControl>
                                      <Input
                                        type="number"
                                        step={f.step}
                                        className="h-8 text-sm font-mono border-border bg-background focus-visible:ring-primary"
                                        {...field}
                                      />
                                    </FormControl>
                                  </div>
                                  <FormMessage className="text-[10px]" />
                                </div>
                              </FormItem>
                            )}
                          />
                        ))}
                      </div>
                    </div>

                    {/* Auto-mode tuning */}
                    <div className="space-y-1">
                      <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider pb-2 border-b border-border/40">
                        Auto-Mode Tuning
                      </p>
                      <div className="space-y-4 pt-2">
                        {AUTO_TUNING_FIELDS.map((f) => (
                          <FormField
                            key={f.name}
                            control={form.control}
                            name={f.name}
                            render={({ field }) => (
                              <FormItem className="grid grid-cols-2 gap-4 items-start space-y-0">
                                <div>
                                  <FormLabel className="text-xs font-semibold text-foreground">{f.label}</FormLabel>
                                  <FormDescription className="text-[10px] text-muted-foreground mt-0.5 leading-tight">
                                    {f.description}
                                  </FormDescription>
                                </div>
                                <div className="space-y-1">
                                  <div className="flex items-center gap-2">
                                    <FormControl>
                                      <Input
                                        type="number"
                                        step={f.step}
                                        className="h-8 text-sm font-mono border-border bg-background focus-visible:ring-primary"
                                        {...field}
                                      />
                                    </FormControl>
                                    <span className="text-xs text-muted-foreground shrink-0">{f.unit}</span>
                                  </div>
                                  <FormMessage className="text-[10px]" />
                                </div>
                              </FormItem>
                            )}
                          />
                        ))}
                      </div>
                    </div>

                    {/* Timing / reporting cadence */}
                    <div className="space-y-1">
                      <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider pb-2 border-b border-border/40">
                        Sensor Timing
                      </p>
                      <div className="space-y-4 pt-2">
                        {TIMING_FIELDS.map((f) => (
                          <FormField
                            key={f.name}
                            control={form.control}
                            name={f.name}
                            render={({ field }) => (
                              <FormItem className="grid grid-cols-2 gap-4 items-start space-y-0">
                                <div>
                                  <FormLabel className="text-xs font-semibold text-foreground">{f.label}</FormLabel>
                                  <FormDescription className="text-[10px] text-muted-foreground mt-0.5 leading-tight">
                                    {f.description}
                                  </FormDescription>
                                </div>
                                <div className="space-y-1">
                                  <div className="flex items-center gap-2">
                                    <FormControl>
                                      <Input
                                        type="number"
                                        step={f.step}
                                        className="h-8 text-sm font-mono border-border bg-background focus-visible:ring-primary"
                                        {...field}
                                      />
                                    </FormControl>
                                    <span className="text-xs text-muted-foreground shrink-0">{f.unit}</span>
                                  </div>
                                  <FormMessage className="text-[10px]" />
                                </div>
                              </FormItem>
                            )}
                          />
                        ))}
                      </div>
                    </div>

                  </CardContent>
                </Card>

                {/* SD Card */}
                <SdCardPanel />

              </fieldset>
              {settingsLocked && (
                <p className="text-[10px] text-muted-foreground mt-2 flex items-center gap-1">
                  <Lock className="w-3 h-3" /> Save is disabled while locked.
                </p>
              )}
            </form>
          </Form>
        )}

        {/* Full-width row — device connection spans across both columns */}
        <div className="mt-4">
          <ConnectivitySection saveRef={connectivitySaveRef} />
        </div>

        {/* Full-width row — firmware tool */}
        <div className="mt-4">
          <FirmwarePanel />
        </div>

        {/* Full-width row — alert & notification behaviour */}
        <div className="mt-4">
          <AlertBehaviorSettings />
        </div>

        {/* Single save button for all settings */}
        <div className="mt-6 flex justify-end border-t border-border/60 pt-4">
          <Button
            size="sm"
            className="bg-primary hover:bg-primary/90 text-primary-foreground font-bold px-8"
            disabled={updateSettings.isPending || settingsLocked}
            onClick={() => {
              form.handleSubmit(onSubmit)();
              connectivitySaveRef.current?.();
            }}
          >
            <Save className="w-3.5 h-3.5 mr-2" />
            {settingsLocked ? "Locked — session/motor active" : updateSettings.isPending ? "Saving…" : "Save all settings"}
          </Button>
        </div>

      </main>
    </div>
  );
}
