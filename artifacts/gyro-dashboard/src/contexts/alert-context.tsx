import React, {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";
import type { Alert } from "@workspace/api-client-react";

// ── Types ──────────────────────────────────────────────────────────────────────

export type AlertLevel = "info" | "warning" | "error" | "critical" | "emergency";
export type AlertDelivery = "log" | "toast" | "dialog" | "fullscreen";

export interface AlertLevelBehavior {
  /** How the alert is surfaced to the user. */
  delivery: AlertDelivery;
  /** Auto-dismiss toast after this many ms. null = never auto-dismiss. */
  autoDismissMs: number | null;
  /** Play a browser notification sound. */
  sound: boolean;
}

export interface AlertBehaviorConfig {
  info: AlertLevelBehavior;
  warning: AlertLevelBehavior;
  error: AlertLevelBehavior;
  critical: AlertLevelBehavior;
  emergency: AlertLevelBehavior;
}

export const DEFAULT_ALERT_BEHAVIOR: AlertBehaviorConfig = {
  info:      { delivery: "log",        autoDismissMs: null,  sound: false },
  warning:   { delivery: "toast",      autoDismissMs: 5000,  sound: false },
  error:     { delivery: "toast",      autoDismissMs: null,  sound: true  },
  critical:  { delivery: "dialog",     autoDismissMs: null,  sound: true  },
  emergency: { delivery: "fullscreen", autoDismissMs: null,  sound: true  },
};

export interface ActiveAlert {
  alert: Alert;
}

/** Hardware-disconnect alerts are always shown as a plain dialog (message +
 *  OK button), regardless of the configured "warning" delivery — see the
 *  three call sites in the api-server that emit these exact messages. They
 *  also auto-dismiss when the hardware reconnects (see dashboard.tsx). */
export function isHardwareDisconnectAlert(alert: Alert): boolean {
  return alert.message.includes("ESP32 disconnected");
}

/** A logged alert plus whether it actually notified the user (toast / dialog /
 *  fullscreen) as opposed to being silently recorded (delivery: "log"). Only
 *  "notified" entries count toward the bell badge — passive session/system
 *  log lines shouldn't inflate it. */
export interface HistoryEntry {
  alert: Alert;
  notified: boolean;
}

// ── localStorage persistence ───────────────────────────────────────────────────

const STORAGE_KEY = "gyro_alert_behavior_v1";

function loadBehavior(): AlertBehaviorConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_ALERT_BEHAVIOR;
    const p = JSON.parse(raw) as Partial<AlertBehaviorConfig>;
    return {
      info:      { ...DEFAULT_ALERT_BEHAVIOR.info,      ...(p.info      ?? {}) },
      warning:   { ...DEFAULT_ALERT_BEHAVIOR.warning,   ...(p.warning   ?? {}) },
      error:     { ...DEFAULT_ALERT_BEHAVIOR.error,     ...(p.error     ?? {}) },
      critical:  { ...DEFAULT_ALERT_BEHAVIOR.critical,  ...(p.critical  ?? {}) },
      emergency: { ...DEFAULT_ALERT_BEHAVIOR.emergency, ...(p.emergency ?? {}) },
    };
  } catch {
    return DEFAULT_ALERT_BEHAVIOR;
  }
}

function saveBehavior(b: AlertBehaviorConfig): void {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(b)); } catch { /* ignore */ }
}

// ── Sound ─────────────────────────────────────────────────────────────────────
// Reuse a single AudioContext across the lifetime of the page to avoid
// exhausting browser audio resources on repeated alerts.

let _audioCtx: AudioContext | null = null;

function getAudioCtx(): AudioContext | null {
  try {
    if (!_audioCtx || _audioCtx.state === "closed") {
      _audioCtx = new AudioContext();
    }
    return _audioCtx;
  } catch {
    return null;
  }
}

function playAlertSound(level: AlertLevel): void {
  const ctx = getAudioCtx();
  if (!ctx) return;
  try {
    const freq = level === "emergency" ? 880 : level === "critical" ? 660 : 440;
    const now = ctx.currentTime;

    const play = (startAt: number, frequency: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.setValueAtTime(frequency, startAt);
      gain.gain.setValueAtTime(0.3, startAt);
      gain.gain.exponentialRampToValueAtTime(0.001, startAt + 0.4);
      osc.start(startAt);
      osc.stop(startAt + 0.4);
    };

    play(now, freq);
    if (level === "emergency") play(now + 0.5, freq * 1.2);
  } catch { /* non-fatal */ }
}

// ── Context ───────────────────────────────────────────────────────────────────

interface AlertContextValue {
  behavior: AlertBehaviorConfig;
  setBehavior: (b: AlertBehaviorConfig) => void;
  /** Alerts requiring modal/fullscreen acknowledgement. */
  activeAlerts: ActiveAlert[];
  /** Full history of all dispatched alerts (newest first). The bell badge
   *  counts only entries where `notified` is true (see HistoryEntry). */
  history: HistoryEntry[];
  /** Count of history entries that actually notified the user, scoped to the
   *  currently active hardware session (see `setActiveSessionId`). Falls
   *  back to counting all notified entries when no active session is set. */
  notifiedCount: number;
  /** Tell the alert context which hardware session is currently active, so
   *  the bell badge only counts alerts belonging to it. Full cross-session
   *  history stays intact in `history` — only the badge count is scoped.
   *  Pass null when no session is running (badge then shows 0). */
  setActiveSessionId: (id: number | null) => void;
  dispatch: (alert: Alert) => void;
  acknowledge: (id: number | string) => void;
  /** Remove active alerts whose configured delivery matches the given mode. */
  acknowledgeByDelivery: (delivery: AlertDelivery) => void;
  /** Remove active alerts matching an arbitrary predicate. */
  acknowledgeMatching: (predicate: (alert: Alert) => boolean) => void;
  acknowledgeAll: () => void;
  clearHistory: () => void;
  /** Clear active alerts, history, and reset the badge count in one action. */
  clearAll: () => void;
}

const AlertContext = createContext<AlertContextValue | null>(null);

// ── Provider ──────────────────────────────────────────────────────────────────

export function AlertProvider({ children }: { children: React.ReactNode }) {
  const [behavior, setBehaviorState] = useState<AlertBehaviorConfig>(loadBehavior);
  const [activeAlerts, setActiveAlerts] = useState<ActiveAlert[]>([]);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<number | null>(null);
  // seenIds is bounded: when it exceeds SEEN_CAP we drop the oldest half so
  // long-running sessions don't suppress new alerts if the server resets IDs.
  const SEEN_CAP = 5_000;
  const seenIds = useRef<Map<number | string, number>>(new Map()); // id → insertion order

  const setBehavior = useCallback((b: AlertBehaviorConfig) => {
    setBehaviorState(b);
    saveBehavior(b);
  }, []);

  const dispatch = useCallback((alert: Alert) => {
    if (seenIds.current.has(alert.id)) return;
    // Prune oldest half when cap is reached to prevent unbounded growth
    if (seenIds.current.size >= SEEN_CAP) {
      const keys = Array.from(seenIds.current.keys()).slice(0, SEEN_CAP / 2);
      keys.forEach(k => seenIds.current.delete(k));
    }
    seenIds.current.set(alert.id, Date.now());

    const level = (alert.level as AlertLevel) || "info";
    const cfg = behavior[level] ?? DEFAULT_ALERT_BEHAVIOR[level] ?? DEFAULT_ALERT_BEHAVIOR.info;
    // Hardware-disconnect alerts always need a plain dialog + OK button so
    // they can be dismissed (or auto-dismissed on reconnect), even though
    // their level ("warning") is otherwise configured to just toast.
    const forceDialog = isHardwareDisconnectAlert(alert);
    const delivery = forceDialog ? "dialog" : cfg.delivery;

    // Always log to history; only entries that actually notify the user
    // (toast/dialog/fullscreen) count toward the bell badge.
    const notified = delivery !== "log";
    setHistory(prev => [{ alert, notified }, ...prev].slice(0, 500));

    if (cfg.sound && !forceDialog) playAlertSound(level);

    if (delivery === "log") return;

    if (delivery === "toast") {
      const duration = cfg.autoDismissMs ?? Infinity;
      const desc = `${new Date(alert.timestamp).toLocaleTimeString()} · ${level.toUpperCase()}`;
      if (level === "error" || level === "critical") {
        toast.error(alert.message, { duration, description: desc });
      } else if (level === "warning") {
        toast.warning(alert.message, { duration, description: desc });
      } else {
        toast(alert.message, { duration, description: desc });
      }
      return;
    }

    if (delivery === "dialog" || delivery === "fullscreen") {
      setActiveAlerts(prev => [...prev, { alert }]);
    }
  }, [behavior]);

  const acknowledge = useCallback((id: number | string) => {
    setActiveAlerts(prev => prev.filter(a => a.alert.id !== id));
  }, []);

  /** Dismiss any active alerts matching a predicate — used to auto-clear
   *  hardware-disconnect dialogs the moment the hardware reconnects. */
  const acknowledgeMatching = useCallback((predicate: (alert: Alert) => boolean) => {
    setActiveAlerts(prev => prev.filter(a => !predicate(a.alert)));
  }, []);

  const acknowledgeByDelivery = useCallback((delivery: AlertDelivery) => {
    setActiveAlerts(prev =>
      prev.filter(a => {
        const lvl = (a.alert.level as AlertLevel) || "info";
        const cfg = behavior[lvl] ?? DEFAULT_ALERT_BEHAVIOR[lvl] ?? DEFAULT_ALERT_BEHAVIOR.info;
        return cfg.delivery !== delivery;
      }),
    );
  }, [behavior]);

  const acknowledgeAll = useCallback(() => setActiveAlerts([]), []);
  const clearHistory = useCallback(() => setHistory([]), []);
  const clearAll = useCallback(() => {
    setActiveAlerts([]);
    setHistory([]);
  }, []);

  // Bell badge only counts the *current* hardware session's alerts — a new
  // session starting naturally zeroes the badge since no alerts for that
  // sessionId exist yet, while "History" (in AlertCenter) still shows
  // everything across sessions via `history` unfiltered.
  const notifiedCount = history.reduce(
    (n, h) => (h.notified && h.alert.sessionId === activeSessionId ? n + 1 : n),
    0,
  );

  return (
    <AlertContext.Provider value={{
      behavior, setBehavior,
      activeAlerts, history, notifiedCount, setActiveSessionId,
      dispatch, acknowledge, acknowledgeByDelivery, acknowledgeMatching, acknowledgeAll, clearHistory, clearAll,
    }}>
      {children}
    </AlertContext.Provider>
  );
}

export function useAlertContext(): AlertContextValue {
  const ctx = useContext(AlertContext);
  if (!ctx) throw new Error("useAlertContext must be used within AlertProvider");
  return ctx;
}
