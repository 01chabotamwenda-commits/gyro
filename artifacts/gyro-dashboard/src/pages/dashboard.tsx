import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { apiUrl } from "@/lib/api-url";
import {
  useGetLatestReading,
  getGetLatestReadingQueryKey,
  getGetReadingStatsQueryKey,
  useGetSession,
  getGetSessionQueryKey,
  useGetAlerts,
  getGetAlertsQueryKey,
  useGetReadingHistory,
  getGetReadingHistoryQueryKey,
  useGetSettings,
  getGetSettingsQueryKey,
  useGetCapabilities,
  getGetCapabilitiesQueryKey,
  useSetPidEnabled,
  useResetAngleRef,
  useGetAngleRef,
  getGetAngleRefQueryKey,
  useResetSession,
} from "@workspace/api-client-react";
import {
  useDashboardWebSocket,
  type HardwareConnectedEvent,
  type SessionUpdateEvent,
  type ExtendedSensorReading,
} from "@/hooks/use-websocket";
import { sendTerminalCommand, logTerminalEvent } from "@/lib/terminal-bus";
import { setSessionActive } from "@/lib/command-gate";
import { setThrottleBase, setThrottleStep } from "@/lib/throttle-bus";
import { BottomNavBar } from "@/components/BottomNavBar";
import { StatCards } from "@/components/StatCards";
import { AlertCenter, AlertBellButton } from "@/components/AlertCenter";
import { useAlertContext, isHardwareDisconnectAlert } from "@/contexts/alert-context";
import {
  RpmChart,
  TiltChart,
  TempChart,
  VibrationChart,
  PwmChart,
  type TimeScale,
} from "@/components/LiveCharts";
import { SystemTerminal } from "@/components/SystemTerminal";
import { LiveFailureForecast } from "@/components/LiveFailureForecast";
import { SessionControl } from "@/components/SessionControl";
import { MotorSweepDialog } from "@/components/MotorSweepDialog";

import {
  Clock,
  Settings,
  History,
  TrendingUp,
  BookOpen,
  Sun,
  Moon,
  WifiOff,
  AlertTriangle,
  PlugZap,
  X,
  SlidersHorizontal,
  Cpu,
  Wrench,
} from "lucide-react";
import { Link } from "wouter";
import { ConnectivityChip } from "@/components/ConnectivityChip";
import {
  ConnectDialog,
  Esp32DiscoveryBanner,
  useAutoConnectDialog,
} from "@/components/ConnectDialog";
import { useToast } from "@/hooks/use-toast";
import { useTheme } from "@/hooks/use-theme";
import {
  ThresholdsDialog,
  SpeedDialog,
  PidTuningDialog,
} from "@/components/ControlDialogs";

const TIME_SCALES: TimeScale[] = ["30s", "1m", "5m", "15m", "1h", "4h", "1d"];

const SCALE_PARAMS: Record<
  TimeScale,
  { limit?: number; sinceMinutes?: number }
> = {
  "30s": { limit: 120 },
  "1m": { sinceMinutes: 1 },
  "5m": { sinceMinutes: 5 },
  "15m": { sinceMinutes: 15 },
  "1h": { sinceMinutes: 60 },
  "4h": { sinceMinutes: 240 },
  "1d": { sinceMinutes: 1440 },
};

// ─── Sensor panel offline overlay ─────────────────────────────────────────────

type HealthStatus = "OK" | "FAIL" | "UNKNOWN" | undefined;

function SensorPanel({
  children,
  label,
  online,
  health,
}: {
  children: React.ReactNode;
  label: string;
  online: boolean;
  health?: HealthStatus;
}) {
  const badge =
    health === "OK" ? (
      <span className="text-[9px] font-bold text-green-400 bg-green-400/10 border border-green-400/30 rounded px-1 py-0.5">
        ✓ OK
      </span>
    ) : health === "FAIL" ? (
      <span className="text-[9px] font-bold text-red-400 bg-red-400/10 border border-red-400/30 rounded px-1 py-0.5">
        ✗ FAIL
      </span>
    ) : null;

  return (
    <div className="relative min-h-0 h-full">
      {children}
      {/* Health badge — top-right corner, always shown when status is known */}
      {badge && (
        <div className="absolute top-1.5 right-1.5 z-10 pointer-events-none">
          {badge}
        </div>
      )}
      {/* OFFLINE overlay — only when hardware is connected but sensor is absent */}
      {!online && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-1.5 rounded-lg bg-background/80 backdrop-blur-[2px] border border-border/60">
          <WifiOff className="w-5 h-5 text-muted-foreground/50" />
          <span className="text-[10px] font-semibold text-muted-foreground/70 uppercase tracking-wider">
            {label} offline
          </span>
          <span className="text-[9px] text-muted-foreground/50">
            not detected in device info
          </span>
        </div>
      )}
    </div>
  );
}

// ─── Dashboard ─────────────────────────────────────────────────────────────────

export default function Dashboard() {
  const [timeScale, setTimeScale] = useState<TimeScale>("1m");
  const queryClient = useQueryClient();
  const [connectOpenAuto, setConnectOpenAuto] = useAutoConnectDialog();

  const connectOpen = connectOpenAuto;
  const setConnectOpen = setConnectOpenAuto;

  const historyParams = useMemo(() => SCALE_PARAMS[timeScale], [timeScale]);

  const { data: session } = useGetSession({
    query: { refetchInterval: 1000, queryKey: getGetSessionQueryKey() },
  });
  // Fetch stats with 30-second window so cards always show data when charts do
  const { data: stats } = useQuery({
    queryKey: ["readings/stats", "30s-window"],
    queryFn: async () => {
      const response = await fetch(apiUrl("/api/readings/stats?sinceSecs=30"));
      if (!response.ok) throw new Error("Failed to fetch stats");
      return response.json();
    },
    refetchInterval: 1000,
  });
  const { data: history } = useGetReadingHistory(historyParams, {
    query: {
      refetchInterval: 3000,
      queryKey: getGetReadingHistoryQueryKey(historyParams),
    },
  });
  const { data: alerts } = useGetAlerts({
    query: { refetchInterval: 5000, queryKey: getGetAlertsQueryKey() },
  });
  const { data: settings } = useGetSettings({
    query: { refetchInterval: 10000, queryKey: getGetSettingsQueryKey() },
  });
  const { data: latestReadingPolled } = useGetLatestReading({
    query: { refetchInterval: 1000, queryKey: getGetLatestReadingQueryKey() },
  });
  const { data: capsData, refetch: refetchCaps } = useGetCapabilities({
    query: { refetchInterval: 30000, queryKey: getGetCapabilitiesQueryKey() },
  });

  // When hardware connects: flush every React Query cache so charts start
  // clean and pick up real hardware readings.
  const handleHardwareConnected = useCallback(
    (event: HardwareConnectedEvent) => {
      // Invalidate all queries — next refetch will get fresh data from the server
      queryClient.invalidateQueries();
      // Refetch capabilities immediately
      void refetchCaps();
      console.info(
        `[dashboard] Hardware connected on ${event.port} at ${event.connectedAt}`,
      );
    },
    [queryClient, refetchCaps],
  );

  // When the server closes a session (e.g. emergency stop), refresh the session
  // and alerts immediately so the UI reflects the new state without waiting for poll.
  const handleSessionUpdate = useCallback(
    (_event: SessionUpdateEvent) => {
      queryClient.invalidateQueries({ queryKey: getGetSessionQueryKey() });
      queryClient.invalidateQueries({ queryKey: getGetAlertsQueryKey() });
      console.info(
        `[dashboard] session_update — session and alerts invalidated`,
      );
    },
    [queryClient],
  );

  // When a session is reset (same id, fresh startedAt, readings cleared):
  // drop every history/stats query so the charts redraw empty immediately,
  // and refresh the session so the elapsed timer restarts from 0.
  const handleSessionReset = useCallback(
    (_event: { id: string }) => {
      queryClient.invalidateQueries({ queryKey: getGetSessionQueryKey() });
      queryClient.invalidateQueries({ queryKey: getGetAlertsQueryKey() });
      queryClient.invalidateQueries({ queryKey: getGetReadingStatsQueryKey() });
      queryClient.invalidateQueries({ queryKey: getGetReadingHistoryQueryKey(historyParams) });
      console.info(`[dashboard] session_reset — history and stats invalidated`);
    },
    [queryClient, historyParams],
  );

  const {
    latestReading: wsReading,
    latestAlert,
    latestIrCommand,
    motorSweepConfirm,
    setMotorSweepConfirm,
    isConnected,
    hardwareConnectedAt,
    lastReadingAt,
    angleRef: wsAngleRef,
    setAngleRef: setWsAngleRef,
  } = useDashboardWebSocket(handleHardwareConnected, handleSessionUpdate, handleSessionReset);

  // Seed tilt reference from server on mount, then keep in sync via WS ref_reset events
  const { data: serverAngleRef } = useGetAngleRef({
    query: { queryKey: getGetAngleRefQueryKey(), staleTime: Infinity },
  });
  const tiltRefActive =
    (wsAngleRef.refX !== 0 || wsAngleRef.refY !== 0) ||
    ((serverAngleRef?.refX ?? 0) !== 0 || (serverAngleRef?.refY ?? 0) !== 0);

  const resetAngleRef = useResetAngleRef();
  const resetSession = useResetSession();
  const { dispatch: dispatchAlert, acknowledgeMatching, setActiveSessionId } = useAlertContext();

  // Keep the alert context's active-session pointer in sync so the bell
  // badge only counts alerts belonging to the currently running/last session,
  // not every alert accumulated across the whole browser tab lifetime.
  useEffect(() => {
    setActiveSessionId(session?.id ? Number(session.id) : null);
  }, [session?.id, setActiveSessionId]);

  // Auto-close the Connect Hardware dialog when hardware is detected via WebSocket
  useEffect(() => {
    if (hardwareConnectedAt) {
      setConnectOpen(false);
    }
  }, [hardwareConnectedAt, setConnectOpen]);

  // Auto-dismiss the "hardware disconnected" dialog the moment the ESP32
  // reconnects — the user only needs to click OK if it stays disconnected.
  useEffect(() => {
    if (hardwareConnectedAt) {
      acknowledgeMatching(isHardwareDisconnectAlert);
    }
  }, [hardwareConnectedAt, acknowledgeMatching]);

  // Prefer real-time WebSocket reading; fall back to polled REST reading
  const currentReading: ExtendedSensorReading | null =
    wsReading || (latestReadingPolled as ExtendedSensorReading | undefined) || null;

  // PID mode — single source of truth.
  // Seeded from three places (all converge on the same value):
  //   1. Incoming WebSocket readings: firmware reports its real autoMode every tick.
  //   2. IR 200+ press: CMD:IR_PID_ON / CMD:IR_PID_OFF arrive before the next reading.
  //   3. Dashboard button: optimistic flip; rolled back on API error.
  const [pidModeOptimistic, setPidModeOptimistic] = useState<'auto' | 'manual' | null>(null);
  useEffect(() => {
    if (wsReading?.mode != null) setPidModeOptimistic(wsReading.mode);
  }, [wsReading]);
  const pidOn = pidModeOptimistic === "auto";

  const setPidEnabled = useSetPidEnabled();

  // In hardware mode: capabilities gate which sensor panels are active.
  // When no hardware connected: show all sensors as placeholders (zeros until ESP32 connects).
  const isHardwareMode = Boolean(hardwareConnectedAt);

  // ── Connection health watchdog ──────────────────────────────────────────────
  // In hardware mode, track seconds since last reading. A single dropped
  // packet (normal WiFi/serial jitter) should never flap this banner. The
  // websocket/TCP connection state (`isConnected`) is the primary signal —
  // reading staleness is only a secondary confirmation after a longer buffer,
  // so one late packet on an otherwise-live link doesn't trigger a false
  // "signal lost".
  const SIGNAL_LOST_THRESHOLD_SEC = 8;
  const [signalLostSec, setSignalLostSec] = useState(0);
  const [dismissedSignalLoss, setDismissedSignalLoss] = useState(false);
  useEffect(() => {
    if (!isHardwareMode) {
      setSignalLostSec(0);
      setDismissedSignalLoss(false);
      return;
    }
    const id = setInterval(() => {
      // Connection itself reporting down is an immediate, authoritative signal.
      if (!isConnected) {
        setSignalLostSec((prev) => prev || SIGNAL_LOST_THRESHOLD_SEC);
        return;
      }
      if (!lastReadingAt) return;
      const sec = Math.floor((Date.now() - lastReadingAt.getTime()) / 1000);
      if (sec < SIGNAL_LOST_THRESHOLD_SEC && dismissedSignalLoss) {
        // Signal recovered, reset dismissal
        setDismissedSignalLoss(false);
      }
      setSignalLostSec(sec >= SIGNAL_LOST_THRESHOLD_SEC ? sec : 0);
    }, 1000);
    return () => clearInterval(id);
  }, [isHardwareMode, isConnected, lastReadingAt, dismissedSignalLoss]);
  const caps = capsData?.capabilities;
  const deviceInfo = capsData?.deviceInfo ?? null;

  function capHealth(component: string): HealthStatus {
    if (!deviceInfo?.health) return undefined;
    const h = deviceInfo.health[component];
    if (h === "OK" || h === "FAIL" || h === "UNKNOWN") return h;
    return undefined;
  }

  // When hardware mode is active, look up health by the canonical component names
  // the firmware uses (MPU6050, ESC, TEMP_SENSOR, SD_CARD, VIBRATION).
  const imuHealth = capHealth("MPU6050");
  const motorHealth = capHealth("ESC");
  const tempHealth = capHealth("TEMP_SENSOR") ?? capHealth("TEMP");
  const vibrHealth = capHealth("VIBRATION") ?? capHealth("ACCEL");

  const [elapsed, setElapsed] = useState("00:00:00");

  const getLusakaTime = () =>
    new Date().toLocaleTimeString("en-GB", {
      timeZone: "Africa/Lusaka",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
  const [lusakaTime, setLusakaTime] = useState(getLusakaTime);
  useEffect(() => {
    const id = setInterval(() => setLusakaTime(getLusakaTime()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (session?.status === "running" && session.startedAt) {
      const interval = setInterval(() => {
        const start = new Date(session.startedAt!).getTime();
        const diffSeconds = Math.floor((Date.now() - start) / 1000);
        const h = Math.floor(diffSeconds / 3600)
          .toString()
          .padStart(2, "0");
        const m = Math.floor((diffSeconds % 3600) / 60)
          .toString()
          .padStart(2, "0");
        const s = (diffSeconds % 60).toString().padStart(2, "0");
        setElapsed(`${h}:${m}:${s}`);
      }, 1000);
      return () => clearInterval(interval);
    }
    if (session?.elapsedSeconds) {
      const d = session.elapsedSeconds;
      const h = Math.floor(d / 3600)
        .toString()
        .padStart(2, "0");
      const m = Math.floor((d % 3600) / 60)
        .toString()
        .padStart(2, "0");
      const s = (d % 60).toString().padStart(2, "0");
      setElapsed(`${h}:${m}:${s}`);
      return;
    }
    setElapsed("00:00:00");
    return undefined;
  }, [session]);

  const sessionProgress = useMemo(() => {
    if (!session?.startedAt || !session.targetDurationHours) return 0;
    if (session.status !== "running" && session.status !== "warning") return 0;
    const elapsedSec =
      (Date.now() - new Date(session.startedAt).getTime()) / 1000;
    return Math.min(1, elapsedSec / (session.targetDurationHours * 3600));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  const motorState = session?.motorState ?? "off";
  const tempWarn = settings?.tempWarnThreshold ?? 55;
  const tempCrit = settings?.tempCritThreshold ?? 65;
  const vibWarn = settings?.vibWarnThreshold ?? 4.5;
  const vibCrit = settings?.vibCritThreshold ?? 7.1;
  const maxTiltAngle = settings?.maxTiltAngle ?? 45;
  const { toast } = useToast();
  const { theme, toggleTheme } = useTheme();
  const [thresholdsOpen, setThresholdsOpen] = useState(false);
  const [speedOpen, setSpeedOpen] = useState(false);
  const [pidTuningOpen, setPidTuningOpen] = useState(false);
  const [alertCenterOpen, setAlertCenterOpen] = useState(false);
  const [keyboardShortcutUses, setKeyboardShortcutUses] = useState(0);
  const sessionStartPendingRef = useRef(false);
  const bottomNavTogglePinRef = useRef<(() => void) | null>(null);

  const handleResetSession = useCallback(() => {
    resetSession.mutate(undefined, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetSessionQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetAlertsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetReadingStatsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetReadingHistoryQueryKey(historyParams) });
        toast({ title: "Session reset", description: "Timer and history cleared — motor left untouched." });
      },
      onError: () => {
        toast({ title: "Reset failed", description: "No active session to reset, or server unreachable.", variant: "destructive" });
      },
    });
  }, [resetSession, queryClient, historyParams, toast]);

  const handlePidToggle = useCallback(() => {
    const newEnabled = !pidOn;
    setPidModeOptimistic(newEnabled ? "auto" : "manual"); // flip immediately
    setPidEnabled.mutate(
      { data: { enabled: newEnabled } },
      {
        onSuccess: (data) => {
          setPidModeOptimistic(data.mode === "auto" ? "auto" : "manual");
          toast({ title: data.mode === "auto" ? "PID auto mode ON" : "PID auto mode OFF", description: data.message });
        },
        onError: () => {
          setPidModeOptimistic(newEnabled ? "manual" : "auto"); // rollback
          toast({ title: "Failed to toggle PID", variant: "destructive" });
        },
      },
    );
  }, [pidOn, setPidEnabled, setPidModeOptimistic, toast]);

  const handleZeroTilt = useCallback(() => {
    resetAngleRef.mutate(undefined, {
      onSuccess: (data) => {
        setWsAngleRef({ refX: data.refX, refY: data.refY });
        toast({
          title: "Angles zeroed",
          description: `Current position set as reference (X: ${data.refX.toFixed(2)}°, Y: ${data.refY.toFixed(2)}°)`,
        });
      },
      onError: () => {
        toast({ title: "Zero failed", variant: "destructive" });
      },
    });
  }, [resetAngleRef, setWsAngleRef, toast]);

  // Shared session-start function used by both the q/Q keyboard shortcut and
  // (future) any other caller. Has its own pending ref so concurrent keyboard
  // presses can't fire duplicate POSTs before session state updates.
  const handleSessionStart = useCallback(async () => {
    if (sessionStartPendingRef.current) return;
    sessionStartPendingRef.current = true;
    try {
      const res = await fetch(apiUrl("/api/session"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetRpm: settings?.targetRpm ?? 8000,
          targetDurationHours: settings?.targetDurationHours ?? 24,
        }),
      });
      const body = await res.json().catch(() => ({})) as { error?: string };
      if (!res.ok) {
        toast({ title: "Could not start session", description: body?.error ?? `Server returned ${res.status}`, variant: "destructive" });
        return;
      }
      queryClient.invalidateQueries({ queryKey: getGetSessionQueryKey() });
      queryClient.invalidateQueries({ queryKey: getGetAlertsQueryKey() });
      toast({ title: "Session started", description: "Started via keyboard shortcut (Q)." });
    } catch {
      toast({ title: "Could not start session", description: "Could not reach the server.", variant: "destructive" });
    } finally {
      sessionStartPendingRef.current = false;
    }
  }, [settings, queryClient, toast]);

  // Keep stable ref for use inside the keydown closure
  const handleSessionStartRef = useRef(handleSessionStart);
  useEffect(() => { handleSessionStartRef.current = handleSessionStart; }, [handleSessionStart]);

  const sessionActive =
    session?.status === "running" || session?.status === "warning";

  // Sync command-gate singleton with React session state
  useEffect(() => { setSessionActive(sessionActive); }, [sessionActive]);

  // Reset keyboard shortcut counter when a new session starts so the bottom
  // nav bar starts pinned (visible) for each fresh session.
  useEffect(() => {
    if (sessionActive) setKeyboardShortcutUses(0);
  }, [sessionActive]);

  // Seed throttle bus from persisted settings so the BottomNavBar readout
  // starts at the correct base value rather than the bus default (1100 µs).
  useEffect(() => {
    if (settings?.pidBaseThrottle != null) {
      setThrottleBase(settings.pidBaseThrottle);
    }
  }, [settings?.pidBaseThrottle]);

  // Keep the optimistic display step in sync with the firmware's actual
  // MOTOR_SPEED_STEP (settings.motorSpeedStepUs, pushed via
  // CMD:SET_SPEED_STEP) — otherwise Speed Up/Down would show a jump that
  // doesn't match what the motor really does.
  useEffect(() => {
    if (settings?.motorSpeedStepUs != null) {
      setThrottleStep(settings.motorSpeedStepUs);
    }
  }, [settings?.motorSpeedStepUs]);

  // Sync the throttle-bus from real firmware telemetry so BottomNavBar always
  // shows the actual ESC pulse width rather than an optimistic local estimate.
  // motorPulseUs is the value the firmware just wrote to the LEDC peripheral
  // (escPulse field), so it reflects all command sources — buttons, keyboard,
  // IR remote, and auto-mode PID corrections.
  useEffect(() => {
    const pulse = (wsReading as (typeof wsReading & { motorPulseUs?: number }) | null)?.motorPulseUs;
    if (pulse && pulse > 0) {
      setThrottleBase(pulse);
    }
  }, [wsReading]);

  // Dispatch incoming WebSocket alerts through the global alert context so they
  // trigger the correct delivery channel (toast / dialog / fullscreen) per config.
  const prevAlertId = useRef<number | string | null>(null);
  useEffect(() => {
    if (!latestAlert) return;
    if (prevAlertId.current === latestAlert.id) return;
    prevAlertId.current = latestAlert.id;
    dispatchAlert(latestAlert);
  }, [latestAlert, dispatchAlert]);

  // Reconcile polled alerts into the context so alerts missed during WS
  // disconnect (startup, reconnect, backgrounding) still reach the correct
  // delivery channel. dispatch() is idempotent: already-seen IDs are silently
  // skipped, so this won't duplicate alerts already surfaced via WebSocket.
  useEffect(() => {
    if (!alerts?.length) return;
    alerts.forEach(a => dispatchAlert(a));
  }, [alerts, dispatchAlert]);

  // CH (middle) button on the IR remote toggles the speed dialog.
  // CH is allowed even without an active session so the user can set idle
  // speed before starting. Other IR commands that need a session are handled
  // in SessionControl — they guard themselves.
  const prevIrTs = useRef<string | null>(null);
  useEffect(() => {
    if (!latestIrCommand) return;
    if (prevIrTs.current === latestIrCommand.timestamp) return;
    prevIrTs.current = latestIrCommand.timestamp;
    if (latestIrCommand.line === "CMD:IR_PID_TUNING") {
      setSpeedOpen(prev => {
        logTerminalEvent("info", `[IR] CH  →  Speed dialog ${prev ? "closed" : "opened"}`);
        return !prev;
      });
    } else if (latestIrCommand.line === "CMD:IR_PID_ON") {
      setPidModeOptimistic("auto");
      logTerminalEvent("info", "[IR] 200+  →  PID auto mode ON");
      toast({ title: "PID auto mode ON", description: "Activated via IR remote (200+)" });
    } else if (latestIrCommand.line === "CMD:IR_PID_OFF") {
      setPidModeOptimistic("manual");
      logTerminalEvent("info", "[IR] 200+  →  PID auto mode OFF");
      toast({ title: "PID auto mode OFF", description: "Deactivated via IR remote (200+)" });
    }
  }, [latestIrCommand, setPidModeOptimistic, toast]);

  // Keep a stable ref to handlePidToggle so the keydown effect below doesn't
  // need to re-register on every render when pidOn changes.
  const handlePidToggleRef = useRef(handlePidToggle);
  useEffect(() => { handlePidToggleRef.current = handlePidToggle; }, [handlePidToggle]);

  // Press-and-hold refs for h/l speed keys — defined at component scope so
  // both keydown and keyup handlers share them without stale-closure issues.
  const holdIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const holdKeyRef = useRef<string | null>(null);

  useEffect(() => {
    function stopHold() {
      if (holdIntervalRef.current) { clearInterval(holdIntervalRef.current); holdIntervalRef.current = null; }
      holdKeyRef.current = null;
    }

    // Case-insensitive: Shift+H/L starts a hold via toLowerCase(), so keyup
    // must also match both cases.
    function handleKeyUp(e: KeyboardEvent) {
      const lower = e.key.toLowerCase();
      if (lower === "h" || lower === "l") stopHold();
    }

    // Stop any active hold when the window loses focus (e.g. Alt+Tab) so the
    // keyup that would normally clear the interval is not missed.
    function handleBlur() { stopHold(); }
    function handleVisibility() { if (document.hidden) stopHold(); }

    async function handleKeyDown(e: KeyboardEvent) {
      // Don't fire single-char shortcuts when the user is typing in an input.
      const tag = (e.target as HTMLElement)?.tagName;
      const inInput = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT"
        || (e.target as HTMLElement)?.isContentEditable;

      // Space — toggle the bottom nav bar visibility (pin/unpin).
      // Guards: not in a text field, not a key-repeat, no modifier keys, and
      // not on a focused interactive element (button/link/role=button) where
      // Space has native meaning (activate the control).
      if (e.key === " " && !e.repeat && !inInput && !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey) {
        const isInteractive = (e.target as HTMLElement)?.closest(
          "button, a, [role='button'], [role='link'], [role='menuitem'], [role='option'], [role='tab']"
        ) !== null;
        if (!isInteractive) {
          e.preventDefault();
          bottomNavTogglePinRef.current?.();
          return;
        }
      }

      if (e.key === "Escape") {
        // Emergency stop fires regardless of session state — the motor may have
        // been started manually before a session was created.
        try {
          const res = await fetch(apiUrl("/api/motor/command"), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ command: "emergency_shutdown" }),
          });
          if (!res.ok) throw new Error(`Server returned ${res.status}`);
          toast({
            title: "Emergency shutdown",
            description: "Motor halted via keyboard shortcut (Esc).",
            variant: "destructive",
          });
        } catch {
          toast({
            title: "E-stop failed",
            description: "Could not reach server.",
            variant: "destructive",
          });
        }
        return;
      }

      if ((e.key === "a" || e.key === "A") && !inInput && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        if (!sessionActive) {
          toast({ title: "No active session", description: "Start a session with Q or the Start Session button.", variant: "destructive" });
          return;
        }
        setKeyboardShortcutUses(n => n + 1);
        handlePidToggleRef.current();
        return;
      }

      // Q / q — start session (keyboard override, mirrors IR CH+)
      if ((e.key === "q" || e.key === "Q") && !inInput && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        if (!sessionActive) {
          void handleSessionStartRef.current();
        }
        return;
      }

      // h/l — press-and-hold: fire immediately, then repeat every 150 ms.
      // Other single-key shortcuts (s/x/z/w) remain single-fire.
      const lower = e.key.toLowerCase();
      if ((lower === "h" || lower === "l") && !inInput && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        if (e.repeat) return; // interval already running
        stopHold(); // clear any orphaned interval before starting a new one
        setKeyboardShortcutUses(n => n + 1);
        sendTerminalCommand(lower);
        holdKeyRef.current = lower;
        holdIntervalRef.current = setInterval(() => sendTerminalCommand(lower), 150);
        return;
      }

      if (["s", "x", "z", "w"].includes(lower) && !inInput && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        setKeyboardShortcutUses(n => n + 1);
        sendTerminalCommand(lower);
        return;
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    window.addEventListener("blur", handleBlur);
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("blur", handleBlur);
      document.removeEventListener("visibilitychange", handleVisibility);
      stopHold();
    };
  }, [sessionActive, toast, setKeyboardShortcutUses]);

  return (
    <div className="h-full bg-background text-foreground font-sans flex flex-col overflow-hidden">
      {/* ── Header ── */}
      <header className="border-b border-border bg-card/80 backdrop-blur px-3 py-1.5 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div
            className={`w-2 h-2 rounded-full shrink-0 ${isHardwareMode ? "bg-chart-3 animate-pulse" : "bg-muted-foreground/40"}`}
          />
          <div className="flex flex-col leading-tight">
            <h1 className="text-sm font-bold text-foreground leading-tight">
              Gyro Monitor
            </h1>
          </div>
          {/* Hardware mode badge */}
          {isHardwareMode && deviceInfo && (
            <span className="hidden sm:flex items-center gap-1 text-[9px] font-mono font-semibold px-1.5 py-0.5 rounded border border-green-500/40 text-green-400 bg-green-500/10">
              <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
              {deviceInfo.deviceId} v{deviceInfo.version}
            </span>
          )}
        </div>
        <div className="flex items-center gap-4 text-xs">
          <AlertBellButton onClick={() => setAlertCenterOpen(true)} />
          <Link href="/sessions">
            <button
              className="group flex items-center gap-0 hover:gap-1.5 text-[10px] font-mono px-2 py-1 rounded border border-border text-muted-foreground hover:text-foreground hover:bg-muted/20 transition-all duration-200"
              title="Session history"
            >
              <History className="w-3 h-3 shrink-0" />
              <span className="overflow-hidden max-w-0 group-hover:max-w-[52px] transition-all duration-200 whitespace-nowrap">
                Sessions
              </span>
            </button>
          </Link>
          <Link href="/predictions">
            <button
              className="group flex items-center gap-0 hover:gap-1.5 text-[10px] font-mono px-2 py-1 rounded border border-border text-muted-foreground hover:text-foreground hover:bg-muted/20 transition-all duration-200"
              title="Predictive analytics"
            >
              <TrendingUp className="w-3 h-3 shrink-0" />
              <span className="overflow-hidden max-w-0 group-hover:max-w-[68px] transition-all duration-200 whitespace-nowrap">
                Predictions
              </span>
            </button>
          </Link>
          <Link href="/settings">
            <button
              className="group flex items-center gap-0 hover:gap-1.5 text-[10px] font-mono px-2 py-1 rounded border border-border text-muted-foreground hover:text-foreground hover:bg-muted/20 transition-all duration-200"
              title="Settings"
            >
              <Settings className="w-3 h-3 shrink-0" />
              <span className="overflow-hidden max-w-0 group-hover:max-w-[48px] transition-all duration-200 whitespace-nowrap">
                Settings
              </span>
            </button>
          </Link>
          <button
            onClick={() => setThresholdsOpen(true)}
            className="group flex items-center gap-0 hover:gap-1.5 text-[10px] font-mono px-2 py-1 rounded border border-border text-muted-foreground hover:text-foreground hover:bg-muted/20 transition-all duration-200"
            title="Safety Thresholds"
          >
            <SlidersHorizontal className="w-3 h-3 shrink-0" />
            <span className="overflow-hidden max-w-0 group-hover:max-w-[64px] transition-all duration-200 whitespace-nowrap">
              Thresholds
            </span>
          </button>
          <button
            onClick={() => setPidTuningOpen(true)}
            className="group flex items-center gap-0 hover:gap-1.5 text-[10px] font-mono px-2 py-1 rounded border border-border text-muted-foreground hover:text-foreground hover:bg-muted/20 transition-all duration-200"
            title="PID Tuning — adjust gains and send to ESP32"
          >
            <Wrench className="w-3 h-3 shrink-0" />
            <span className="overflow-hidden max-w-0 group-hover:max-w-[56px] transition-all duration-200 whitespace-nowrap">
              PID Tune
            </span>
          </button>
          <button
            onClick={() => setConnectOpen(true)}
            className={`flex items-center gap-1.5 text-[10px] font-semibold px-2.5 py-1 rounded border transition-colors ${
              isHardwareMode
                ? "border-chart-3 text-white bg-chart-3 hover:bg-chart-3/90"
                : "border-primary/60 text-primary hover:bg-primary/10"
            }`}
            title={
              isHardwareMode ? "Hardware connected — click to switch or view connection" : "Connect hardware device"
            }
          >
            <PlugZap className="w-3 h-3 shrink-0" />
            {isHardwareMode ? "Connected" : "Connect"}
          </button>
          <Link href="/guide">
            <button
              className="flex items-center gap-1.5 text-[10px] font-semibold px-2.5 py-1 rounded border border-border text-muted-foreground hover:text-foreground hover:bg-muted/20 transition-colors"
              title="Getting Started Guide"
            >
              <BookOpen className="w-3 h-3 shrink-0" />
              Get started
            </button>
          </Link>
          <ConnectivityChip />
          <button
            onClick={toggleTheme}
            title={
              theme === "dark"
                ? "Switch to light theme"
                : "Switch to dark theme"
            }
            className="flex items-center justify-center w-6 h-6 rounded border border-border text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-colors"
          >
            {theme === "dark" ? (
              <Sun className="w-3.5 h-3.5" />
            ) : (
              <Moon className="w-3.5 h-3.5" />
            )}
          </button>
          <div className="flex items-center gap-1.5 font-mono text-muted-foreground">
            <Clock className="w-3.5 h-3.5" />
            <span className="font-semibold text-foreground">{lusakaTime}</span>
            <span className="text-[9px] uppercase tracking-wider hidden sm:inline">
              CAT
            </span>
          </div>
        </div>
      </header>

      {/* ── Signal lost banner (hardware mode watchdog) ── */}
      {signalLostSec > 0 && !dismissedSignalLoss && (
        <div className="shrink-0 flex items-center justify-between gap-2.5 px-4 py-1.5 bg-amber-500/10 border-b border-amber-500/25 text-amber-400">
          <div className="flex items-center gap-2.5">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0 animate-pulse" />
            <span className="text-[11px] font-medium">
              Signal lost — no readings for {signalLostSec}s. Check your USB cable or Wi-Fi connection.
            </span>
          </div>
          <button
            onClick={() => setDismissedSignalLoss(true)}
            className="ml-auto shrink-0 p-0.5 hover:bg-amber-500/20 rounded transition-colors"
            aria-label="Dismiss signal lost warning"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* ── Session progress bar ── */}
      {sessionProgress > 0 && (
        <div className="h-0.5 bg-muted/30 shrink-0">
          <div
            className="h-full bg-primary transition-all duration-1000"
            style={{ width: `${sessionProgress * 100}%` }}
          />
        </div>
      )}

      {/* ── Main ── */}
      <main className="flex-1 min-h-0 p-2 overflow-auto">
        <div className="h-full flex gap-3">
          {/* ── Left: Charts ── */}
          <div className="flex-1 min-w-0 flex flex-col gap-3">
            {/* Time scale toolbar */}
            <div className="flex items-center gap-1 shrink-0">
              <span className="text-[10px] text-muted-foreground mr-1 font-mono uppercase tracking-wider">
                Scale
              </span>
              {TIME_SCALES.map((scale) => (
                <button
                  key={scale}
                  onClick={() => setTimeScale(scale)}
                  className={`px-2 py-0.5 rounded text-[10px] font-mono font-semibold transition-colors ${
                    timeScale === scale
                      ? "bg-muted text-foreground border border-border/60"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                  }`}
                >
                  {scale.toUpperCase()}
                </button>
              ))}
              {/* Session runtime — far right of the toolbar ribbon */}
              <div className="ml-auto flex items-center gap-1.5 text-[10px]">
                {sessionActive ? (
                  <>
                    <span className="w-1.5 h-1.5 rounded-full bg-chart-3 animate-pulse shrink-0" />
                    <span className="text-chart-3 tabular-nums" style={{ fontFamily: "'Orbitron', monospace", fontWeight: 900, fontSize: "13px", letterSpacing: "0.05em" }}>{elapsed}</span>
                    {motorState === "on" && (
                      <span className="text-[9px] text-chart-3/70 uppercase tracking-wider">motor on</span>
                    )}
                    {motorState === "emergency_stopped" && (
                      <span className="text-[9px] text-destructive uppercase tracking-wider">e-stop</span>
                    )}
                  </>
                ) : (
                  <span className="text-muted-foreground/40 tabular-nums" style={{ fontFamily: "'Orbitron', monospace", fontWeight: 900, fontSize: "13px", letterSpacing: "0.05em" }}>--:--:--</span>
                )}

                {/* PID auto-mode push-button — lights up green when PID is on */}
                <button
                  onClick={handlePidToggle}
                  disabled={setPidEnabled.isPending || !sessionActive}
                  title={
                    !sessionActive
                      ? "Start a session before toggling PID auto mode"
                      : pidOn
                        ? "PID auto mode ON — click to switch to manual"
                        : "PID auto mode OFF — click to enable tilt-stabilised auto mode"
                  }
                  className={`ml-1.5 flex items-center gap-1 px-2 py-1 rounded-full border text-[9px] font-mono font-bold uppercase tracking-wider transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed ${
                    pidOn
                      ? "border-chart-3 bg-chart-3/20 text-chart-3 shadow-[0_0_10px_-2px] shadow-chart-3"
                      : "border-border bg-muted/30 text-muted-foreground hover:bg-muted/50"
                  }`}
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full shrink-0 transition-all ${
                      pidOn ? "bg-chart-3 shadow-[0_0_6px_2px] shadow-chart-3 animate-pulse" : "bg-muted-foreground/50"
                    }`}
                  />
                  <Cpu className="w-3 h-3 shrink-0" />
                  PID {pidOn ? "ON" : "OFF"}
                </button>
              </div>
            </div>

            {/* Top row: RPM + Tilt — fills all remaining vertical space */}
            <div className="min-h-0 flex-1 grid grid-cols-2 gap-3 overflow-hidden">
              <SensorPanel
                label="Motor / ESC"
                online={
                  !isHardwareMode || !deviceInfo || (caps?.motor ?? false)
                }
                health={isHardwareMode ? motorHealth : undefined}
              >
                <RpmChart
                  key={`rpm-${timeScale}`}
                  history={history || []}
                  latestReading={currentReading}
                  targetRpm={session?.targetRpm}
                  timeScale={timeScale}
                />
              </SensorPanel>
              <SensorPanel
                label="IMU / Tilt"
                online={!isHardwareMode || !deviceInfo || (caps?.imu ?? false)}
                health={isHardwareMode ? imuHealth : undefined}
              >
                <TiltChart
                  key={`tilt-${timeScale}`}
                  history={history || []}
                  latestReading={currentReading}
                  timeScale={timeScale}
                  maxTiltAngle={maxTiltAngle}
                />
              </SensorPanel>
            </div>

            {/* Bottom row: Temp + Vibration + PWM — capped so it never dominates */}
            <div className="min-h-0 shrink-0 grid grid-cols-3 gap-3 h-[min(220px,28vh)] overflow-hidden">
              <SensorPanel
                label="Temperature"
                // Always show the live "temp" telemetry value, regardless of
                // whether a dedicated temperature sensor was advertised in the
                // firmware's DEVICE_INFO/capabilities handshake — the firmware
                // always reports a temp reading and the user wants it plotted
                // unconditionally rather than gated behind sensor detection.
                online={true}
                health={isHardwareMode ? tempHealth : undefined}
              >
                <TempChart
                  key={`temp-${timeScale}`}
                  history={history || []}
                  latestReading={currentReading}
                  timeScale={timeScale}
                  tempWarn={tempWarn}
                  tempCrit={tempCrit}
                />
              </SensorPanel>
              <SensorPanel
                label="Vibration"
                online={
                  !isHardwareMode || !deviceInfo || (caps?.vibration ?? false)
                }
                health={isHardwareMode ? vibrHealth : undefined}
              >
                <VibrationChart
                  key={`vib-${timeScale}`}
                  history={history || []}
                  latestReading={currentReading}
                  timeScale={timeScale}
                  vibWarn={vibWarn}
                  vibCrit={vibCrit}
                />
              </SensorPanel>
              <SensorPanel
                label="Motor PWM"
                online={
                  !isHardwareMode || !deviceInfo || (caps?.motor ?? false)
                }
                health={isHardwareMode ? motorHealth : undefined}
              >
                <PwmChart
                  key={`pwm-${timeScale}`}
                  history={history || []}
                  latestReading={currentReading}
                  timeScale={timeScale}
                />
              </SensorPanel>
            </div>
          </div>

          {/* ── Right sidebar ── */}
          <div className="w-[260px] shrink-0 flex flex-col min-h-0 gap-2">
            {/* Quick Stats + Session Control — capped so terminal always gets space */}
            <div className="overflow-y-auto flex flex-col gap-3 max-h-[44vh]">
              {/* Spacer to align Quick Stats with the chart cards below the time-scale toolbar */}
              <div className="shrink-0 h-[3px]" />
              {/* ── Live failure forecast — projects current session's trend to a failure threshold ── */}
              <LiveFailureForecast
                sessionRunning={sessionActive}
                tempWarn={tempWarn}
                tempCrit={tempCrit}
                vibWarn={vibWarn}
                vibCrit={vibCrit}
              />
              {/* ── Quick Stats ── */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between px-0.5">
                  <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest">
                    Quick Stats
                  </span>
                </div>
                <StatCards
                  reading={currentReading}
                  stats={stats ?? null}
                  targetRpm={session?.targetRpm}
                  tempWarn={tempWarn}
                  tempCrit={tempCrit}
                  vibWarn={vibWarn}
                  vibCrit={vibCrit}
                  maxTiltAngle={maxTiltAngle}
                  capabilities={caps ?? null}
                  isHardwareMode={isHardwareMode}
                />
              </div>

              {/* ── Session Control ── */}
              <SessionControl
                session={session || null}
                isHardwareConnected={isHardwareMode}
                settings={settings}
                motorState={motorState}
                latestIrCommand={latestIrCommand}
              />
            </div>

            {/* Events Terminal — grows to fill remaining sidebar space */}
          <div className="min-h-0 flex-1 flex flex-col gap-1.5">
              <div className="flex items-center justify-between px-0.5 shrink-0">
                <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest">
                  System Events
                </span>
                <span className="text-[9px] font-mono text-muted-foreground/50">
                  {alerts?.length ?? 0} alerts
                </span>
              </div>
              <div className="flex-1 min-h-0">
                <SystemTerminal
                  alerts={alerts || []}
                  latestAlert={latestAlert}
                />
              </div>
            </div>
          </div>
        </div>
      </main>

      <AlertCenter open={alertCenterOpen} onClose={() => setAlertCenterOpen(false)} />
      <ConnectDialog open={connectOpen} onOpenChange={setConnectOpen} />
      <ThresholdsDialog
        open={thresholdsOpen}
        onOpenChange={setThresholdsOpen}
      />
      <SpeedDialog open={speedOpen} onOpenChange={setSpeedOpen} latestIrCommand={latestIrCommand} />
      <PidTuningDialog open={pidTuningOpen} onOpenChange={setPidTuningOpen} />
      <MotorSweepDialog
        payload={motorSweepConfirm}
        onClose={() => setMotorSweepConfirm(null)}
      />
      <BottomNavBar
        sessionActive={sessionActive}
        onResetSession={handleResetSession}
        resetPending={resetSession.isPending}
        keyboardShortcutUses={keyboardShortcutUses}
        togglePinRef={bottomNavTogglePinRef}
      />

      {/* ESP32 discovery banner — non-modal, appears when a device is found on
          the network. User must click Connect; nothing connects automatically. */}
      <Esp32DiscoveryBanner />
    </div>
  );
}
