import React, { useState, useRef, useEffect, useCallback } from "react";
import { Link } from "wouter";
import { ArrowLeft, CheckCircle2, Circle, Cpu, HardDrive, Wifi, WifiOff, Usb, Play, LayoutDashboard, AlertTriangle, ChevronDown, ChevronUp, Terminal, Zap, Radio, BarChart2, Settings2, BookOpen, Sun, Moon, ArrowDown, ArrowUp, Database, Server, Network } from "lucide-react";
import remoteImg from "@assets/IMG_20260702_123834_399@1950638990_1782988746126.jpg";
import { useTheme } from "@/hooks/use-theme";

// ─── Shared primitives ────────────────────────────────────────────────────────

function SectionAnchor({ id }: { id: string }) {
  return <div id={id} className="-mt-4 pt-4" />;
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-4">
      <div className="flex flex-col items-center shrink-0">
        <div className="w-7 h-7 rounded-full bg-primary flex items-center justify-center text-[11px] font-bold text-primary-foreground shrink-0">
          {n}
        </div>
        <div className="flex-1 w-px bg-border/60 mt-1" />
      </div>
      <div className="pb-6 flex-1 min-w-0">
        <p className="text-sm font-bold text-foreground mb-2">{title}</p>
        <div className="text-[11px] text-muted-foreground leading-relaxed space-y-2">{children}</div>
      </div>
    </div>
  );
}

function Code({ children }: { children: React.ReactNode }) {
  return (
    <code className="bg-muted/40 border border-border/60 rounded px-1.5 py-0.5 font-mono text-[10px] text-foreground">
      {children}
    </code>
  );
}

function CodeBlock({ children }: { children: string }) {
  return (
    <pre className="bg-muted/30 border border-border/60 rounded-lg p-3 font-mono text-[10px] text-foreground overflow-x-auto leading-relaxed whitespace-pre">
      {children}
    </pre>
  );
}

function Note({ variant = "info", children }: { variant?: "info" | "warn" | "tip"; children: React.ReactNode }) {
  const styles = {
    info: "bg-primary/5 border-primary/30 text-primary/90",
    warn: "bg-destructive/5 border-destructive/30 text-destructive/90",
    tip:  "bg-chart-3/5 border-chart-3/30 text-chart-3/90",
  };
  const labels = { info: "NOTE", warn: "WARNING", tip: "TIP" };
  return (
    <div className={`border rounded-lg px-3 py-2.5 text-[10px] leading-relaxed ${styles[variant]}`}>
      <span className="font-bold tracking-wider mr-2">{labels[variant]}</span>
      {children}
    </div>
  );
}

function PinRow({ pin, gpio, description }: { pin: string; gpio: string; description: string }) {
  return (
    <tr className="border-t border-border/40">
      <td className="py-1.5 pr-4 font-mono text-[10px] text-primary font-semibold">{pin}</td>
      <td className="py-1.5 pr-4 font-mono text-[10px] text-foreground">{gpio}</td>
      <td className="py-1.5 text-[10px] text-muted-foreground">{description}</td>
    </tr>
  );
}

function Collapsible({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-border/60 rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-2.5 bg-muted/20 hover:bg-muted/30 transition-colors text-left"
      >
        <span className="text-xs font-semibold text-foreground">{title}</span>
        {open ? <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />}
      </button>
      {open && <div className="px-4 py-3 border-t border-border/40 space-y-3">{children}</div>}
    </div>
  );
}

// ─── System flow chart ────────────────────────────────────────────────────────

function SystemFlowChart() {
  const nodes = [
    { label: "ESP32 Hardware",    detail: "Sensors · Motor · IR remote" },
    { label: "USB / WiFi Bridge", detail: "Serial or TCP — forwards data" },
    { label: "API Server",        detail: "Express · stores readings · safety checks" },
    { label: "Dashboard",         detail: "Browser — live charts · controls" },
  ];

  return (
    <div className="flex flex-col items-center gap-0 py-2">
      {nodes.map((node, i) => (
        <React.Fragment key={node.label}>
          {/* Node box */}
          <div className="w-full max-w-sm border border-border rounded-lg px-5 py-3 text-center bg-card">
            <p className="text-sm font-semibold text-foreground">{node.label}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{node.detail}</p>
          </div>

          {/* Arrow between nodes */}
          {i < nodes.length - 1 && (
            <div className="flex flex-col items-center text-muted-foreground/50 py-1 gap-0.5">
              <div className="w-px h-4 bg-border" />
              <ArrowDown className="w-3.5 h-3.5" />
            </div>
          )}
        </React.Fragment>
      ))}
    </div>
  );
}

// ─── Nav sidebar ──────────────────────────────────────────────────────────────

const NAV = [
  { id: "system-flow",  label: "How It Works",          icon: <Network className="w-3 h-3" /> },
  { id: "quickstart",   label: "Quick Start",          icon: <Zap className="w-3 h-3" /> },
  { id: "hardware",     label: "Hardware You Need",     icon: <Cpu className="w-3 h-3" /> },
  { id: "wiring",       label: "Wiring the ESP32",      icon: <Terminal className="w-3 h-3" /> },
  { id: "firmware",     label: "Loading Firmware",      icon: <HardDrive className="w-3 h-3" /> },
  { id: "connecting",   label: "Connecting to Dashboard", icon: <Wifi className="w-3 h-3" /> },
  { id: "autodetect",  label: "Auto-Detection",          icon: <Cpu className="w-3 h-3" /> },
  { id: "firstsession", label: "First Session",         icon: <Play className="w-3 h-3" /> },
  { id: "tour",         label: "Dashboard Tour",        icon: <LayoutDashboard className="w-3 h-3" /> },
  { id: "remote",       label: "IR Remote Control",     icon: <Radio className="w-3 h-3" /> },
  { id: "troubleshoot", label: "Troubleshooting",       icon: <AlertTriangle className="w-3 h-3" /> },
];

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function Guide() {
  const [activeSection, setActiveSection] = useState<string>(NAV[0].id);
  const mainRef = useRef<HTMLDivElement>(null);
  const navRef  = useRef<HTMLElement>(null);
  const { theme, toggleTheme } = useTheme();

  // ── Active section: scroll-position based ────────────────────────────────
  const updateActive = useCallback(() => {
    const main = mainRef.current;
    if (!main) return;
    const mainRect = main.getBoundingClientRect();
    const scrollTop = main.scrollTop + 80;
    let current = NAV[0].id;
    for (const { id } of NAV) {
      const el = document.getElementById(id);
      if (!el) continue;
      // offsetTop is relative to offsetParent (body), not main. Use getBoundingClientRect.
      const elTop = el.getBoundingClientRect().top + main.scrollTop - mainRect.top;
      if (elTop <= scrollTop) current = id;
    }
    setActiveSection((prev) => (prev === current ? prev : current));
  }, []);

  useEffect(() => {
    const main = mainRef.current;
    if (!main) return;
    main.addEventListener("scroll", updateActive, { passive: true });
    return () => main.removeEventListener("scroll", updateActive);
  }, [updateActive]);

  // Auto-scroll active nav item into view inside the sidebar
  useEffect(() => {
    const nav = navRef.current;
    if (!nav) return;
    const el = nav.querySelector<HTMLElement>(`[data-id="${activeSection}"]`);
    el?.scrollIntoView({ block: "nearest", behavior: "auto" });
  }, [activeSection]);

  // ── Scroll resistance at section boundaries ───────────────────────────────
  useEffect(() => {
    const main = mainRef.current;
    if (!main) return;

    // All state lives in closures — effect runs once, no stale ref issues
    let accumulated   = 0;
    let activeBoundId: string | null = null;
    let cooldownUntil = 0; // timestamp — ignore resistance during cooldown

    const THRESHOLD  = 560;  // px of total delta to push through
    const FACTOR     = 0.05; // scroll speed while resisting (5% = very heavy)
    const ZONE       = 120;  // px ahead of boundary to start resisting

    const getSectionTops = () =>
      NAV.slice(1) // skip the first section — no gate at the very top
        .map(({ id }) => ({ id, top: document.getElementById(id)?.offsetTop ?? -1 }))
        .filter(({ top }) => top > 0);

    const handleWheel = (e: WheelEvent) => {
      const now = Date.now();

      // During cooldown, let the browser scroll freely
      if (now < cooldownUntil) return;

      const delta     = e.deltaY;
      const scrollTop = main.scrollTop;
      const tops      = getSectionTops();

      // Find the nearest upcoming boundary in scroll direction
      let boundary: { id: string; top: number } | null = null;

      if (delta > 0) {
        // Scrolling down — look for next section top ahead of viewport bottom
        const viewBottom = scrollTop + main.clientHeight;
        boundary = tops.find(({ top }) =>
          top > scrollTop && top <= viewBottom + ZONE
        ) ?? null;
      } else {
        // Scrolling up — look for section top just above current scroll
        boundary = [...tops].reverse().find(({ top }) =>
          top < scrollTop && top >= scrollTop - ZONE
        ) ?? null;
      }

      if (!boundary) {
        // No boundary nearby — free scroll, reset
        accumulated   = 0;
        activeBoundId = null;
        return;
      }

      // Entered a different boundary — reset accumulator
      if (activeBoundId !== boundary.id) {
        accumulated   = 0;
        activeBoundId = boundary.id;
      }

      accumulated += Math.abs(delta);

      if (accumulated < THRESHOLD) {
        // Still resisting — slow the scroll way down
        e.preventDefault();
        main.scrollTop += delta * FACTOR;
      } else {
        // Threshold met — snap to exact section start and cooldown
        e.preventDefault();
        main.scrollTop = boundary.top;
        accumulated    = 0;
        activeBoundId  = null;
        cooldownUntil  = now + 700; // 700 ms before next boundary can trigger
      }
    };

    main.addEventListener("wheel", handleWheel, { passive: false });
    return () => main.removeEventListener("wheel", handleWheel);
  }, []);

  return (
    <div className="min-h-screen bg-background text-foreground font-sans flex flex-col">

      {/* Header */}
      <header className="border-b border-border bg-card/80 backdrop-blur px-4 py-2 flex items-center gap-4 shrink-0 sticky top-0 z-10">
        <button
          onClick={() => window.history.back()}
          className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Back
        </button>
        <div className="h-4 w-px bg-border" />
        <div>
          <p className="text-[10px] text-muted-foreground uppercase tracking-widest">Motorized Gyroscope Dashboard</p>
          <h1 className="text-sm font-bold text-foreground leading-tight">Getting Started</h1>
        </div>
        <div className="ml-auto">
          <button
            onClick={toggleTheme}
            className="p-1.5 rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
            title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          >
            {theme === "dark" ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
          </button>
        </div>
      </header>

      <div className="flex flex-1 min-h-0">

        {/* Sidebar nav */}
        <aside className="w-52 shrink-0 border-r border-border bg-card/40 py-5 px-3 sticky top-[49px] self-start h-[calc(100vh-49px)] overflow-y-auto">
          <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest mb-3 px-2">Contents</p>
          <nav ref={navRef} className="space-y-0.5">
            {NAV.map((item) => {
              const isActive = activeSection === item.id;
              return (
                <a
                  key={item.id}
                  data-id={item.id}
                  href={`#${item.id}`}
                  onClick={(e) => {
                    e.preventDefault();
                    document.getElementById(item.id)?.scrollIntoView({ behavior: "auto" });
                    mainRef.current?.scrollBy({ top: -8 });
                  }}
                  className={`flex items-center gap-2.5 px-2 py-1.5 rounded text-[11px] transition-all duration-150 ${
                    isActive
                      ? "text-foreground font-bold"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/30"
                  }`}
                >
                  <span className={`shrink-0 transition-colors ${isActive ? "text-primary" : "text-muted-foreground/70"}`}>
                    {item.icon}
                  </span>
                  {item.label}
                </a>
              );
            })}
          </nav>
        </aside>

        {/* Content */}
        <main ref={mainRef} className="flex-1 min-w-0 overflow-y-auto h-[calc(100vh-49px)]">
          <div className="max-w-3xl mx-auto px-8 py-8 space-y-14">

            {/* Intro */}
            <div className="space-y-3">
              <h2 className="text-2xl font-bold text-foreground">How to connect and use the Gyroscope Dashboard</h2>
              <p className="text-sm text-muted-foreground leading-relaxed">
                This guide walks you through everything — from wiring the first sensor to running a live session.
                The dashboard connects to a real <strong className="text-foreground">ESP32 microcontroller</strong> with an <strong className="text-foreground">MPU-6050 IMU</strong> over USB.
                A motor driver, temperature sensor, and SD card are <strong className="text-foreground">optional</strong> — the system auto-detects which sensors
                are present and shows only the panels your hardware can actually provide data for.
                Until an ESP32 connects, the dashboard shows zeros on all charts.
              </p>
              <div className="flex flex-wrap gap-2 pt-1">
                {["ESP32", "MPU-6050", "WiFi / BLE / USB", "OTA Firmware", "SD Card logging"].map((tag) => (
                  <span key={tag} className="text-[10px] font-mono px-2 py-0.5 rounded-full border border-border/60 text-muted-foreground bg-muted/20">
                    {tag}
                  </span>
                ))}
              </div>
            </div>

            {/* ── System Overview Flow Chart ───────────────────────────── */}
            <section className="space-y-5">
              <SectionAnchor id="system-flow" />
              <div className="flex items-center gap-3 border-b border-border/60 pb-3">
                <div className="w-7 h-7 rounded bg-primary/10 flex items-center justify-center">
                  <Network className="w-4 h-4 text-primary" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-foreground">How It Works</h3>
                  <p className="text-[10px] text-muted-foreground">End-to-end data flow — from sensor to screen</p>
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                The system has four layers. Sensor readings travel <strong className="text-foreground">downward</strong> from the ESP32 hardware to the browser dashboard in real time. Motor and control commands travel <strong className="text-foreground">upward</strong> from the dashboard back to the firmware. Every arrow below carries live traffic while a session is running.
              </p>
              <SystemFlowChart />
            </section>

            {/* ── Quick Start ─────────────────────────────────────────── */}
            <section className="space-y-5">
              <SectionAnchor id="quickstart" />
              <div className="flex items-center gap-3 border-b border-border/60 pb-3">
                <div className="w-7 h-7 rounded bg-primary/10 flex items-center justify-center">
                  <Zap className="w-4 h-4 text-primary" />
                </div>
                <h3 className="text-base font-bold text-foreground">Quick Start Checklist</h3>
              </div>
              <p className="text-[11px] text-muted-foreground">Have an ESP32 + MPU-6050? Here's the 5-minute path to a running system.</p>
              <div className="space-y-2">
                {[
                  { text: "Wire MPU-6050 to ESP32 via I²C (SDA→GPIO 21, SCL→GPIO 22)", required: true },
                  { text: "Flash gyro_monitor.ino via Arduino IDE (set board to ESP32 Dev Module)", required: true },
                  { text: "Plug in USB cable, open Settings → Serial Connection, pick the port", required: true },
                  { text: "Watch the Dashboard — live tilt and rotation appear; offline panels show for sensors not wired", required: true },
                  { text: "Press Start Session to begin logging", required: true },
                  { text: "Optional: wire motor driver PWM to GPIO 25 for RPM and motor control", required: false },
                  { text: "Optional: wire temperature sensor (DS18B20 → GPIO 4) for thermal monitoring", required: false },
                  { text: "Optional: wire SD card via SPI (CS→GPIO 5) for on-device logging", required: false },
                ].map((item, i) => (
                  <div key={i} className="flex items-start gap-2.5">
                    <CheckCircle2 className={`w-3.5 h-3.5 shrink-0 mt-0.5 ${item.required ? "text-chart-3" : "text-muted-foreground/40"}`} />
                    <span className={`text-[11px] leading-relaxed ${item.required ? "text-muted-foreground" : "text-muted-foreground/60 italic"}`}>{item.text}</span>
                  </div>
                ))}
              </div>
            </section>

            {/* ── Hardware ─────────────────────────────────────────────── */}
            <section className="space-y-5">
              <SectionAnchor id="hardware" />
              <div className="flex items-center gap-3 border-b border-border/60 pb-3">
                <div className="w-7 h-7 rounded bg-primary/10 flex items-center justify-center">
                  <Cpu className="w-4 h-4 text-primary" />
                </div>
                <h3 className="text-base font-bold text-foreground">Hardware You Need</h3>
              </div>

              <Note variant="tip">
                <strong>MPU-6050 only?</strong> That's all you need to get started. Wire it to the ESP32, flash the firmware, connect via USB, and the dashboard will show live tilt, rotation, and vibration data immediately.
                Panels for temperature, RPM, and motor control will show an <em>"offline"</em> badge — they activate automatically when you add those sensors later.
              </Note>

              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: "ESP32 Dev Board", detail: "Any 38-pin ESP32 variant works. ESP32-WROOM-32 is recommended.", required: true },
                  { label: "MPU-6050 IMU", detail: "6-axis accelerometer + gyroscope. Provides tilt X/Y, rotation Z, and vibration (derived from accelerometer). This is the only sensor required for basic operation.", required: true },
                  { label: "Motor + ESC / Driver", detail: "Optional — enables RPM and motor PWM panels. Brushless or brushed motor with a PWM-capable driver (e.g. L298N, DRV8833, or ESC for BLDC). Connect PWM signal to GPIO 25.", required: false },
                  { label: "Temperature Sensor", detail: "Optional — enables the temperature panel. DS18B20 (1-Wire, GPIO 4), NTC thermistor, or BME280 breakout. Without this, the temperature chart shows an offline badge.", required: false },
                  { label: "MicroSD Card Module", detail: "Optional — enables on-device logging when WiFi is unavailable. SPI-connected SD breakout (CS→GPIO 5).", required: false },
                  { label: "5V Power Supply", detail: "Power the ESP32 via USB cable for flashing and serial mode. If you add a motor, the driver needs its own external power supply.", required: true },
                  { label: "USB Cable (Type-C or Micro)", detail: "Required — used to flash firmware and connect to the desktop app over USB serial. Type-C or Micro-USB depending on your ESP32 variant.", required: true },
                ].map((item) => (
                  <div key={item.label} className={`border rounded-lg p-3 space-y-1 ${item.required ? "border-border" : "border-border/40 opacity-80"}`}>
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-bold text-foreground">{item.label}</p>
                      <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full ${item.required ? "bg-primary/10 text-primary" : "bg-muted/40 text-muted-foreground"}`}>
                        {item.required ? "Required" : "Optional"}
                      </span>
                    </div>
                    <p className="text-[10px] text-muted-foreground leading-relaxed">{item.detail}</p>
                  </div>
                ))}
              </div>
            </section>

            {/* ── Wiring ───────────────────────────────────────────────── */}
            <section className="space-y-5">
              <SectionAnchor id="wiring" />
              <div className="flex items-center gap-3 border-b border-border/60 pb-3">
                <div className="w-7 h-7 rounded bg-primary/10 flex items-center justify-center">
                  <Terminal className="w-4 h-4 text-primary" />
                </div>
                <h3 className="text-base font-bold text-foreground">Wiring the ESP32</h3>
              </div>
              <p className="text-[11px] text-muted-foreground">All connections use 3.3V logic from the ESP32. Do not connect 5V directly to GPIO pins.</p>

              <div className="space-y-4">
                <div>
                  <p className="text-xs font-bold text-foreground mb-2">MPU-6050 (I²C) — Tilt &amp; Gyroscope</p>
                  <table className="w-full border-collapse">
                    <thead>
                      <tr>
                        <th className="text-left text-[9px] font-bold text-muted-foreground uppercase tracking-wider pb-1.5 pr-4">MPU-6050 Pin</th>
                        <th className="text-left text-[9px] font-bold text-muted-foreground uppercase tracking-wider pb-1.5 pr-4">ESP32 GPIO</th>
                        <th className="text-left text-[9px] font-bold text-muted-foreground uppercase tracking-wider pb-1.5">Notes</th>
                      </tr>
                    </thead>
                    <tbody>
                      <PinRow pin="VCC" gpio="3.3V" description="Power — use 3.3V not 5V" />
                      <PinRow pin="GND" gpio="GND" description="Common ground" />
                      <PinRow pin="SDA" gpio="GPIO 21" description="I²C data line" />
                      <PinRow pin="SCL" gpio="GPIO 22" description="I²C clock line" />
                      <PinRow pin="AD0" gpio="GND" description="I²C address select — GND = 0x68" />
                      <PinRow pin="INT" gpio="(not required)" description="Interrupt — leave unconnected" />
                    </tbody>
                  </table>
                </div>

                <div>
                  <p className="text-xs font-bold text-foreground mb-2">Motor Driver (PWM)</p>
                  <table className="w-full border-collapse">
                    <thead>
                      <tr>
                        <th className="text-left text-[9px] font-bold text-muted-foreground uppercase tracking-wider pb-1.5 pr-4">Signal</th>
                        <th className="text-left text-[9px] font-bold text-muted-foreground uppercase tracking-wider pb-1.5 pr-4">ESP32 GPIO</th>
                        <th className="text-left text-[9px] font-bold text-muted-foreground uppercase tracking-wider pb-1.5">Notes</th>
                      </tr>
                    </thead>
                    <tbody>
                      <PinRow pin="PWM IN" gpio="GPIO 25" description="Motor speed signal — LEDC channel 0" />
                      <PinRow pin="GND" gpio="GND" description="Shared ground with driver power supply" />
                    </tbody>
                  </table>
                  <Note variant="warn">
                    The motor driver's power supply (VM / VCC) must come from your external power supply, not the ESP32's 3.3V or 5V pin. Running even a small motor from the ESP32 will brown it out.
                  </Note>
                </div>

                <div>
                  <p className="text-xs font-bold text-foreground mb-2">SD Card Module (SPI) — Optional</p>
                  <table className="w-full border-collapse">
                    <thead>
                      <tr>
                        <th className="text-left text-[9px] font-bold text-muted-foreground uppercase tracking-wider pb-1.5 pr-4">SD Module Pin</th>
                        <th className="text-left text-[9px] font-bold text-muted-foreground uppercase tracking-wider pb-1.5 pr-4">ESP32 GPIO</th>
                        <th className="text-left text-[9px] font-bold text-muted-foreground uppercase tracking-wider pb-1.5">Notes</th>
                      </tr>
                    </thead>
                    <tbody>
                      <PinRow pin="CS"   gpio="GPIO 5"  description="Chip Select" />
                      <PinRow pin="MOSI" gpio="GPIO 23" description="SPI MOSI" />
                      <PinRow pin="MISO" gpio="GPIO 19" description="SPI MISO" />
                      <PinRow pin="SCK"  gpio="GPIO 18" description="SPI Clock" />
                      <PinRow pin="VCC"  gpio="3.3V"   description="Some modules need 5V — check your breakout" />
                      <PinRow pin="GND"  gpio="GND"    description="Common ground" />
                    </tbody>
                  </table>
                </div>

                <Collapsible title="Wiring diagram (ASCII)">
                  <CodeBlock>{`ESP32                  MPU-6050
─────────────────────────────────
GPIO 21 (SDA) ───────── SDA
GPIO 22 (SCL) ───────── SCL
3.3V          ───────── VCC
GND           ───────── GND, AD0

ESP32                  Motor Driver
─────────────────────────────────
GPIO 25 (PWM) ───────── PWM IN
GND           ───────── GND (shared with driver PSU)

ESP32                  SD Card
─────────────────────────────────
GPIO  5 (CS)  ───────── CS
GPIO 23 (MOSI)───────── MOSI
GPIO 19 (MISO)───────── MISO
GPIO 18 (SCK) ───────── SCK
3.3V          ───────── VCC
GND           ───────── GND`}</CodeBlock>
                </Collapsible>
              </div>
            </section>

            {/* ── Firmware ─────────────────────────────────────────────── */}
            <section className="space-y-5">
              <SectionAnchor id="firmware" />
              <div className="flex items-center gap-3 border-b border-border/60 pb-3">
                <div className="w-7 h-7 rounded bg-primary/10 flex items-center justify-center">
                  <HardDrive className="w-4 h-4 text-primary" />
                </div>
                <h3 className="text-base font-bold text-foreground">Loading the Firmware</h3>
              </div>

              <div className="space-y-1">
                <Step n={1} title="Install the Arduino IDE">
                  <p>Download <strong className="text-foreground">Arduino IDE 2.x</strong> from <span className="font-mono text-primary">arduino.cc</span>. Open it and go to <strong className="text-foreground">File → Preferences</strong>.</p>
                  <p>Add the ESP32 board URL to Additional Boards Manager URLs:</p>
                  <CodeBlock>{"https://raw.githubusercontent.com/espressif/arduino-esp32/gh-pages/package_esp32_index.json"}</CodeBlock>
                </Step>
                <Step n={2} title="Install the ESP32 board package">
                  <p>Go to <strong className="text-foreground">Tools → Board → Boards Manager</strong>. Search for <Code>esp32</Code> by Espressif Systems and install it (latest stable version).</p>
                </Step>
                <Step n={3} title="Install required libraries">
                  <p>Open <strong className="text-foreground">Sketch → Include Library → Manage Libraries</strong> and install all of these:</p>
                  <div className="grid grid-cols-2 gap-1 mt-1">
                    {["MPU6050 by Electronic Cats", "ArduinoJson by Benoit Blanchon", "AsyncTCP by dvarrel", "ESPAsyncWebServer by lacamera", "ElegantOTA by Ayush Sharma", "SD (built-in)"].map((lib) => (
                      <div key={lib} className="flex items-center gap-1.5">
                        <Circle className="w-2 h-2 text-primary shrink-0" />
                        <span className="font-mono text-[10px] text-foreground">{lib}</span>
                      </div>
                    ))}
                  </div>
                </Step>
                <Step n={4} title="Open and configure the firmware">
                  <p>Open <Code>docs/ESP32-FIRMWARE/gyro_monitor/gyro_monitor.ino</Code> from this project's repository.</p>
                  <p>At the top of the file, set your WiFi credentials so the ESP32 can connect on first boot:</p>
                  <CodeBlock>{`#define WIFI_SSID     "YourNetworkName"
#define WIFI_PASSWORD "YourPassword"`}</CodeBlock>
                  <Note variant="tip">You can leave these blank and configure the network from Settings → Device Connection after flashing. The firmware will start in Access Point mode so you can reach the dashboard to configure it.</Note>
                </Step>
                <Step n={5} title="Flash to the ESP32">
                  <p>Select <strong className="text-foreground">Tools → Board → ESP32 Dev Module</strong> and the correct COM port. Set Upload Speed to <Code>921600</Code> for faster flashing.</p>
                  <p>Click the <strong className="text-foreground">Upload</strong> button (→). Hold the <Code>BOOT</Code> button on the ESP32 if it doesn't enter flash mode automatically.</p>
                  <p>When you see <Code>Leaving... Hard resetting via RTS pin</Code> the flash is complete.</p>
                </Step>
                <Step n={6} title="Verify it's running">
                  <p>Open the Arduino Serial Monitor at <Code>115200 baud</Code>. You should see the handshake lines, then live data:</p>
                  <CodeBlock>{`[BOOT] GyroMonitor v1.0.0
[WiFi] Connecting to Lab-WiFi-5G...
[WiFi] Connected — IP: 192.168.1.42
[IMU]  MPU-6050 initialized
[SD]   SD card mounted — 3.8 GB free

DEVICE_INFO:esp32LOGIC|VERSION:1.0|COMPONENTS:MPU6050,ESC,TEMP_SENSOR|BAUD:115200
HEALTH:MPU6050=OK|ESC=OK|TEMP_SENSOR=OK

{"rpm":0,"tiltX":0.12,"tiltY":-0.04,"temp":24.6,"pwm":0}
{"rpm":0,"tiltX":0.11,"tiltY":-0.05,"temp":24.6,"pwm":0}`}</CodeBlock>
                  <Note variant="info">The two <Code>DEVICE_INFO</Code> / <Code>HEALTH</Code> lines are how the dashboard auto-detects your sensors. If they don't appear, see the Auto-Detection section below for the Arduino code to add.</Note>
                  <Note variant="tip">No IP address shown? The ESP32 couldn't reach your network. Open Settings → Device Connection to reconfigure or switch to Hotspot mode.</Note>
                </Step>
              </div>

              {/* ── OTA Wireless Upload ──────────────────────────────────── */}
              <div className="pt-2 mt-1 border-t border-border/40 space-y-4">
                <div className="flex items-center gap-2">
                  <Wifi className="w-4 h-4 text-primary shrink-0" />
                  <p className="text-xs font-bold text-foreground">Uploading firmware wirelessly (OTA)</p>
                </div>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  Once the firmware has been flashed <em>once</em> via USB (to get the OTA update handler onto the device),
                  every subsequent update can be pushed over WiFi — no cable, no Arduino IDE upload button needed.
                  The dashboard's <strong className="text-foreground">Settings → Firmware Update</strong> panel handles everything.
                </p>

                <Note variant="warn">
                  <strong>First flash must be via USB.</strong> OTA only works after ElegantOTA is already running on the board.
                  Follow Steps 1–6 above once, then use this method for all future updates.
                </Note>

                <div className="space-y-1">
                  <Step n={1} title="Build the compiled binary in Arduino IDE">
                    <p>Open your sketch in Arduino IDE, make sure the correct board (<Code>ESP32 Dev Module</Code>) is selected, then go to <strong className="text-foreground">Sketch → Export Compiled Binary</strong>.</p>
                    <p>Arduino IDE compiles and saves a <Code>.bin</Code> file next to your <Code>.ino</Code> file — look for a file ending in <Code>.bin</Code> (not <Code>_ota.bin</Code>, though either works).</p>
                    <Note variant="tip">You can also find the binary in the Arduino build cache. On Windows it's typically under <Code>%TEMP%\arduino_build_*</Code>. The "Export Compiled Binary" method is simpler and puts it somewhere predictable.</Note>
                  </Step>
                  <Step n={2} title="Make sure the ESP32 is reachable on the network">
                    <p>The ESP32 must be connected to WiFi (Station mode) or running as a hotspot that your browser can reach. The connectivity chip in the dashboard header should show a green dot and an IP address.</p>
                    <p>If it shows <strong className="text-destructive">Disconnected</strong>, go to <strong className="text-foreground">Settings → Device Connection</strong> and configure WiFi first.</p>
                  </Step>
                  <Step n={3} title="Open Settings → Firmware Update">
                    <p>In the dashboard, click <strong className="text-foreground">Settings</strong> in the header, then scroll to the <strong className="text-foreground">Firmware Update</strong> panel. It shows the currently connected device IP and the last-flashed timestamp if a previous OTA was done.</p>
                  </Step>
                  <Step n={4} title="Select the .bin file and flash">
                    <p>Click <strong className="text-foreground">Choose .bin file</strong> and pick the binary you exported in Step 1. The Flash button activates once a valid file is selected.</p>
                    <p>Click <strong className="text-foreground">Flash firmware</strong>. The dashboard uploads the binary to the ESP32's <Code>/update</Code> endpoint. A progress bar shows upload progress.</p>
                    <Note variant="info">The Flash button is disabled when the ESP32 is offline. If it's greyed out, check the connectivity chip — the device IP must be known before OTA can proceed.</Note>
                  </Step>
                  <Step n={5} title="Wait for the reboot">
                    <p>After a successful upload the ESP32 reboots automatically. The dashboard polls for reconnection for up to 60 seconds — you'll see a <strong className="text-foreground">"Waiting for device to reboot…"</strong> status in the panel.</p>
                    <p>Once the ESP32 comes back online and the handshake lines are received, the dashboard reconnects automatically and the connectivity chip returns to green. The firmware update is complete.</p>
                    <Note variant="warn">
                      Do not unplug power during the flash. A power cut mid-write corrupts the firmware partition and requires a USB cable recovery. Keep the ESP32 powered throughout.
                    </Note>
                  </Step>
                </div>

                <div className="border border-border/60 rounded-lg overflow-hidden">
                  <div className="px-4 py-2.5 bg-muted/20 border-b border-border/40">
                    <p className="text-[10px] font-bold text-foreground">OTA troubleshooting</p>
                  </div>
                  <div className="divide-y divide-border/40">
                    {[
                      { problem: "Flash button is greyed out", fix: "The ESP32 IP is not known. Check that the device is connected to WiFi and the connectivity chip shows an IP address. If using hotspot mode, connect your computer to the ESP32's access point first." },
                      { problem: "Upload starts but fails mid-way", fix: "Usually a weak WiFi signal or the ESP32 running out of heap during the write. Move the ESP32 closer to the router, or reduce firmware size by removing unused libraries." },
                      { problem: '"Device offline" even though the ESP32 is powered', fix: "The /update route may not be compiled in. Confirm ElegantOTA is installed and that the sketch calls ElegantOTA.begin(&server) inside setup(). Re-flash via USB to add it." },
                      { problem: "Reboots but dashboard never reconnects", fix: "The new firmware may have a startup crash. Open the Arduino Serial Monitor at 115200 baud and check for error output. The most common cause is a missing sensor that the new sketch expects to be present." },
                    ].map((r) => (
                      <div key={r.problem} className="px-4 py-2.5 grid grid-cols-[1fr_1.4fr] gap-4">
                        <div>
                          <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider mb-0.5">Problem</p>
                          <p className="text-[10px] font-semibold text-foreground">{r.problem}</p>
                        </div>
                        <div>
                          <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider mb-0.5">Fix</p>
                          <p className="text-[10px] text-muted-foreground leading-relaxed">{r.fix}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* ── Writing your own compatible firmware ─────────────────── */}
              <div className="pt-3 mt-1 border-t border-border/40 space-y-2">
                <p className="text-xs font-bold text-foreground">Writing your own compatible firmware</p>
                <p className="text-[10px] text-muted-foreground leading-relaxed">
                  You don't have to use the provided <Code>gyro_monitor.ino</Code>. Any Arduino sketch that follows
                  the two-step protocol below will work with the dashboard automatically — match the data format
                  and the charts, panels, and auto-detection all activate on their own.
                </p>
              </div>

              <Collapsible title="Protocol reference — startup handshake, JSON fields &amp; commands">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <p className="text-[10px] font-semibold text-foreground">Serial port settings (must be exact)</p>
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { label: "Baud rate", value: "115200" },
                        { label: "Data bits", value: "8" },
                        { label: "Stop bits", value: "1" },
                        { label: "Parity", value: "None" },
                        { label: "Flow control", value: "None" },
                        { label: "Line ending", value: "\\n (LF)" },
                      ].map((r) => (
                        <div key={r.label} className="border border-border/60 rounded p-2 space-y-0.5">
                          <p className="text-[9px] text-muted-foreground uppercase tracking-wider">{r.label}</p>
                          <p className="text-xs font-mono font-bold text-foreground">{r.value}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <p className="text-[10px] font-semibold text-foreground">Step 1 — Startup handshake (send once in setup(), after hardware init)</p>
                    <CodeBlock>{`Serial.println("DEVICE_INFO:esp32LOGIC|VERSION:1.0|COMPONENTS:MPU6050|BAUD:115200");
Serial.print("HEALTH:MPU6050="); Serial.println(mpuOk ? "OK" : "FAIL");`}</CodeBlock>
                    <table className="w-full border-collapse">
                      <tbody>
                        <PinRow pin="COMPONENTS:" gpio="MPU6050,ESC,…" description="Comma-separated — include only hardware physically wired" />
                        <PinRow pin="HEALTH:" gpio="MPU6050=OK|ESC=FAIL" description="OK or FAIL for each component — FAIL keeps panel visible but flags error" />
                        <PinRow pin="MPU6050" gpio="→ Tilt X/Y, Rotation Z" description="Also accepted: IMU, GYRO" />
                        <PinRow pin="ESC" gpio="→ RPM, PWM, Motor Control" description="Also accepted: MOTOR, PWM" />
                        <PinRow pin="TEMP_SENSOR" gpio="→ Temperature chart" description="Also accepted: TEMP, DS18, NTC" />
                        <PinRow pin="VIBRATION" gpio="→ Vibration chart" description="Also accepted: ACCEL, PIEZO" />
                        <PinRow pin="SD_CARD" gpio="→ SD Card panel (Settings)" description="Also accepted: SD, SDCARD" />
                      </tbody>
                    </table>
                  </div>
                  <div className="space-y-1.5">
                    <p className="text-[10px] font-semibold text-foreground">Step 2 — Stream one JSON line per loop at ~4 Hz</p>
                    <CodeBlock>{`{"rpm":0,"tiltX":2.34,"tiltY":-1.12,"rotationZ":150.2,"temp":25.0,"pwm":0.0,"vibration":0.62}`}</CodeBlock>
                    <table className="w-full border-collapse">
                      <thead>
                        <tr>
                          <th className="text-left text-[9px] font-bold text-muted-foreground uppercase tracking-wider pb-1.5 pr-3">Key</th>
                          <th className="text-left text-[9px] font-bold text-muted-foreground uppercase tracking-wider pb-1.5 pr-3">Unit</th>
                          <th className="text-left text-[9px] font-bold text-muted-foreground uppercase tracking-wider pb-1.5">Notes</th>
                        </tr>
                      </thead>
                      <tbody>
                        <PinRow pin="tiltX / tiltY" gpio="degrees" description="Roll and pitch — triggers emergency stop at maxTiltAngle" />
                        <PinRow pin="rotationZ" gpio="deg/s" description="Gyro Z rate — gyroZ_raw / 131 at ±250 dps" />
                        <PinRow pin="rpm" gpio="RPM" description="Flywheel speed; 0 when stopped" />
                        <PinRow pin="temp" gpio="°C" description="Triggers warning/stop at tempWarnThreshold / tempCritThreshold" />
                        <PinRow pin="pwm" gpio="0–100 %" description="Motor duty cycle percentage" />
                        <PinRow pin="vibration" gpio="mm/s" description="Smoothed absolute delta of gyro Z (see example sketch below)" />
                      </tbody>
                    </table>
                    <Note variant="warn">Every line must be valid JSON ending with a newline. Lines that fail to parse are silently dropped. Send the handshake only once in setup() — never inside the loop.</Note>
                  </div>
                  <div className="space-y-1.5">
                    <p className="text-[10px] font-semibold text-foreground">Incoming commands from the dashboard (read in loop())</p>
                    <CodeBlock>{`if (Serial.available()) {
  String line = Serial.readStringUntil('\\n');
  line.trim();
  if (line.startsWith("{")) {
    if (line.indexOf("\\"stop\\"") >= 0) Serial.println("{\\"ack\\":\\"stop\\"}");
  }
}`}</CodeBlock>
                    <div className="grid grid-cols-2 gap-2 mt-1">
                      {[
                        { cmd: '{"cmd":"motor","pwm":128}', desc: 'Set motor duty cycle (0–255 raw LEDC value, not a percentage)' },
                        { cmd: '{"cmd":"stop"}',             desc: 'Emergency stop — implement this in every sketch without exception' },
                      ].map((r) => (
                        <div key={r.cmd} className="border border-border/60 rounded p-2 space-y-0.5">
                          <code className="text-[10px] font-mono text-primary block">{r.cmd}</code>
                          <p className="text-[10px] text-muted-foreground">{r.desc}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </Collapsible>

              <Collapsible title="Example sketch — Phase 0 angle measurement (adapted for this dashboard)">
                <div className="space-y-3 text-[10px] text-muted-foreground">
                  <p>A real Phase 0 test sketch adapted to output the correct JSON format and startup handshake. Features Kalman-filtered tilt, optional reference-zeroing via button or serial, and a bonus WiFi AP with HTTP telemetry.</p>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { label: "Hardware", value: "ESP32 + MPU-6050 only" },
                      { label: "Zero button", value: "GPIO 23 or type 'Z' in Serial Monitor" },
                      { label: "Accel range", value: "±8 g (4096 LSB/g)" },
                      { label: "Gyro range", value: "±250 dps (131 LSB/dps)" },
                      { label: "WiFi AP", value: "GyroMonitorESP32 / gyro12345" },
                      { label: "HTTP endpoint", value: "192.168.4.1/telemetry" },
                    ].map(r => (
                      <div key={r.label} className="border border-border/60 rounded p-2 space-y-0.5">
                        <p className="text-[9px] text-muted-foreground uppercase tracking-wider">{r.label}</p>
                        <p className="font-mono text-[10px] text-foreground">{r.value}</p>
                      </div>
                    ))}
                  </div>
                  <CodeBlock>{`/*
 * Gyro Monitor — Phase 0 Angle Measurement (adapted)
 * Kalman-filtered tilt streamed to the Gyroscope Monitor dashboard.
 *
 * Hardware : ESP32 + MPU-6050  (SDA=GPIO 21, SCL=GPIO 22)
 * Zero btn : GPIO 23 — or type 'Z' in Serial Monitor to zero reference
 */
#include <Arduino.h>
#include <Wire.h>
#include <WiFi.h>
#include <WebServer.h>
#include <math.h>

#define MPU_ADDR     0x68
#define RESET_BTN    23
#define ACCEL_XOUT_H 0x3B
#define PWR_MGMT_1   0x6B
#define ACCEL_CONFIG 0x1C
#define GYRO_CONFIG  0x1B
#define WIFI_AP_SSID "GyroMonitorESP32"
#define WIFI_AP_PASS "gyro12345"
#define SEND_INTERVAL 250UL   // 4 Hz

// ── Kalman filter ─────────────────────────────────────────────────────────────
const float Q_ANGLE = 0.001f, Q_BIAS = 0.003f, R_MEAS = 0.03f;

struct KalmanState {
  float angle = 0.0f, bias = 0.0f;
  float P[2][2] = {{1.0f, 0.0f}, {0.0f, 1.0f}};
  bool  seeded  = false;
} kX, kY;

void kalmanStep(KalmanState &k, float accelAngle, float gyroRate, float dt) {
  if (!k.seeded) { k.angle = accelAngle; k.seeded = true; return; }
  float rate = gyroRate - k.bias;
  k.angle += dt * rate;
  k.P[0][0] += dt*(dt*k.P[1][1] - k.P[0][1] - k.P[1][0] + Q_ANGLE);
  k.P[0][1] -= dt*k.P[1][1]; k.P[1][0] -= dt*k.P[1][1];
  k.P[1][1] += Q_BIAS * dt;
  float S=k.P[0][0]+R_MEAS, K0=k.P[0][0]/S, K1=k.P[1][0]/S;
  float y=accelAngle-k.angle;
  k.angle+=K0*y; k.bias+=K1*y;
  float p00=k.P[0][0], p01=k.P[0][1];
  k.P[0][0]-=K0*p00; k.P[0][1]-=K0*p01;
  k.P[1][0]-=K1*p00; k.P[1][1]-=K1*p01;
}

// ── Sensor state ──────────────────────────────────────────────────────────────
int16_t rawAX,rawAY,rawAZ,rawGX,rawGY,rawGZ;
float   aX,aY,aZ,gX,gY,gZ;
float   tiltX=0,tiltY=0,rotZ=0,refX=0,refY=0;
bool    refSet=false;
float   vibSmooth=0,prevGZ=0;
unsigned long lastKalmanMs=0, lastSendMs=0;

WebServer server(80);
String    lastJson="{}";

// ── MPU-6050 init — returns true if WHO_AM_I register reads 0x68 ─────────────
bool initMPU6050() {
  Wire.beginTransmission(MPU_ADDR);
  Wire.write(PWR_MGMT_1); Wire.write(0x00);       // wake from sleep
  if (Wire.endTransmission(true) != 0) return false;
  delay(100);
  Wire.beginTransmission(MPU_ADDR);
  Wire.write(ACCEL_CONFIG); Wire.write(0x10);     // ±8 g  →  4096 LSB/g
  Wire.endTransmission(true);
  Wire.beginTransmission(MPU_ADDR);
  Wire.write(GYRO_CONFIG); Wire.write(0x00);      // ±250 dps  → 131 LSB/dps
  Wire.endTransmission(true);
  delay(100);
  // Verify device ID via WHO_AM_I register (0x75 should return 0x68)
  Wire.beginTransmission(MPU_ADDR); Wire.write(0x75); Wire.endTransmission(false);
  Wire.requestFrom(MPU_ADDR, 1, 1);
  return Wire.available() && Wire.read() == 0x68;
}

// ── Read 14 bytes (accel + skip temp + gyro) and convert ─────────────────────
void readMPU6050() {
  Wire.beginTransmission(MPU_ADDR);
  Wire.write(ACCEL_XOUT_H); Wire.endTransmission(false);
  Wire.requestFrom(MPU_ADDR, 14, 1);
  if (Wire.available() < 14) return;
  rawAX=(Wire.read()<<8)|Wire.read(); rawAY=(Wire.read()<<8)|Wire.read();
  rawAZ=(Wire.read()<<8)|Wire.read(); Wire.read(); Wire.read();   // skip temp
  rawGX=(Wire.read()<<8)|Wire.read(); rawGY=(Wire.read()<<8)|Wire.read();
  rawGZ=(Wire.read()<<8)|Wire.read();
  aX=rawAX/4096.0f; aY=rawAY/4096.0f; aZ=rawAZ/4096.0f;  // ±8 g scale
  gX=rawGX/131.0f;  gY=rawGY/131.0f;  gZ=rawGZ/131.0f;   // ±250 dps scale
}

// ── Kalman-filtered tilt + vibration estimate ─────────────────────────────────
void updateAngles() {
  unsigned long now = millis();
  float dt = constrain((now-lastKalmanMs)/1000.0f, 0.001f, 0.5f);
  lastKalmanMs = now;
  kalmanStep(kX, atan2f(aY, aZ)*180.0f/M_PI,                   gX, dt); // roll
  kalmanStep(kY, atan2f(-aX, sqrtf(aY*aY+aZ*aZ))*180.0f/M_PI, gY, dt); // pitch
  tiltX=kX.angle; tiltY=kY.angle; rotZ=gZ;
  float delta=fabsf(gZ-prevGZ); prevGZ=gZ;
  vibSmooth=vibSmooth*0.85f+delta*0.15f;  // low-pass vibration estimate
}

// ── Build and send one JSON telemetry line ────────────────────────────────────
void sendTelemetry() {
  float tx=tiltX, ty=tiltY;
  if (refSet) {                // report angle offset from zeroed reference
    tx-=refX; ty-=refY;
    while(tx> 180.0f) tx-=360.0f; while(tx<-180.0f) tx+=360.0f;
    while(ty> 180.0f) ty-=360.0f; while(ty<-180.0f) ty+=360.0f;
    if(fabsf(tx)<0.4f) tx=0.0f; if(fabsf(ty)<0.4f) ty=0.0f;
  }
  float vib=min(vibSmooth*0.04f, 14.0f);
  lastJson = String("{\\"rpm\\":0,\\"tiltX\\":") + String(tx,2)
           + ",\\"tiltY\\":" + String(ty,2)
           + ",\\"rotationZ\\":" + String(rotZ,2)
           + ",\\"temp\\":25.0,\\"pwm\\":0.0,\\"vibration\\":" + String(vib,2) + "}";
  Serial.println(lastJson);
}

void setup() {
  Serial.begin(115200);
  delay(200);
  pinMode(RESET_BTN, INPUT_PULLUP);
  Wire.begin(21, 22); Wire.setClock(400000);
  bool mpuOk = initMPU6050();

  // Dashboard handshake — send AFTER hardware init so HEALTH reflects reality
  Serial.println("DEVICE_INFO:esp32LOGIC|VERSION:1.0|COMPONENTS:MPU6050|BAUD:115200");
  Serial.print("HEALTH:MPU6050="); Serial.println(mpuOk ? "OK" : "FAIL");

  // Optional: WiFi AP + HTTP /telemetry endpoint
  WiFi.softAP(WIFI_AP_SSID, WIFI_AP_PASS);
  server.on("/telemetry", []() { server.send(200,"application/json",lastJson); });
  server.on("/status",    []() { server.send(200,"text/plain","OK"); });
  server.onNotFound(      []() { server.send(404,"text/plain","Not found"); });
  server.begin();
  lastKalmanMs=millis();
}

void loop() {
  // Handle dashboard commands and serial zero-reset
  if (Serial.available()) {
    String line = Serial.readStringUntil('\\n');
    line.trim();
    if (line.startsWith("{")) {
      if (line.indexOf("\\"stop\\"") >= 0) Serial.println("{\\"ack\\":\\"stop\\"}");
    } else if (line=="Z" || line=="z") {
      refX=tiltX; refY=tiltY; refSet=true;
    }
  }
  // Hardware zero button
  if (digitalRead(RESET_BTN)==LOW) {
    delay(50);
    if (digitalRead(RESET_BTN)==LOW) { refX=tiltX; refY=tiltY; refSet=true; delay(300); }
  }
  readMPU6050();
  updateAngles();
  if (millis()-lastSendMs>=SEND_INTERVAL) { lastSendMs=millis(); sendTelemetry(); }
  server.handleClient();
}`}</CodeBlock>
                  <div className="space-y-1 pt-1">
                    <p className="text-[10px] font-semibold text-foreground">What was changed vs the original sketch</p>
                    {[
                      "Handshake moved to after initMPU6050() — HEALTH now reflects the actual init result",
                      "Removed tiltZ and errorX/Y/Z keys — dashboard only reads tiltX, tiltY, rotationZ",
                      "Added real vibration estimate (smoothed abs gyro-Z delta) instead of hardcoded 0",
                      "Roll/pitch formulas aligned with reference firmware: atan2(ay,az) and atan2(−ax,√(ay²+az²))",
                      "WHO_AM_I check (register 0x75 → 0x68) for reliable hardware health detection",
                      "stop command handler added — always implement this when a motor is connected",
                      "Non-JSON debug prints removed from the data loop to prevent serial parse errors",
                    ].map((s, i) => (
                      <div key={i} className="flex items-start gap-2">
                        <span className="text-[9px] font-bold text-chart-2 mt-0.5 shrink-0">✓</span>
                        <span>{s}</span>
                      </div>
                    ))}
                  </div>
                  <Note variant="tip">
                    No motor in this sketch so <Code>rpm</Code> and <Code>pwm</Code> stay at 0 and <Code>ESC</Code> is absent from <Code>COMPONENTS</Code>.
                    The Motor Control and RPM panels will show an offline overlay — that's expected.
                  </Note>
                </div>
              </Collapsible>
            </section>

            {/* ── Connecting ───────────────────────────────────────────── */}
            <section className="space-y-5">
              <SectionAnchor id="connecting" />
              <div className="flex items-center gap-3 border-b border-border/60 pb-3">
                <div className="w-7 h-7 rounded bg-primary/10 flex items-center justify-center">
                  <Wifi className="w-4 h-4 text-primary" />
                </div>
                <h3 className="text-base font-bold text-foreground">Connecting the ESP32 to the Dashboard</h3>
              </div>
              <p className="text-[11px] text-muted-foreground">There are three ways to connect. Choose the one that suits your setup.</p>

              <div className="space-y-4">
                {/* WiFi Station */}
                <div className="border border-border rounded-lg overflow-hidden">
                  <div className="flex items-center gap-3 px-4 py-3 bg-muted/20 border-b border-border/60">
                    <Wifi className="w-4 h-4 text-chart-2" />
                    <div>
                      <p className="text-xs font-bold text-foreground">Option A — WiFi Station (Recommended)</p>
                      <p className="text-[10px] text-muted-foreground">ESP32 joins your existing WiFi network. Dashboard runs in the browser on the same network.</p>
                    </div>
                    <span className="ml-auto text-[9px] font-bold text-chart-2 bg-chart-2/10 px-2 py-0.5 rounded-full">Best for most setups</span>
                  </div>
                  <div className="px-4 py-3 space-y-2 text-[11px] text-muted-foreground">
                    <div className="space-y-1">
                      {[
                        "Open Settings → Device Connection",
                        'Select "WiFi Station" mode',
                        "Enter your network SSID and password",
                        'Click "Apply to device"',
                        "The ESP32 reboots and joins your network",
                        "The dashboard connects automatically via WebSocket",
                      ].map((s, i) => (
                        <div key={i} className="flex items-start gap-2">
                          <span className="text-[9px] font-bold text-primary mt-0.5 w-4 shrink-0">{i + 1}.</span>
                          <span>{s}</span>
                        </div>
                      ))}
                    </div>
                    <Note variant="tip">If the ESP32 and your browser are on the same WiFi, everything works with zero additional configuration.</Note>
                  </div>
                </div>

                {/* WiFi Hotspot */}
                <div className="border border-border rounded-lg overflow-hidden">
                  <div className="flex items-center gap-3 px-4 py-3 bg-muted/20 border-b border-border/60">
                    <Radio className="w-4 h-4 text-chart-4" />
                    <div>
                      <p className="text-xs font-bold text-foreground">Option B — WiFi Hotspot</p>
                      <p className="text-[10px] text-muted-foreground">ESP32 creates its own network. Connect your laptop or phone to it.</p>
                    </div>
                  </div>
                  <div className="px-4 py-3 space-y-2 text-[11px] text-muted-foreground">
                    <div className="space-y-1">
                      {[
                        'In Settings → Device Connection, choose "WiFi Hotspot"',
                        "Set a hotspot name (SSID) and optional password",
                        'Click "Apply to device" — the ESP32 starts broadcasting the network',
                        "On your laptop/phone, join the ESP32 hotspot from WiFi settings",
                        "Open the dashboard — the ESP32 is reachable at 192.168.4.1",
                      ].map((s, i) => (
                        <div key={i} className="flex items-start gap-2">
                          <span className="text-[9px] font-bold text-primary mt-0.5 w-4 shrink-0">{i + 1}.</span>
                          <span>{s}</span>
                        </div>
                      ))}
                    </div>
                    <Note variant="info">In hotspot mode you won't have internet on the connected device (unless the ESP32 also bridges it, which this firmware doesn't do). The dashboard still works fully.</Note>
                  </div>
                </div>

                {/* USB Serial */}
                <div className="border border-border rounded-lg overflow-hidden">
                  <div className="flex items-center gap-3 px-4 py-3 bg-muted/20 border-b border-border/60">
                    <Usb className="w-4 h-4 text-muted-foreground" />
                    <div>
                      <p className="text-xs font-bold text-foreground">Option C — USB Serial (Desktop App Only)</p>
                      <p className="text-[10px] text-muted-foreground">Direct USB cable from your computer to the ESP32. No WiFi needed.</p>
                    </div>
                    <span className="ml-auto text-[9px] font-bold text-muted-foreground bg-muted/40 px-2 py-0.5 rounded-full">Requires desktop app</span>
                  </div>
                  <div className="px-4 py-3 space-y-2 text-[11px] text-muted-foreground">
                    <div className="space-y-1">
                      {[
                        "Download and run the Gyroscope Monitor desktop app (see Releases in the GitHub repo)",
                        "Plug the ESP32 into your computer via USB",
                        "Go to Settings → Serial Device (ESP32)",
                        "Click Scan — your ESP32 should appear as a COM port",
                        "Select it, set baud rate to 115200, click Connect",
                        "Live hardware data starts flowing immediately",
                      ].map((s, i) => (
                        <div key={i} className="flex items-start gap-2">
                          <span className="text-[9px] font-bold text-primary mt-0.5 w-4 shrink-0">{i + 1}.</span>
                          <span>{s}</span>
                        </div>
                      ))}
                    </div>
                    <Note variant="tip">Install the CP210x or CH340 USB driver if your OS doesn't detect the COM port. Common with cheap clone ESP32 boards.</Note>
                  </div>
                </div>
              </div>
            </section>

            {/* ── Auto-Detection ───────────────────────────────────────── */}
            <section className="space-y-5">
              <SectionAnchor id="autodetect" />
              <div className="flex items-center gap-3 border-b border-border/60 pb-3">
                <div className="w-7 h-7 rounded bg-primary/10 flex items-center justify-center">
                  <Cpu className="w-4 h-4 text-primary" />
                </div>
                <h3 className="text-base font-bold text-foreground">Hardware Auto-Detection &amp; Sensor Panels</h3>
              </div>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                When the ESP32 connects via USB, the firmware sends two special startup lines <em>before</em> streaming sensor data.
                The dashboard reads these to know exactly which sensors are physically present and whether each one initialised successfully.
                Charts and controls are then shown or hidden automatically — no manual configuration needed.
              </p>

              <div className="space-y-4">
                {/* Handshake protocol */}
                <div>
                  <p className="text-xs font-bold text-foreground mb-2">The two startup lines your firmware must send</p>
                  <CodeBlock>{`DEVICE_INFO:esp32LOGIC|VERSION:1.0|COMPONENTS:MPU6050,ESC,TEMP_SENSOR|BAUD:115200
HEALTH:MPU6050=OK|ESC=OK|TEMP_SENSOR=FAIL

{"rpm":1500,"tiltX":2.3,"tiltY":-1.1,"temp":42.5,"pwm":75}   ← normal data`}</CodeBlock>
                  <p className="text-[10px] text-muted-foreground mt-2 leading-relaxed">
                    <Code>DEVICE_INFO</Code> lists the components physically installed.{" "}
                    <Code>HEALTH</Code> reports whether each one initialised without error.
                    Both lines are sent once at startup; data JSON follows continuously at your loop rate (4 Hz recommended).
                  </p>
                </div>

                {/* Arduino code */}
                <div>
                  <p className="text-xs font-bold text-foreground mb-2">Arduino <Code>setup()</Code> code that produces these lines</p>
                  <CodeBlock>{`void setup() {
  Serial.begin(115200);
  delay(1000);  // let the host-side serial manager open the port

  // ── Step 1: announce which components are installed ──────────────
  Serial.println(
    "DEVICE_INFO:esp32LOGIC|VERSION:1.0"
    "|COMPONENTS:MPU6050,ESC,TEMP_SENSOR"
    "|BAUD:115200"
  );

  // ── Step 2: initialise each component, report health ─────────────
  bool mpu_ok  = initMPU6050();
  bool esc_ok  = initESC();
  bool temp_ok = initTempSensor();

  Serial.print("HEALTH:");
  Serial.print("MPU6050=");   Serial.print(mpu_ok  ? "OK" : "FAIL");
  Serial.print("|ESC=");      Serial.print(esc_ok  ? "OK" : "FAIL");
  Serial.print("|TEMP_SENSOR="); Serial.println(temp_ok ? "OK" : "FAIL");

  // ── Step 3: start the main loop ───────────────────────────────────
}`}</CodeBlock>
                </div>

                {/* Component name mapping */}
                <div>
                  <p className="text-xs font-bold text-foreground mb-2">Component name → Dashboard panel mapping</p>
                  <table className="w-full border-collapse">
                    <thead>
                      <tr>
                        <th className="text-left text-[9px] font-bold text-muted-foreground uppercase tracking-wider pb-1.5 pr-4">Name in COMPONENTS</th>
                        <th className="text-left text-[9px] font-bold text-muted-foreground uppercase tracking-wider pb-1.5 pr-4">Dashboard panels affected</th>
                        <th className="text-left text-[9px] font-bold text-muted-foreground uppercase tracking-wider pb-1.5">Also matches</th>
                      </tr>
                    </thead>
                    <tbody>
                      <PinRow pin="MPU6050" gpio="Tilt X/Y chart" description="IMU, GYRO" />
                      <PinRow pin="ESC" gpio="RPM chart, PWM chart, Motor Control" description="MOTOR, PWM" />
                      <PinRow pin="TEMP_SENSOR" gpio="Temperature chart" description="TEMP, DS18, NTC" />
                      <PinRow pin="VIBRATION" gpio="Vibration chart" description="ACCEL, PIEZO" />
                      <PinRow pin="SD_CARD" gpio="SD Card panel (Settings)" description="SD, SDCARD" />
                    </tbody>
                  </table>
                </div>

                {/* What the badges mean */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="border border-green-500/30 bg-green-500/5 rounded-lg p-3 space-y-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[9px] font-bold text-green-400 bg-green-400/10 border border-green-400/30 rounded px-1 py-0.5">✓ OK</span>
                      <p className="text-[10px] font-semibold text-foreground">Sensor healthy</p>
                    </div>
                    <p className="text-[10px] text-muted-foreground">Component is listed in COMPONENTS and reported OK in HEALTH. Panel is fully active.</p>
                  </div>
                  <div className="border border-red-500/30 bg-red-500/5 rounded-lg p-3 space-y-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[9px] font-bold text-red-400 bg-red-400/10 border border-red-400/30 rounded px-1 py-0.5">✗ FAIL</span>
                      <p className="text-[10px] font-semibold text-foreground">Sensor init failed</p>
                    </div>
                    <p className="text-[10px] text-muted-foreground">Component is installed but failed to initialise. Check wiring and power. Panel still shows (may read zero).</p>
                  </div>
                  <div className="border border-border/60 bg-muted/10 rounded-lg p-3 space-y-1 col-span-2">
                    <div className="flex items-center gap-1.5">
                      <WifiOff className="w-3.5 h-3.5 text-muted-foreground/60" />
                      <p className="text-[10px] font-semibold text-foreground">Sensor offline overlay</p>
                    </div>
                    <p className="text-[10px] text-muted-foreground">Component is <em>not</em> listed in COMPONENTS — it's not physically connected. The panel shows a grey overlay and is inactive. No data is expected from it.</p>
                  </div>
                </div>

                {/* What happens on connect */}
                <div>
                  <p className="text-xs font-bold text-foreground mb-2">What happens the moment the USB cable is plugged in</p>
                  <div className="space-y-1">
                    {[
                      "Serial manager detects the port and calls POST /api/serial/connect",
                      "Server clears stale in-memory readings — charts start fresh",
                      "Server broadcasts hardware_connected via WebSocket — dashboard flushes its React cache",
                      "Firmware sends DEVICE_INFO and HEALTH lines within ~1 second",
                      "Serial manager POSTs the parsed capability map to /api/serial/device-info",
                      "Server broadcasts hardware_connected again — now with full component info",
                      "Dashboard panels update: green badges appear, offline overlays show for missing sensors",
                      "Header shows the device name badge (e.g. esp32LOGIC v1.0)",
                    ].map((s, i) => (
                      <div key={i} className="flex items-start gap-2">
                        <span className="text-[9px] font-bold text-primary mt-0.5 w-4 shrink-0">{i + 1}.</span>
                        <span className="text-[10px] text-muted-foreground">{s}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Signal lost watchdog */}
                <Note variant="warn">
                  <strong>Connection watchdog:</strong> if no sensor reading arrives for 3 seconds while in hardware mode,
                  an amber "Signal lost" banner appears at the top of the dashboard.
                  This usually means the USB cable was unplugged or the ESP32 crashed. Replug to restore.
                </Note>
              </div>
            </section>

            {/* ── First Session ─────────────────────────────────────────── */}
            <section className="space-y-5">
              <SectionAnchor id="firstsession" />
              <div className="flex items-center gap-3 border-b border-border/60 pb-3">
                <div className="w-7 h-7 rounded bg-primary/10 flex items-center justify-center">
                  <Play className="w-4 h-4 text-primary" />
                </div>
                <h3 className="text-base font-bold text-foreground">Running Your First Session</h3>
              </div>

              <div className="space-y-1">
                <Step n={1} title="Verify the connection">
                  <p>On the Dashboard, check the connectivity chip at the top. It should show <strong className="text-foreground">Connected</strong> with a green dot and your IP address. If it shows <strong className="text-destructive">Disconnected</strong>, go back to the connecting section above.</p>
                </Step>
                <Step n={2} title="Check your safety limits">
                  <p>Go to <strong className="text-foreground">Settings → Safety Limits</strong> and confirm the values are safe for your rig:</p>
                  <div className="space-y-1 mt-1">
                    <div className="flex items-start gap-2"><span className="font-mono text-[10px] text-primary w-32 shrink-0">Max Tilt Angle</span><span>Set to the maximum tilt your mount can physically handle. Default 14°.</span></div>
                    <div className="flex items-start gap-2"><span className="font-mono text-[10px] text-primary w-32 shrink-0">Temp Warning</span><span>Motor manufacturer's continuous operating limit. Default 55°C.</span></div>
                    <div className="flex items-start gap-2"><span className="font-mono text-[10px] text-primary w-32 shrink-0">Temp Critical</span><span>Hard stop threshold. Default 65°C.</span></div>
                  </div>
                </Step>
                <Step n={3} title="Set your target RPM and duration">
                  <p>Go to <strong className="text-foreground">Settings → Performance</strong> and enter the target flywheel RPM and how long you want the session to run. These become the defaults for every new session.</p>
                </Step>
                <Step n={4} title="Start the session">
                  <p>In the Session Control panel, click <strong className="text-foreground">Start Session</strong>. You will be asked whether to run hardware verification tests or skip them. The session timer starts and readings begin logging — but the motor stays off until you start it explicitly.</p>
                  <Note variant="info">Starting a session no longer spins the motor automatically. The motor is a separate action so you can verify sensor readings before committing to spin.</Note>
                <Note variant="tip">Via IR remote, pressing <strong className="text-foreground">CH+</strong> starts the session immediately — it bypasses the run-tests dialog entirely (equivalent to choosing Skip).</Note>
                </Step>
                <Step n={5} title="Start the motor">
                  <p>Once the session is running, the Session Control panel shows a <strong className="text-foreground">Start Motor</strong> button. Click it to spin the motor up to your target RPM. While the motor is running the button changes to <strong className="text-foreground">Stop Motor</strong> — click it to stop the motor without ending the session.</p>
                  <Note variant="warn">Stay nearby for the first spin-up. If the gyroscope tilts unexpectedly or the motor behaves erratically, press <strong className="text-foreground">E-Shutdown</strong> or hit <kbd className="font-mono text-[9px] bg-muted/40 border border-border px-1 rounded">Esc</kbd> on the keyboard for an immediate emergency stop.</Note>
                </Step>
                <Step n={6} title="Monitor live data">
                  <p>Watch the Live Charts — tilt X/Y, RPM, and temperature update every second. Stat cards on the right show min/max/average across the active window.</p>
                </Step>
                <Step n={7} title="End the session">
                  <p>Click <strong className="text-foreground">Stop Session</strong> and confirm the dialog. The motor is stopped automatically and the session is saved. Find it in the <strong className="text-foreground">Sessions</strong> screen for later review and CSV export.</p>
                </Step>
              </div>
            </section>

            {/* ── Dashboard Tour ────────────────────────────────────────── */}
            <section className="space-y-5">
              <SectionAnchor id="tour" />
              <div className="flex items-center gap-3 border-b border-border/60 pb-3">
                <div className="w-7 h-7 rounded bg-primary/10 flex items-center justify-center">
                  <LayoutDashboard className="w-4 h-4 text-primary" />
                </div>
                <h3 className="text-base font-bold text-foreground">Dashboard Screen Tour</h3>
              </div>

              <div className="space-y-3">
                {[
                  {
                    icon: <BarChart2 className="w-4 h-4 text-chart-2" />,
                    title: "Dashboard",
                    path: "/",
                    items: [
                      { label: "Stat Cards", desc: "Live RPM, tilt X/Y, temperature and motor state. Values update every second from the WebSocket stream." },
                      { label: "Live Charts", desc: "Five sensor panels: RPM, Tilt X/Y, Temperature, Vibration, and Motor PWM. In hardware mode each panel shows a ✓ OK or ✗ FAIL health badge. Sensors not physically present show a grey 'offline' overlay instead of a chart." },
                      { label: "Time Scale toolbar", desc: "Switch chart history window between 30 s, 1 m, 5 m, 15 m, 1 h, 4 h, and 1 d. Zoom in/out with the +/− buttons on each chart." },
                      { label: "Hardware badge", desc: "When an ESP32 is connected via USB the header shows a green badge with the device name and firmware version (e.g. esp32LOGIC v1.0)." },
                      { label: "Signal Lost banner", desc: "If no sensor reading arrives for 3 seconds while in hardware mode, an amber banner appears below the header. Replug the USB cable to restore." },
                      { label: "Motor Control", desc: "Send manual commands — Spin, Brake, or Emergency Stop. Use with caution during a running session. Esc key also triggers an immediate emergency stop from anywhere on the page." },
                      { label: "Session Control", desc: "Start Session begins logging. Once a session is active a separate Start Motor / Stop Motor toggle appears — the motor can be started and stopped independently without ending the session. Stop Session ends logging and requires confirmation. Timer and session state are shown here." },
                      { label: "IR Remote Feed", desc: "Shows a live log of every IR button press received from the remote. Each entry shows the button label and the resulting action. Useful for verifying the remote is connected and commands are being received." },
                      { label: "System Terminal", desc: "Real-time event log — shows hardware connection events, sensor health reports, alert triggers, and raw server messages. First place to look when debugging." },
                    ],
                  },
                  {
                    icon: <Play className="w-4 h-4 text-chart-3" />,
                    title: "Sessions",
                    path: "/sessions",
                    items: [
                      { label: "Session list", desc: "All recorded sessions with start time, status badge (running / completed / error), actual duration, and target RPM. Updates every 10 seconds automatically." },
                      { label: "Export all readings", desc: "The 'Export all readings' button in the page header downloads a CSV of every reading across all sessions — useful for offline analysis in Excel or Python." },
                      { label: "Per-session CSV", desc: "Each session row has a CSV download button. It downloads only the readings for that session — handy for comparing individual runs." },
                      { label: "Status badges", desc: "running (green) · completed (blue) · warning (amber) · error (red) · idle (grey). A session stays 'running' until it is explicitly stopped or the target duration expires." },
                    ],
                  },
                  {
                    icon: <BarChart2 className="w-4 h-4 text-chart-4" />,
                    title: "Predictions",
                    path: "/predictions",
                    items: [
                      { label: "How it works", desc: "Uses Ordinary Least Squares (OLS) linear regression across all historical session data. Each metric draws a best-fit trend line and projects it forward in time. Requires 2+ completed sessions for real analysis; with 1 session it shows a flat baseline projection." },
                      { label: "Temperature trend", desc: "Plots average and peak temperature per session. The trend line predicts sessions until the 'Temp Warning' threshold (configurable in Settings → Safety). If the slope is downward, it shows 'Cooling trend — no concern'." },
                      { label: "Vibration (ISO 10816-3)", desc: "Vibration is derived from RPM (mm/s = rpm ÷ 14000 × 8.5). ISO zones A, B, C, D are overlaid on the chart. Colour bands show when vibration enters 'monitoring recommended' (C) or 'shutdown advised' (D) territory." },
                      { label: "Wobble magnitude", desc: "Tracks gyroscopic precession — the combination of tilt X and tilt Y angular drift across sessions. A rising slope triggers a 'Gimbal re-alignment recommended' maintenance note." },
                      { label: "RPM stability (CV%)", desc: "Coefficient of Variation = standard deviation ÷ mean RPM, expressed as a percentage. High CV means the motor is inconsistent. Crossing 15% triggers a 'PID retune recommended' alert." },
                      { label: "Maintenance panel", desc: "Auto-generated action items appear in a panel on the right when any metric crosses its threshold. Each item shows urgency, the metric that triggered it, and the recommended action." },
                      { label: "X-axis time unit", desc: "Toggle between sessions, hours, or days on the X-axis using the buttons at the top-right of each chart. Useful when sessions vary significantly in length." },
                    ],
                  },
                  {
                    icon: <Settings2 className="w-4 h-4 text-muted-foreground" />,
                    title: "Settings",
                    path: "/settings",
                    items: [
                      { label: "Safety Limits & Performance", desc: "The values that govern every session — set these before your first run." },
                      { label: "Device Connection", desc: "WiFi/BLE configuration pushed to the ESP32." },
                      { label: "SD Card Storage", desc: "Sync offline logs from the SD card into the dashboard database." },
                      { label: "Firmware Update", desc: "OTA flash a new .bin without touching a USB cable." },
                    ],
                  },
                ].map((screen) => (
                  <div key={screen.title} className="border border-border/60 rounded-lg overflow-hidden">
                    <div className="flex items-center gap-2.5 px-4 py-2.5 bg-muted/20">
                      {screen.icon}
                      <span className="text-xs font-bold text-foreground">{screen.title}</span>
                      <span className="font-mono text-[10px] text-muted-foreground ml-1">{screen.path}</span>
                    </div>
                    <div className="divide-y divide-border/40">
                      {screen.items.map((item) => (
                        <div key={item.label} className="px-4 py-2 flex gap-3">
                          <span className="text-[10px] font-semibold text-foreground w-36 shrink-0 pt-0.5">{item.label}</span>
                          <span className="text-[10px] text-muted-foreground leading-relaxed">{item.desc}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* ── IR Remote Control ─────────────────────────────────────── */}
            <section className="space-y-5">
              <SectionAnchor id="remote" />
              <div className="flex items-center gap-3 border-b border-border/60 pb-3">
                <div className="w-7 h-7 rounded bg-primary/10 flex items-center justify-center">
                  <Radio className="w-4 h-4 text-primary" />
                </div>
                <h3 className="text-base font-bold text-foreground">IR Remote Control</h3>
              </div>

              <p className="text-[11px] text-muted-foreground leading-relaxed">
                A standard <strong className="text-foreground">Car MP3 IR remote</strong> (NEC protocol, 21 buttons) can control the gyroscope hands-free — speed, auto mode, emergency stop, and PID tuning — all without touching the dashboard. You only need a <strong className="text-foreground">VS1838B</strong> (or HX1838 / TSOP4838) IR receiver module and three wires.
              </p>

              {/* Photo + components side by side */}
              <div className="grid grid-cols-[auto_1fr] gap-5 items-start">
                <div className="shrink-0">
                  <img
                    src={remoteImg}
                    alt="Car MP3 IR remote"
                    className="w-36 rounded-lg border border-border/60 object-cover"
                  />
                  <p className="text-[9px] text-muted-foreground text-center mt-1">Car MP3 remote (NEC)</p>
                </div>
                <div className="space-y-3">
                  <p className="text-xs font-bold text-foreground">Components needed</p>
                  <div className="space-y-2">
                    {[
                      { name: "Car MP3 IR remote", note: "Any 21-button NEC remote like this. The hex codes in the sketch below match this exact model.", required: true },
                      { name: "VS1838B / HX1838 / TSOP4838", note: "3-pin IR receiver module. Any NEC-compatible 38 kHz receiver works. Costs under $0.50.", required: true },
                      { name: "3 jumper wires", note: "VCC, GND, and signal. No resistors or capacitors needed — the module has them built in.", required: true },
                    ].map((c) => (
                      <div key={c.name} className="flex items-start gap-2">
                        <CheckCircle2 className="w-3 h-3 text-chart-3 shrink-0 mt-0.5" />
                        <div>
                          <span className="text-[11px] font-semibold text-foreground">{c.name}</span>
                          <span className="text-[10px] text-muted-foreground ml-2">{c.note}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Wiring */}
              <div>
                <p className="text-xs font-bold text-foreground mb-2">Wiring the IR receiver to the ESP32</p>
                <table className="w-full border-collapse">
                  <thead>
                    <tr>
                      <th className="text-left text-[9px] font-bold text-muted-foreground uppercase tracking-wider pb-1.5 pr-4">IR Receiver Pin</th>
                      <th className="text-left text-[9px] font-bold text-muted-foreground uppercase tracking-wider pb-1.5 pr-4">ESP32 GPIO</th>
                      <th className="text-left text-[9px] font-bold text-muted-foreground uppercase tracking-wider pb-1.5">Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    <PinRow pin="VCC"     gpio="3.3 V"  description="Use 3.3 V — not 5 V. The module tolerates both but 3.3 V keeps logic levels safe." />
                    <PinRow pin="GND"     gpio="GND"   description="Common ground with the ESP32" />
                    <PinRow pin="OUT / S" gpio="GPIO 17" description="Signal output wired to GPIO 17 in this build. Any free digital GPIO works — update IR_RECEIVE_PIN in the sketch if you change the pin." />
                  </tbody>
                </table>
                <Note variant="tip">
                  The flat face of the VS1838B points toward the remote. Keep it away from bright incandescent light and avoid placing it directly under a desk lamp — strong IR ambient light causes false triggers.
                </Note>
                <Note variant="info">
                  The onboard <strong className="text-foreground">blue LED</strong> (GPIO 2) lights up for ~200 ms every time a valid IR signal is received. This gives you instant visual feedback so you know the signal is reaching the board.
                </Note>
              </div>

              {/* Remote modes overview */}
              <div>
                <p className="text-xs font-bold text-foreground mb-3">How remote control modes work</p>
                <p className="text-[11px] text-muted-foreground leading-relaxed mb-3">
                  The remote behaves differently depending on what the dashboard is currently doing. There are four distinct states — most buttons are gated and only activate in the right context, so accidental presses are harmless.
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { label: "No session", color: "border-border/60 bg-muted/10", badge: "Idle", badgeColor: "text-muted-foreground bg-muted/30", desc: "Only CH+ works. All other buttons are silently ignored." },
                    { label: "Session active, no dialog", color: "border-primary/30 bg-primary/5", badge: "Running", badgeColor: "text-primary bg-primary/10", desc: "Full control — session stop, motor start/stop, speed steps, PID tuning." },
                    { label: "Stop-session dialog open", color: "border-chart-2/30 bg-chart-2/5", badge: "Confirm", badgeColor: "text-chart-2 bg-chart-2/10", desc: "PREV/NEXT navigate Cancel ↔ Stop. EQ confirms. All other buttons wait." },
                    { label: "PID tuning dialog open", color: "border-chart-4/30 bg-chart-4/5", badge: "PID Edit", badgeColor: "text-chart-4 bg-chart-4/10", desc: "NEXT/PREV move between Kp/Ki/Kd. VOL± step. 0–9 type. 100+ backspace. EQ pushes all." },
                  ].map((m) => (
                    <div key={m.label} className={`border rounded-lg p-3 space-y-1.5 ${m.color}`}>
                      <div className="flex items-center gap-2">
                        <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${m.badgeColor}`}>{m.badge}</span>
                        <span className="text-[10px] font-semibold text-foreground">{m.label}</span>
                      </div>
                      <p className="text-[10px] text-muted-foreground leading-relaxed">{m.desc}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Button map */}
              <div>
                <p className="text-xs font-bold text-foreground mb-3">Button map</p>
                <div className="space-y-4">
                  {/* Pre-session */}
                  <div>
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Before a session (Idle state)</p>
                    <div className="border border-border/60 rounded-lg overflow-hidden">
                      <table className="w-full border-collapse text-[10px]">
                        <thead className="bg-muted/20">
                          <tr>
                            <th className="text-left px-3 py-2 font-bold text-muted-foreground uppercase tracking-wider text-[9px]">Button</th>
                            <th className="text-left px-3 py-2 font-bold text-muted-foreground uppercase tracking-wider text-[9px]">HEX</th>
                            <th className="text-left px-3 py-2 font-bold text-muted-foreground uppercase tracking-wider text-[9px]">Action</th>
                          </tr>
                        </thead>
                        <tbody>
                          {[
                            { btn: "CH+", hex: "0x47", action: "Start session immediately — IR skips the run-tests dialog" },
                            { btn: "All others", hex: "—", action: "Ignored — no session is active" },
                          ].map((r) => (
                            <tr key={r.btn} className="border-t border-border/40">
                              <td className="px-3 py-1.5 font-mono font-semibold text-foreground">{r.btn}</td>
                              <td className="px-3 py-1.5 font-mono text-muted-foreground">{r.hex}</td>
                              <td className="px-3 py-1.5 text-muted-foreground">{r.action}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Session active */}
                  <div>
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Session active — normal control</p>
                    <div className="border border-border/60 rounded-lg overflow-hidden">
                      <table className="w-full border-collapse text-[10px]">
                        <thead className="bg-muted/20">
                          <tr>
                            <th className="text-left px-3 py-2 font-bold text-muted-foreground uppercase tracking-wider text-[9px]">Button</th>
                            <th className="text-left px-3 py-2 font-bold text-muted-foreground uppercase tracking-wider text-[9px]">HEX</th>
                            <th className="text-left px-3 py-2 font-bold text-muted-foreground uppercase tracking-wider text-[9px]">Action</th>
                          </tr>
                        </thead>
                        <tbody>
                          {[
                            { btn: "CH−", hex: "0x45", action: "Stop session — opens confirmation dialog", warn: false },
                            { btn: "▶⏸  PLAY / PAUSE", hex: "0x43", action: "Start motor (if stopped) / Stop motor (if running)", warn: false },
                            { btn: "CH", hex: "0x46", action: "Open / close PID tuning dialog", warn: false },
                            { btn: "▶▶  NEXT", hex: "0x40", action: "Speed +1000 RPM (coarse step)", warn: false },
                            { btn: "◀◀  PREV", hex: "0x44", action: "Speed −1000 RPM (coarse step)", warn: false },
                            { btn: "+  (VOL+)", hex: "0x15", action: "Speed +50 RPM (fine nudge)", warn: false },
                            { btn: "−  (VOL−)", hex: "0x07", action: "Speed −50 RPM (fine nudge)", warn: false },
                            { btn: "100+", hex: "0x19", action: "Speed +100 RPM", warn: false },
                            { btn: "200+", hex: "0x0D", action: "Toggle PID auto-mode ON/OFF (push-button)", warn: false },
                            { btn: "EQ", hex: "0x09", action: "Reset speed to stored target", warn: false },
                            { btn: "0", hex: "0x16", action: "Ramp speed to 0 (soft stop)", warn: false },
                            { btn: "9", hex: "0x4A", action: "⚠ EMERGENCY STOP", warn: true },
                          ].map((r) => (
                            <tr key={r.btn} className="border-t border-border/40">
                              <td className="px-3 py-1.5 font-mono font-semibold text-foreground">{r.btn}</td>
                              <td className="px-3 py-1.5 font-mono text-muted-foreground">{r.hex}</td>
                              <td className={`px-3 py-1.5 ${r.warn ? "text-destructive font-semibold" : "text-muted-foreground"}`}>{r.action}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Confirm dialog */}
                  <div>
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Stop-session confirm dialog  (opened by CH−)</p>
                    <div className="border border-border/60 rounded-lg overflow-hidden">
                      <table className="w-full border-collapse text-[10px]">
                        <thead className="bg-muted/20">
                          <tr>
                            <th className="text-left px-3 py-2 font-bold text-muted-foreground uppercase tracking-wider text-[9px]">Button</th>
                            <th className="text-left px-3 py-2 font-bold text-muted-foreground uppercase tracking-wider text-[9px]">Action</th>
                          </tr>
                        </thead>
                        <tbody>
                          {[
                            { btn: "PREV ◀◀  /  NEXT ▶▶", action: "Move highlight between Cancel and Stop Session buttons" },
                            { btn: "EQ", action: "Confirm the highlighted choice (cancel or stop)" },
                          ].map((r) => (
                            <tr key={r.btn} className="border-t border-border/40">
                              <td className="px-3 py-1.5 font-mono font-semibold text-foreground">{r.btn}</td>
                              <td className="px-3 py-1.5 text-muted-foreground">{r.action}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-1.5">The dialog shows a hint bar: <em>"PREV/NEXT to move · EQ to confirm"</em>. The currently selected button is highlighted with a visible ring.</p>
                  </div>

                  {/* PID edit mode */}
                  <div>
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">PID tuning dialog  (opened by CH, closed by CH or EQ)</p>
                    <div className="border border-border/60 rounded-lg overflow-hidden">
                      <table className="w-full border-collapse text-[10px]">
                        <thead className="bg-muted/20">
                          <tr>
                            <th className="text-left px-3 py-2 font-bold text-muted-foreground uppercase tracking-wider text-[9px]">Button</th>
                            <th className="text-left px-3 py-2 font-bold text-muted-foreground uppercase tracking-wider text-[9px]">Action</th>
                          </tr>
                        </thead>
                        <tbody>
                          {[
                            { btn: "NEXT ▶▶", action: "Next parameter: Kp → Ki → Kd" },
                            { btn: "PREV ◀◀", action: "Previous parameter: Kd → Ki → Kp" },
                            { btn: "+ / −  (VOL)", action: "Increment / decrement selected value by its step size" },
                            { btn: "0 – 9", action: "Type a digit into the entry field (builds a number: 2, 5 → 25)" },
                            { btn: "100+", action: "Backspace — delete the last typed digit" },
                            { btn: "EQ", action: "Push all three Kp/Ki/Kd values to the ESP32 and close dialog" },
                            { btn: "CH", action: "Close dialog without pushing (discard unsaved edits)" },
                          ].map((r) => (
                            <tr key={r.btn} className="border-t border-border/40">
                              <td className="px-3 py-1.5 font-mono font-semibold text-foreground">{r.btn}</td>
                              <td className="px-3 py-1.5 text-muted-foreground">{r.action}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </div>

              {/* ESP32 code */}
              <div>
                <p className="text-xs font-bold text-foreground mb-1">ESP32 IR handler sketch</p>
                <p className="text-[10px] text-muted-foreground mb-3">
                  Add the <strong className="text-foreground">IRremote</strong> library first: Arduino IDE → Tools → Manage Libraries → search <em>"IRremote"</em> by shirriff / z3t0, install v4.x. Then paste this into your <code className="font-mono text-[9px] bg-muted/40 px-1 rounded">gyro_monitor.ino</code> or a companion <code className="font-mono text-[9px] bg-muted/40 px-1 rounded">ir_remote.h</code> file.
                </p>
                <Collapsible title="ir_remote.h — full handler (click to expand)">
                  <CodeBlock>{`// ir_remote.h  —  Car MP3 IR remote handler for ESP32 gyroscope monitor
// Requires: IRremote v4.x  (install via Arduino Library Manager)

#pragma once
#include <IRremote.hpp>

#define IR_RECEIVE_PIN 17          // VS1838B signal pin (GPIO 17 in this build)

// ── NEC hex codes for Car MP3 remote (address 0x00) ─────────────────────
#define IR_CH_MINUS   0x45   // CH−      → stop session (opens confirm dialog)
#define IR_CH         0x46   // CH       → open / close PID tuning dialog
#define IR_CH_PLUS    0x47   // CH+      → start session
#define IR_PREV       0x44   // PREV ◀◀  → speed −1000 RPM  /  confirm dialog: move highlight
#define IR_NEXT       0x40   // NEXT ▶▶  → speed +1000 RPM  /  confirm dialog: move highlight
#define IR_PLAY_PAUSE 0x43   // ▶⏸      → start / stop motor (during session)
#define IR_VOL_MINUS  0x07   // −        → speed −50 RPM
#define IR_VOL_PLUS   0x15   // +        → speed +50 RPM
#define IR_EQ         0x09   // EQ       → reset to target speed
#define IR_0          0x16   // 0        → ramp to 0 RPM
#define IR_100_PLUS   0x19   // 100+     → speed +100 RPM  /  ×10 in PID mode
#define IR_200_PLUS   0x0D   // 200+     → speed +200 RPM  /  decimal point in PID mode
#define IR_1          0x0C
#define IR_2          0x18
#define IR_3          0x5E
#define IR_4          0x08
#define IR_5          0x1C
#define IR_6          0x5A
#define IR_7          0x42
#define IR_8          0x52
#define IR_9          0x4A   // 9        → EMERGENCY STOP   /  digit '9' in PID mode

// ── PID edit state ───────────────────────────────────────────────────────
enum PidParam { KP = 0, KI, KD };

static bool     _pidMode     = false;
static PidParam _pidSelected = KP;
static float    _pidKp = 1.0f, _pidKi = 0.5f, _pidKd = 0.1f;  // saved values
static float    _pidKpNew,     _pidKiNew,      _pidKdNew;        // working copy
static String   _digitBuf = "";

// Returns a reference to the currently-selected PID working value
static float& _pidRef() {
  if (_pidSelected == KP) return _pidKpNew;
  if (_pidSelected == KI) return _pidKiNew;
  return _pidKdNew;
}
static const char* _pidName() {
  if (_pidSelected == KP) return "Kp";
  if (_pidSelected == KI) return "Ki";
  return "Kd";
}

// Commit the digit buffer into the selected parameter, then clear it
static void _commitDigit() {
  if (_digitBuf.length() > 0) {
    _pidRef() = _digitBuf.toFloat();
    _digitBuf = "";
  }
}

// ── Serial command helpers ────────────────────────────────────────────────
// Commands are picked up by the dashboard serial bridge (ingest route).
// Format: CMD:<action>:<value>
static void _sendCmd(const char* action, float value) {
  Serial.printf("CMD:%s:%.2f\\n", action, value);
}
static void _sendCmd(const char* action, const char* value = "") {
  Serial.printf("CMD:%s:%s\\n", action, value);
}

// ── Initialise — call once from setup() ──────────────────────────────────
void irSetup() {
  IrReceiver.begin(IR_RECEIVE_PIN, ENABLE_LED_FEEDBACK);
}

// ── Poll — call every loop() iteration ───────────────────────────────────
void irLoop() {
  if (!IrReceiver.decode()) return;

  uint8_t cmd      = IrReceiver.decodedIRData.command;
  bool    isRepeat = (IrReceiver.decodedIRData.flags & IRDATA_FLAGS_IS_REPEAT);
  IrReceiver.resume();

  // Allow held-down repeats only for fine-speed nudges
  bool allowRepeat = (cmd == IR_VOL_PLUS || cmd == IR_VOL_MINUS ||
                      cmd == IR_100_PLUS || cmd == IR_200_PLUS  ||
                      cmd == IR_NEXT     || cmd == IR_PREV);
  if (isRepeat && !allowRepeat) return;

  if (!_pidMode) {
    // ── Normal mode ────────────────────────────────────────────────────
    switch (cmd) {
      case IR_CH_PLUS:    _sendCmd("IR_CH_PLUS");              break; // → dashboard starts session
      case IR_CH_MINUS:   _sendCmd("IR_CH_MINUS");             break; // → dashboard opens stop-session dialog
      case IR_PLAY_PAUSE: _sendCmd("IR_START");                break; // → dashboard starts or stops motor
      case IR_NEXT:       _sendCmd("SPEED_STEP",  1000.0f);   break;
      case IR_PREV:       _sendCmd("SPEED_STEP", -1000.0f);   break;
      case IR_VOL_PLUS:   _sendCmd("SPEED_STEP",    50.0f);   break;
      case IR_VOL_MINUS:  _sendCmd("SPEED_STEP",   -50.0f);   break;
      case IR_100_PLUS:   _sendCmd("SPEED_STEP",   100.0f);   break;
      case IR_200_PLUS:   _sendCmd("SPEED_STEP",   200.0f);   break;
      case IR_EQ:         _sendCmd("SPEED_RESET");             break;
      case IR_0:          _sendCmd("SPEED_SET",     0.0f);    break;
      case IR_9:          _sendCmd("EMERGENCY_STOP");          break;
      case IR_CH:
        // Open PID tuning dialog on the dashboard
        _pidKpNew = _pidKp; _pidKiNew = _pidKi; _pidKdNew = _pidKd;
        _pidSelected = KP;  _digitBuf = "";
        _pidMode = true;
        Serial.println("PID_MODE:ENTER:Kp");
        break;
    }
  } else {
    // ── PID edit mode ──────────────────────────────────────────────────
    switch (cmd) {
      case IR_NEXT:
        _commitDigit();
        _pidSelected = (PidParam)((_pidSelected + 1) % 3);
        Serial.printf("PID_SELECT:%s\\n", _pidName());
        break;
      case IR_PREV:
        _commitDigit();
        _pidSelected = (PidParam)((_pidSelected + 2) % 3);
        Serial.printf("PID_SELECT:%s\\n", _pidName());
        break;
      case IR_VOL_PLUS:
        _commitDigit();
        _pidRef() += 0.1f;
        Serial.printf("PID_LIVE:%s:%.3f\\n", _pidName(), _pidRef());
        break;
      case IR_VOL_MINUS:
        _commitDigit();
        _pidRef() -= 0.1f;
        if (_pidRef() < 0) _pidRef() = 0;
        Serial.printf("PID_LIVE:%s:%.3f\\n", _pidName(), _pidRef());
        break;
      case IR_EQ:
        _digitBuf = "";
        if (_pidSelected == KP) _pidKpNew = _pidKp;
        else if (_pidSelected == KI) _pidKiNew = _pidKi;
        else _pidKdNew = _pidKd;
        Serial.printf("PID_RESET:%s\\n", _pidName());
        break;
      case IR_100_PLUS:
        // Backspace: remove the last typed digit from the entry buffer
        if (_digitBuf.length() > 0) {
          _digitBuf.remove(_digitBuf.length() - 1);
          Serial.printf("PID_ENTRY:%s:%s_\\n", _pidName(), _digitBuf.c_str());
        }
        break;
      case IR_200_PLUS:
        // Insert decimal point (only if not already present)
        if (_digitBuf.indexOf('.') < 0) _digitBuf += '.';
        Serial.printf("PID_ENTRY:%s:%s_\\n", _pidName(), _digitBuf.c_str());
        break;
      case IR_CH:
        // Save & exit
        _commitDigit();
        _pidKp = _pidKpNew; _pidKi = _pidKiNew; _pidKd = _pidKdNew;
        Serial.printf("PID_SAVE:Kp=%.3f,Ki=%.3f,Kd=%.3f\\n",
                      _pidKp, _pidKi, _pidKd);
        _pidMode = false;
        Serial.println("PID_MODE:EXIT");
        // Push new PID values to dashboard
        _sendCmd("PID_SET_KP", _pidKp);
        _sendCmd("PID_SET_KI", _pidKi);
        _sendCmd("PID_SET_KD", _pidKd);
        break;
      case IR_CH_MINUS:
        // Discard & exit
        _digitBuf = "";
        _pidMode = false;
        Serial.println("PID_MODE:CANCEL");
        break;
      case IR_PLAY_PAUSE:
        // Emergency stop even from PID mode
        _pidMode = false;
        _sendCmd("EMERGENCY_STOP");
        break;
      // Digit entry 0-9 (note: 9 becomes a digit here, not an emergency stop)
      case IR_0: _digitBuf += '0';
                 Serial.printf("PID_ENTRY:%s:%s_\\n", _pidName(), _digitBuf.c_str()); break;
      case IR_1: _digitBuf += '1';
                 Serial.printf("PID_ENTRY:%s:%s_\\n", _pidName(), _digitBuf.c_str()); break;
      case IR_2: _digitBuf += '2';
                 Serial.printf("PID_ENTRY:%s:%s_\\n", _pidName(), _digitBuf.c_str()); break;
      case IR_3: _digitBuf += '3';
                 Serial.printf("PID_ENTRY:%s:%s_\\n", _pidName(), _digitBuf.c_str()); break;
      case IR_4: _digitBuf += '4';
                 Serial.printf("PID_ENTRY:%s:%s_\\n", _pidName(), _digitBuf.c_str()); break;
      case IR_5: _digitBuf += '5';
                 Serial.printf("PID_ENTRY:%s:%s_\\n", _pidName(), _digitBuf.c_str()); break;
      case IR_6: _digitBuf += '6';
                 Serial.printf("PID_ENTRY:%s:%s_\\n", _pidName(), _digitBuf.c_str()); break;
      case IR_7: _digitBuf += '7';
                 Serial.printf("PID_ENTRY:%s:%s_\\n", _pidName(), _digitBuf.c_str()); break;
      case IR_8: _digitBuf += '8';
                 Serial.printf("PID_ENTRY:%s:%s_\\n", _pidName(), _digitBuf.c_str()); break;
      case IR_9: _digitBuf += '9';
                 Serial.printf("PID_ENTRY:%s:%s_\\n", _pidName(), _digitBuf.c_str()); break;
    }
  }
}
`}</CodeBlock>
                </Collapsible>
              </div>

              {/* Integration note */}
              <Note variant="info">
                In your main <code className="font-mono text-[9px] bg-muted/40 px-1 rounded">gyro_controller.ino</code>, add <code className="font-mono text-[9px] bg-muted/40 px-1 rounded">#include "ir_remote.h"</code>, call <code className="font-mono text-[9px] bg-muted/40 px-1 rounded">irSetup();</code> inside <code className="font-mono text-[9px] bg-muted/40 px-1 rounded">setup()</code>, and <code className="font-mono text-[9px] bg-muted/40 px-1 rounded">irLoop();</code> inside <code className="font-mono text-[9px] bg-muted/40 px-1 rounded">loop()</code>. The handler sends <code className="font-mono text-[9px] bg-muted/40 px-1 rounded">CMD:IR_CH_PLUS</code>, <code className="font-mono text-[9px] bg-muted/40 px-1 rounded">CMD:IR_CH_MINUS</code>, <code className="font-mono text-[9px] bg-muted/40 px-1 rounded">CMD:IR_START</code> and other <code className="font-mono text-[9px] bg-muted/40 px-1 rounded">CMD:…</code> lines over Serial — the dashboard bridge parses and routes them to the correct handler.
              </Note>

              <Note variant="warn">
                If your remote came with a different car stereo unit, the hex codes may differ. Use the IRremote <strong>ReceiveDump</strong> example sketch (File → Examples → IRremote → ReceiveDump) to print the actual codes for each button, then update the <code className="font-mono text-[9px] bg-muted/40 px-1 rounded">#define</code> values at the top of <code className="font-mono text-[9px] bg-muted/40 px-1 rounded">ir_remote.h</code>.
              </Note>
            </section>

            {/* ── Troubleshooting ───────────────────────────────────────── */}
            <section className="space-y-5">
              <SectionAnchor id="troubleshoot" />
              <div className="flex items-center gap-3 border-b border-border/60 pb-3">
                <div className="w-7 h-7 rounded bg-primary/10 flex items-center justify-center">
                  <AlertTriangle className="w-4 h-4 text-primary" />
                </div>
                <h3 className="text-base font-bold text-foreground">Troubleshooting</h3>
              </div>

              <div className="space-y-2">
                {[
                  {
                    problem: "Dashboard shows Disconnected",
                    fix: "Confirm the ESP32 is powered and on the same network. Check the IP in the Arduino Serial Monitor and make sure no firewall blocks port 80. Try refreshing the dashboard.",
                  },
                  {
                    problem: "RPM always shows 0",
                    fix: "The motor driver PWM signal may not be reaching GPIO 25, or the driver isn't powered. Check your wiring and that the external motor power supply is on.",
                  },
                  {
                    problem: "Tilt values are stuck or NaN",
                    fix: "The MPU-6050 isn't responding. Verify SDA/SCL wiring, check that AD0 is pulled to GND, and confirm you're using 3.3V not 5V on VCC.",
                  },
                  {
                    problem: "SD card not detected",
                    fix: "Confirm CS is on GPIO 5 and the card is formatted FAT32. Some SD modules need 5V on VCC — check your breakout's datasheet. Try a different card (some 64GB+ cards aren't FAT32 by default).",
                  },
                  {
                    problem: "Firmware upload fails",
                    fix: 'Hold the BOOT button on the ESP32 while clicking Upload, release after \"Connecting…\" appears. If the port isn\'t detected, install the CP210x or CH340 USB driver for your OS.',
                  },
                  {
                    problem: "OTA firmware flash fails",
                    fix: "Ensure the ESP32 has ElegantOTA or AsyncElegantOTA with an /update route. The device must be reachable on the network. Check that the .bin file was compiled for the same board type.",
                  },
                  {
                    problem: "Emergency stop triggered immediately",
                    fix: "Your tilt or temperature limits may be too low. Check Settings → Safety Limits. Also verify the MPU-6050 is mounted level — if it's tilted at rest, the reading will be offset.",
                  },
                  {
                    problem: "No COM port appears after scanning (Serial mode)",
                    fix: "Install the correct USB serial driver: CP210x for Silicon Labs chips, CH340/CH341 for WCH chips. Replug the cable. Try a different USB cable (some are charge-only with no data lines).",
                  },
                  {
                    problem: "Sensor panel shows a grey 'sensor offline' overlay",
                    fix: "The sensor is not listed in the COMPONENTS field of your DEVICE_INFO startup line. Add it (e.g. MPU6050, ESC, TEMP_SENSOR) and reflash. The overlay means the app knows the sensor isn't there — it's working as intended.",
                  },
                  {
                    problem: "Panel shows a ✗ FAIL health badge",
                    fix: "The sensor is installed but failed to initialise — your firmware reported FAIL in the HEALTH line. Check wiring and power for that component. The badge is red but the panel still displays (it may read zero until the sensor comes online).",
                  },
                  {
                    problem: "'Signal Lost' amber banner appears on the dashboard",
                    fix: "No sensor reading arrived for 3 or more seconds in hardware mode. Usually means the USB cable was unplugged or the ESP32 crashed or halted. Replug the cable — the serial manager will reconnect automatically and the banner will clear.",
                  },
                  {
                    problem: "Charts show old readings after plugging in the ESP32",
                    fix: "Stale in-memory readings are cleared automatically on USB connect. If you still see old data, click the browser refresh (F5) or switch time scale to force a fresh fetch.",
                  },
                ].map((item) => (
                  <div key={item.problem} className="border border-border/60 rounded-lg overflow-hidden">
                    <div className="px-4 py-2.5 bg-destructive/5 border-b border-border/40 flex items-start gap-2">
                      <AlertTriangle className="w-3.5 h-3.5 text-destructive shrink-0 mt-0.5" />
                      <p className="text-[11px] font-semibold text-foreground">{item.problem}</p>
                    </div>
                    <p className="px-4 py-2.5 text-[10px] text-muted-foreground leading-relaxed">{item.fix}</p>
                  </div>
                ))}
              </div>

              <Note variant="tip">
                Still stuck? Open the System Terminal on the Dashboard — it shows raw server logs including WebSocket connection attempts, sensor read errors, and motor command results.
              </Note>
            </section>

            {/* Footer */}
            <div className="border-t border-border/60 pt-6 flex items-center justify-between">
              <p className="text-[10px] text-muted-foreground">Motorized Gyroscope Dashboard — Getting Started Guide</p>
              <Link href="/">
                <button className="flex items-center gap-2 text-xs text-primary hover:text-primary/80 transition-colors font-semibold">
                  <LayoutDashboard className="w-3.5 h-3.5" />
                  Go to Dashboard
                </button>
              </Link>
            </div>

          </div>
        </main>
      </div>
    </div>
  );
}
