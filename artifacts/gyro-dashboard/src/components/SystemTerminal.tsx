import React, { useEffect, useRef, useState } from "react";
import { apiUrl } from "@/lib/api-url";
import type { Alert } from "@workspace/api-client-react";
import { format, isValid } from "date-fns";
import { useGetConnectivity, getGetConnectivityQueryKey } from "@workspace/api-client-react";
import { Wifi, WifiOff, Cable, Bluetooth, Trash2, Send, HelpCircle } from "lucide-react";
import { useTheme } from "@/hooks/use-theme";
import { registerTerminalHandler, registerTerminalLogger } from "@/lib/terminal-bus";
import { isCommandAllowed } from "@/lib/command-gate";
import { adjustThrottle, getThrottleStep } from "@/lib/throttle-bus";

interface SystemTerminalProps {
  alerts: Alert[];
  latestAlert: Alert | null;
}

interface TerminalLine {
  id: string;
  timestamp: Date;
  level: "info" | "warning" | "critical" | "tx" | "tx-err" | "rx" | "local";
  raw: string;
}

/* ──────────────────────────────────────────────
 * Command reference — matches firmware protocol
 * ────────────────────────────────────────────── */
interface CmdDef { desc: string; response: string; category: "motor" | "imu" | "system" }

const COMMANDS: Record<string, CmdDef> = {
  // keyboard shortcuts (single char)
  a: { desc: "Toggle PID auto mode ON/OFF  (global bypass — works without a session)", response: "—", category: "motor" },
  s: { desc: "Start motor  (keyboard override — bypasses session guard)", response: "STATUS:MOTOR=ON", category: "motor" },
  x: { desc: "Stop motor gracefully", response: "STATUS:MOTOR=OFF", category: "motor" },
  h: { desc: "Increase throttle  (+50 µs PWM)", response: "—", category: "motor" },
  l: { desc: "Decrease throttle  (−50 µs PWM)", response: "—", category: "motor" },
  z: { desc: "Reset IMU reference / zero angles", response: "STATUS:REF_RESET=OK", category: "imu" },
  w: { desc: "Force WiFi + TCP reconnect", response: "—", category: "system" },
  // structured CMD: commands
  "CMD:MOTOR_START":     { desc: "Start motor with ramp-up sequence", response: "STATUS:MOTOR=ON", category: "motor" },
  "CMD:MOTOR_STOP":      { desc: "Stop motor gracefully", response: "STATUS:MOTOR=OFF", category: "motor" },
  "CMD:EMERGENCY_STOP":  { desc: "⚠ IMMEDIATE motor halt — no ramp-down", response: "STATUS:MOTOR=ESTOP", category: "motor" },
  "CMD:SPEED_UP":        { desc: "Throttle +50 µs (motor must be running)", response: "—", category: "motor" },
  "CMD:SPEED_DOWN":      { desc: "Throttle −50 µs (motor must be running)", response: "—", category: "motor" },
  "CMD:MANUAL_RPM:1500": { desc: "Set explicit RPM target (replace 1500 with desired value)", response: "—", category: "motor" },
  "CMD:SET_AUTO":        { desc: "Restore PID auto-control (cancels manual RPM)", response: "—", category: "motor" },
  "CMD:RESET_REF":       { desc: "Reset IMU reference angles to current position", response: "STATUS:REF_RESET=OK", category: "imu" },
  "CMD:WIFI_RECONNECT":  { desc: "Force full WiFi + TCP reconnect cycle", response: "—", category: "system" },
};

const HELP_LINES = [
  "─── Keyboard shortcuts ──────────────────────────────────",
  "  a / A        Toggle PID auto mode ON/OFF",
  "  s / S        Start motor  (keyboard override)",
  "  x / X        Stop motor gracefully",
  "  h / H        Throttle up   (+50 µs PWM)",
  "  l / L        Throttle down (−50 µs PWM)",
  "  z / Z        Reset IMU reference angles",
  "  w / W        Force WiFi reconnect",
  "  Esc          ⚠ EMERGENCY STOP  (when input is empty)",
  "─── Motor commands ──────────────────────────────────────",
  "  CMD:MOTOR_START       Start motor (ramp-up)",
  "  CMD:MOTOR_STOP        Stop motor gracefully",
  "  CMD:EMERGENCY_STOP    ⚠ Immediate halt",
  "  CMD:SPEED_UP          Throttle +50 µs",
  "  CMD:SPEED_DOWN        Throttle −50 µs",
  "  CMD:MANUAL_RPM:<val>  Set explicit RPM target",
  "  CMD:SET_AUTO          Restore PID auto-control",
  "─── IMU commands ────────────────────────────────────────",
  "  CMD:RESET_REF         Reset reference angles",
  "─── System commands ─────────────────────────────────────",
  "  CMD:WIFI_RECONNECT    Force WiFi + TCP reconnect",
  "─── Terminal ────────────────────────────────────────────",
  "  help / ?              Show this reference",
  "  clear                 Clear the terminal",
  "─────────────────────────────────────────────────────────",
  "↑ / ↓ cycle history.  Esc clears input (or E-stop if empty).",
];

/* ──────────────────────────────────────────────
 * Parse STATUS: lines from hardware
 * ────────────────────────────────────────────── */
function parseHardwareResponse(raw: string): { level: TerminalLine["level"]; text: string } | null {
  if (raw.startsWith("STATUS:")) {
    const body = raw.slice(7);
    if (body === "MOTOR=ON")   return { level: "rx", text: "✓ Motor ON  — throttle active" };
    if (body === "MOTOR=OFF")  return { level: "rx", text: "✓ Motor OFF — ESC disarmed" };
    if (body === "MOTOR=ESTOP") return { level: "critical", text: "⚠ EMERGENCY STOP executed" };
    if (body === "REF_RESET=OK") return { level: "rx", text: "✓ Reference angles reset to current position" };
    if (body.startsWith("CMD_UNKNOWN=")) return { level: "tx-err", text: `Unknown command: ${body.slice(12)}` };
    return { level: "rx", text: `Hardware: ${body}` };
  }
  if (raw.startsWith("[Key Override:")) return { level: "rx", text: raw };
  if (raw.startsWith("{\"ack\"")) return { level: "rx", text: `Hardware ACK: ${raw}` };
  return null;
}

/* ──────────────────────────────────────────────
 * Connection status indicator
 * ────────────────────────────────────────────── */
function ConnectionPill() {
  const { data } = useGetConnectivity({
    query: { refetchInterval: 5000, queryKey: getGetConnectivityQueryKey() },
  });

  const connected = data?.connected ?? false;
  const mode = data?.mode ?? "none";
  const modeLabel = mode === "wifi_sta" ? "WiFi" : mode === "wifi_ap" ? "AP" : mode === "ble" ? "BLE" : mode === "usb" ? "USB" : "OFF";

  const icon = mode === "wifi_sta" || mode === "wifi_ap"
    ? <Wifi size={10} style={{ display: "inline", verticalAlign: "text-bottom" }} />
    : mode === "ble"
    ? <Bluetooth size={10} style={{ display: "inline", verticalAlign: "text-bottom" }} />
    : mode === "usb"
    ? <Cable size={10} style={{ display: "inline", verticalAlign: "text-bottom" }} />
    : <WifiOff size={10} style={{ display: "inline", verticalAlign: "text-bottom" }} />;

  return (
    <div className="flex items-center gap-1.5">
      <div className="w-1.5 h-1.5 rounded-full" style={{ background: connected ? "#22c55e" : "#ef4444" }} />
      <span style={{ fontSize: "9px", letterSpacing: "0.04em" }}>
        {connected ? (
          <span style={{ color: "#22c55e" }}>{icon} {modeLabel}</span>
        ) : (
          <span style={{ color: "#ef4444" }}>{icon} off</span>
        )}
      </span>
    </div>
  );
}

/* ──────────────────────────────────────────────
 * Line colors — dark vs light
 * ────────────────────────────────────────────── */
const LINE_COLORS_DARK: Record<string, { actor: string; text: string }> = {
  info:     { actor: "#22d3ee", text: "#86efac" },
  warning:  { actor: "#f59e0b", text: "#fcd34d" },
  critical: { actor: "#ef4444", text: "#fca5a5" },
  tx:       { actor: "#a78bfa", text: "#c4b5fd" },
  "tx-err": { actor: "#f87171", text: "#fca5a5" },
  rx:       { actor: "#34d399", text: "#6ee7b7" },
  local:    { actor: "#64748b", text: "#94a3b8" },
};

const LINE_COLORS_LIGHT: Record<string, { actor: string; text: string }> = {
  info:     { actor: "#0891b2", text: "#166534" },
  warning:  { actor: "#b45309", text: "#92400e" },
  critical: { actor: "#dc2626", text: "#991b1b" },
  tx:       { actor: "#7c3aed", text: "#5b21b6" },
  "tx-err": { actor: "#dc2626", text: "#991b1b" },
  rx:       { actor: "#059669", text: "#065f46" },
  local:    { actor: "#64748b", text: "#475569" },
};

const LEVEL_ICON: Record<string, string> = {
  info:     "●",
  warning:  "●",
  critical: "●",
  tx:       "→",
  "tx-err": "✗",
  rx:       "←",
  local:    "·",
};

/* ──────────────────────────────────────────────
 * Main component
 * ────────────────────────────────────────────── */
export function SystemTerminal({ alerts, latestAlert }: SystemTerminalProps) {
  const { theme } = useTheme();
  const isLight = theme === "light";
  const lineColors = isLight ? LINE_COLORS_LIGHT : LINE_COLORS_DARK;
  const [showHint, setShowHint] = useState(false);

  const [lines, setLines] = useState<TerminalLine[]>([]);
  const [input, setInput] = useState("");
  const [inputFocused, setFocused] = useState(false);
  const [cmdHistory, setCmdHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const seenIds = useRef<Set<number>>(new Set());
  const initRef = useRef(false);

  const addLine = (line: Omit<TerminalLine, "id">) =>
    setLines(prev => [...prev, { ...line, id: `line-${Date.now()}-${Math.random()}` }]);

  /* ── Scroll lock ─────────────────────────── */
  const userScrolled = useRef(false);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const nearBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 20;
    if (!userScrolled.current || nearBottom) el.scrollTop = el.scrollHeight;
  }, [lines]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => {
      userScrolled.current = el.scrollTop + el.clientHeight < el.scrollHeight - 20;
    };
    el.addEventListener("scroll", onScroll);
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  /* ── Ingest alerts ──────────────────────── */
  function ingestAlerts(source: Alert[]) {
    const toAdd = [...source].reverse().filter(a => !seenIds.current.has(a.id));
    if (toAdd.length === 0) return;
    toAdd.forEach(a => seenIds.current.add(a.id));
    setLines(prev => [
      ...prev,
      ...toAdd.map(a => {
        const hw = parseHardwareResponse(a.message);
        return {
          id: `alert-${a.id}`,
          timestamp: parseTerminalTimestamp(a.timestamp),
          level: hw ? hw.level : (a.level as TerminalLine["level"]),
          raw: hw ? hw.text : a.message,
        };
      }),
    ]);
  }

  useEffect(() => {
    if (alerts.length === 0) return;
    if (!initRef.current) {
      // Silently mark all historical alerts as seen — don't render them.
      // The terminal only shows events that arrive after the app is opened.
      alerts.forEach(a => seenIds.current.add(a.id));
      initRef.current = true;
    } else {
      ingestAlerts(alerts);
    }
  }, [alerts]);

  useEffect(() => {
    if (!latestAlert) return;
    if (seenIds.current.has(latestAlert.id)) return;
    seenIds.current.add(latestAlert.id);
    const hw = parseHardwareResponse(latestAlert.message);
    addLine({
      timestamp: parseTerminalTimestamp(latestAlert.timestamp),
      level: hw ? hw.level : (latestAlert.level as TerminalLine["level"]),
      raw: hw ? hw.text : latestAlert.message,
    });
  }, [latestAlert]);

  function parseTerminalTimestamp(value: string | number | Date | undefined): Date {
    const timestamp = value != null ? new Date(value) : new Date();
    return isValid(timestamp) ? timestamp : new Date();
  }

  /* ── Local command handler ──────────────── */
  function handleLocalCommand(text: string): boolean {
    const lower = text.toLowerCase().trim();
    if (lower === "help" || lower === "?") {
      const now = new Date();
      setLines(prev => [
        ...prev,
        ...HELP_LINES.map(line => ({
          id: `help-${Date.now()}-${Math.random()}`,
          timestamp: now,
          level: "local" as const,
          raw: line,
        })),
      ]);
      return true;
    }
    if (lower === "clear") {
      setLines([]);
      seenIds.current.clear();
      return true;
    }
    return false;
  }

  /* ── Send serial ──────────────────────── */
  // submitCommand takes the text explicitly so it can be invoked either from
  // the input box (handleSend) or from anywhere else in the app via the
  // terminal-bus (global keyboard shortcuts, bottom-nav quick actions) — both
  // paths run identical logic and log to the same terminal feed.
  //
  // Fire-and-forget design: the API server writes the command to the ESP32 via
  // TCP synchronously before sending the HTTP response, so the command reaches
  // hardware within milliseconds.  We show TX feedback immediately and dispatch
  // the HTTP confirmation in the background — callers never block on it.
  function submitCommand(rawText: string) {
    const text = rawText.trim();
    if (!text) return;
    setCmdHistory(prev => (prev[prev.length - 1] === text ? prev : [...prev, text]));
    setHistoryIndex(-1);
    const now = new Date();

    if (handleLocalCommand(text)) return;

    const cmdKey = text.length === 1 ? text.toLowerCase() : text.toUpperCase();
    const def = COMMANDS[cmdKey] ?? COMMANDS[text];

    // Gate: block commands when no session is active (except motor-stop / e-stop)
    if (!isCommandAllowed(cmdKey, text)) {
      addLine({
        timestamp: now,
        level: "local",
        raw: `⊘ blocked — start a session first  (${text})`,
      });
      return;
    }

    // Update optimistic throttle display for all speed-adjust paths
    // (single-key shortcuts h/l and their structured CMD: equivalents)
    if (cmdKey === "h" || cmdKey === "CMD:SPEED_UP") adjustThrottle(getThrottleStep());
    else if (cmdKey === "l" || cmdKey === "CMD:SPEED_DOWN") adjustThrottle(-getThrottleStep());

    // Show TX feedback immediately — before the HTTP round-trip.
    addLine({ timestamp: now, level: "tx", raw: `→ ${text}${def ? `  ·  ${def.desc}` : ""}` });

    // "Awaiting" hint also appears immediately — the command is already on its
    // way.  Showing it after the fetch returned (old behaviour) created a
    // false 1-second delay impression caused by HTTP RTT through the proxy.
    if (def?.response && def.response !== "—") {
      addLine({ timestamp: now, level: "local", raw: `Awaiting: ${def.response}` });
    }

    // Dispatch to hardware — fire-and-forget.  The API server routes via WiFi
    // TCP (sendWifiCommand → socket.write) which is synchronous, then falls
    // back to the serial queue for USB/Electron mode.
    fetch(apiUrl("/api/serial/write"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    }).then(async res => {
      const json = await res.json() as { ok: boolean; error?: string };
      if (!json.ok) {
        addLine({ timestamp: new Date(), level: "tx-err", raw: `TX failed: ${json.error ?? "no serial connection — connect hardware first"}` });
      }
    }).catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      addLine({ timestamp: new Date(), level: "tx-err", raw: `TX error: ${msg}` });
    });
  }

  // Keep a stable ref so the terminal-bus handler always calls the latest
  // submitCommand instance (picks up fresh addLine / state each render).
  const submitCommandRef = useRef(submitCommand);
  useEffect(() => { submitCommandRef.current = submitCommand; });

  // Register with the terminal-bus so global keyboard shortcuts and the
  // bottom-nav quick actions can submit commands exactly as if typed here.
  useEffect(() => {
    return registerTerminalHandler((text: string) => { submitCommandRef.current(text); });
  }, []);

  // Register the display-only logger so IR remote events and other system
  // events can inject lines without going through the serial send path.
  const addLineRef = useRef(addLine);
  useEffect(() => { addLineRef.current = addLine; });
  useEffect(() => {
    return registerTerminalLogger((level, text) => {
      addLineRef.current({ timestamp: new Date(), level, raw: text });
    });
  }, []);

  function handleSend() {
    const text = input;
    setInput("");
    void submitCommand(text);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") { e.preventDefault(); handleSend(); return; }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      if (cmdHistory.length === 0) return;
      const next = historyIndex === -1 ? cmdHistory.length - 1 : Math.max(0, historyIndex - 1);
      setHistoryIndex(next);
      setInput(cmdHistory[next]);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (historyIndex === -1) return;
      const next = historyIndex + 1;
      if (next >= cmdHistory.length) { setHistoryIndex(-1); setInput(""); }
      else { setHistoryIndex(next); setInput(cmdHistory[next]); }
      return;
    }
    if (e.key === "Escape") {
      if (input.trim()) {
        // Input has text — just clear it (normal behaviour)
        setInput(""); setHistoryIndex(-1);
      } else {
        // Input already empty — fire emergency stop
        const now = new Date();
        addLine({ timestamp: now, level: "critical", raw: "⚠ EMERGENCY STOP  ·  Esc shortcut" });
        const doEstop = async () => {
          await fetch(apiUrl("/api/serial/write"), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text: "CMD:EMERGENCY_STOP" }),
          });
        };
        void doEstop();
      }
      return;
    }
  }

  /* ── Render helper ─────────────────────── */
  function renderLine(line: TerminalLine) {
    const colors = lineColors[line.level] ?? lineColors.info;
    const icon = LEVEL_ICON[line.level] ?? "●";
    return (
      <div key={line.id} className="flex items-start gap-1.5">
        <span style={{ color: colors.actor, fontSize: "8px", lineHeight: "15px", userSelect: "none", flexShrink: 0 }}>
          {icon}
        </span>
        <span className="text-muted-foreground/60" style={{ fontSize: "9px", lineHeight: "15px", userSelect: "none", flexShrink: 0, minWidth: "42px" }}>
          {isValid(line.timestamp) ? format(line.timestamp, "HH:mm:ss") : "--:--:--"}
        </span>
        <span style={{ color: colors.text, fontSize: "10px", lineHeight: "15px", wordBreak: "break-word", whiteSpace: "pre" }}>
          {line.raw}
        </span>
      </div>
    );
  }

  return (
    <div
      className="flex flex-col h-full min-h-0 rounded-lg overflow-hidden border border-border/70 shadow-sm bg-card"
      style={{ fontFamily: "'Cascadia Code', 'JetBrains Mono', 'Fira Code', 'Courier New', monospace" }}
    >
      {/* Title bar */}
      <div className="shrink-0 flex items-center justify-between px-2 py-1 bg-muted/50 border-b border-border/70">
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground/70" style={{ fontSize: "9px", fontWeight: 600, letterSpacing: "0.04em" }}>
            EVENTS
          </span>
          <ConnectionPill />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground/40" style={{ fontSize: "9px" }}>{lines.length}</span>
          <button
            onClick={() => { setShowHint(v => !v); inputRef.current?.focus(); }}
            className="text-muted-foreground opacity-40 hover:opacity-100 transition-opacity"
            title="Command reference (or type 'help')"
          >
            <HelpCircle size={10} />
          </button>
          <button
            onClick={() => { setLines([]); seenIds.current.clear(); }}
            className="text-muted-foreground opacity-40 hover:opacity-100 transition-opacity"
            title="Clear"
          >
            <Trash2 size={10} />
          </button>
        </div>
      </div>

      {/* Quick-reference hint panel */}
      {showHint && (
        <div className="shrink-0 border-b border-border/60 bg-muted/30 px-2 py-2 space-y-1.5 overflow-y-auto" style={{ maxHeight: "180px" }}>
          {([
            {
              label: "Shortcuts",
              items: [
                ["s", "Start motor (keyboard override)"],
                ["x", "Stop motor gracefully"],
                ["h", "Throttle up (+50 µs PWM)"],
                ["l", "Throttle down (−50 µs PWM)"],
                ["z", "Reset IMU reference angles"],
                ["w", "Force WiFi reconnect"],
                ["Esc", "⚠ Emergency stop (when input empty)"],
              ] as [string, string][],
            },
            {
              label: "Motor",
              items: [
                ["CMD:MOTOR_START", "Start with ramp-up"],
                ["CMD:MOTOR_STOP", "Stop gracefully"],
                ["CMD:EMERGENCY_STOP", "⚠ Immediate halt"],
                ["CMD:SPEED_UP", "Throttle +50 µs"],
                ["CMD:SPEED_DOWN", "Throttle −50 µs"],
                ["CMD:MANUAL_RPM:1500", "Set explicit RPM target"],
                ["CMD:SET_AUTO", "Restore PID auto-control"],
              ] as [string, string][],
            },
            {
              label: "IMU",
              items: [
                ["CMD:RESET_REF", "Reset reference angles"],
              ] as [string, string][],
            },
            {
              label: "System",
              items: [
                ["CMD:WIFI_RECONNECT", "Force WiFi + TCP reconnect"],
              ] as [string, string][],
            },
            {
              label: "Terminal",
              items: [
                ["help", "Show full command reference"],
                ["clear", "Clear terminal log"],
              ] as [string, string][],
            },
          ] as { label: string; items: [string, string][] }[]).map(({ label, items }) => (
            <div key={label} className="space-y-0.5">
              <div className="text-muted-foreground/50 uppercase tracking-wider font-semibold" style={{ fontSize: "7px" }}>
                {label}
              </div>
              {items.map(([cmd, desc]) => (
                <div key={cmd} className="flex items-center gap-2">
                  <button
                    className="shrink-0 px-1 rounded border border-border/60 text-primary hover:bg-primary/10 transition-colors font-mono"
                    style={{ fontSize: "9px", lineHeight: "14px" }}
                    onClick={() => { setInput(cmd); inputRef.current?.focus(); }}
                    title={`Fill "${cmd}"`}
                  >
                    {cmd}
                  </button>
                  <span className="text-muted-foreground/60" style={{ fontSize: "9px" }}>{desc}</span>
                </div>
              ))}
            </div>
          ))}
          <div className="text-muted-foreground/40 pt-0.5" style={{ fontSize: "8px" }}>
            Click any command to fill the input. Use ↑ ↓ to navigate history. Esc clears input.
          </div>
        </div>
      )}

      {/* Log output */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-2 py-1.5 pb-4 space-y-0.5">
        {lines.length === 0 && (
          <div className="text-muted-foreground/40 italic" style={{ fontSize: "10px", lineHeight: "15px" }}>
            No events yet — start a session or connect a device.{" "}
            <button
              className="text-primary/50 hover:text-primary underline underline-offset-2 not-italic"
              style={{ fontSize: "10px" }}
              onClick={() => { setShowHint(v => !v); inputRef.current?.focus(); }}
            >
              {showHint ? "Hide commands" : "Show commands"}
            </button>
          </div>
        )}
        {lines.map(renderLine)}
      </div>

      {/* Input row */}
      <style>{`
        @keyframes blinkCursor { 0%,49%{opacity:1} 50%,100%{opacity:0} }
        .terminal-cursor { animation: blinkCursor 1s steps(2) infinite; }
      `}</style>
      <div className="shrink-0 flex items-center gap-1.5 px-2 py-1 border-t border-border bg-muted/20">
        <span className="text-muted-foreground" style={{ fontSize: "9px", userSelect: "none", flexShrink: 0 }}>
          <Send size={10} style={{ display: "inline", verticalAlign: "text-bottom" }} />
        </span>
        {/* Blinking cursor — left of input, only shown when focused AND no text typed yet */}
        {inputFocused && input.length === 0 && (
          <span className="terminal-cursor shrink-0" style={{ display: "inline-block", width: "7px", height: "13px", background: "#22c55e", borderRadius: "1px" }} />
        )}
        <input
          ref={inputRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder={inputFocused ? "" : "type a command or 'help'…"}
          spellCheck={false}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          className="flex-1 min-w-0 bg-transparent outline-none border-none placeholder:text-muted-foreground/30"
          style={{ fontSize: "12px", lineHeight: "17px", padding: 0, color: "#4ade80", caretColor: "transparent" }}
        />
        <span className="text-muted-foreground/30" style={{ fontSize: "8px", userSelect: "none", flexShrink: 0 }}>
          {inputFocused ? "enter · ↑↓ history · esc" : "click to type"}
        </span>
      </div>
    </div>
  );
}
