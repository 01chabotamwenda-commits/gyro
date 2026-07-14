import React, { useEffect, useRef, useState } from "react";
import { apiUrl } from "@/lib/api-url";
import type { Session } from "@workspace/api-client-react";
import { useStopSession } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { getGetSessionQueryKey } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AlertDialog, AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Play, Square, Loader2, Timer, Zap, StopCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { getGetAlertsQueryKey } from "@workspace/api-client-react";
import type { IrCommandEvent } from "@/hooks/use-websocket";
import { logTerminalEvent } from "@/lib/terminal-bus";

function formatElapsed(startedAt: string): string {
  const ms = Date.now() - new Date(startedAt).getTime();
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m ${String(s).padStart(2, "0")}s`;
  if (m > 0) return `${m}m ${String(s).padStart(2, "0")}s`;
  return `${s}s`;
}

interface SessionControlProps {
  session: Session | null;
  isHardwareConnected: boolean;
  settings?: { targetRpm?: number; targetDurationHours?: number } | null;
  motorState?: "on" | "off" | "emergency_stopped";
  latestIrCommand?: IrCommandEvent | null;
}

export function SessionControl({ session, isHardwareConnected, settings, motorState = "off", latestIrCommand }: SessionControlProps) {
  const queryClient = useQueryClient();
  const stopSession = useStopSession();
  const { toast } = useToast();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [sessionPending, setSessionPending] = useState(false);
  const [motorPending, setMotorPending] = useState(false);
  const [elapsed, setElapsed] = useState<string | null>(null);

  const isRunning = session?.status === "running" || session?.status === "warning";
  const isError = session?.status === "error";
  const motorOn = motorState === "on";
  const motorEStopped = motorState === "emergency_stopped";

  // IR confirm-dialog selection: 0 = Cancel, 1 = Stop session
  const [confirmSelection, setConfirmSelection] = useState(0);
  const confirmOpenRef = useRef(false);
  const confirmSelectionRef = useRef(0);

  const prevIrTs = useRef<string | null>(null);
  const isRunningRef = useRef(isRunning);
  const motorOnRef = useRef(motorOn);
  const motorEStoppedRef = useRef(motorEStopped);
  const motorPendingRef = useRef(motorPending);
  const settingsRef = useRef(settings);
  const isHardwareConnectedRef = useRef(isHardwareConnected);

  useEffect(() => { confirmOpenRef.current = confirmOpen; }, [confirmOpen]);
  useEffect(() => { confirmSelectionRef.current = confirmSelection; }, [confirmSelection]);
  useEffect(() => { isRunningRef.current = isRunning; }, [isRunning]);
  useEffect(() => { motorOnRef.current = motorOn; }, [motorOn]);
  useEffect(() => { motorEStoppedRef.current = motorEStopped; }, [motorEStopped]);
  useEffect(() => { motorPendingRef.current = motorPending; }, [motorPending]);
  useEffect(() => { settingsRef.current = settings; }, [settings]);
  useEffect(() => { isHardwareConnectedRef.current = isHardwareConnected; }, [isHardwareConnected]);

  useEffect(() => {
    if (!isRunning || !session?.startedAt) {
      setElapsed(null);
      return;
    }
    const tick = () => setElapsed(formatElapsed(session.startedAt!));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [isRunning, session?.startedAt]);

  // Reset confirm selection when dialog closes
  useEffect(() => { if (!confirmOpen) setConfirmSelection(0); }, [confirmOpen]);

  // Force-close the confirm-stop dialog if the session ends while it is open,
  // so stale IR navigation commands can't execute against a dead session.
  useEffect(() => { if (!isRunning) setConfirmOpen(false); }, [isRunning]);

  async function handleStart() {
    if (sessionPending) return;
    setSessionPending(true);
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
        toast({
          title: "Could not start session",
          description: body?.error ?? `Server returned ${res.status}`,
          variant: "destructive",
        });
        return;
      }
      queryClient.invalidateQueries({ queryKey: getGetSessionQueryKey() });
      queryClient.invalidateQueries({ queryKey: getGetAlertsQueryKey() });
    } catch {
      toast({
        title: "Could not start session",
        description: "Could not reach the server. Check your connection.",
        variant: "destructive",
      });
    } finally {
      setSessionPending(false);
    }
  }

  function handleStop() {
    stopSession.mutate(undefined, {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: getGetSessionQueryKey() }),
    });
    setConfirmOpen(false);
  }

  async function handleMotorStart() {
    if (motorPendingRef.current) return;
    setMotorPending(true);
    try {
      const res = await fetch(apiUrl("/api/motor/command"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command: "on" }),
      });
      const body = await res.json().catch(() => ({})) as { message?: string };
      if (!res.ok) {
        toast({
          title: "Motor start failed",
          description: body?.message ?? `Server returned ${res.status}`,
          variant: "destructive",
        });
        return;
      }
      queryClient.invalidateQueries({ queryKey: getGetSessionQueryKey() });
      queryClient.invalidateQueries({ queryKey: getGetAlertsQueryKey() });
    } catch {
      toast({
        title: "Motor start failed",
        description: "Could not reach the server. Check your connection.",
        variant: "destructive",
      });
    } finally {
      setMotorPending(false);
    }
  }

  async function handleMotorStop() {
    if (motorPendingRef.current) return;
    setMotorPending(true);
    try {
      const res = await fetch(apiUrl("/api/motor/command"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command: "off" }),
      });
      const body = await res.json().catch(() => ({})) as { message?: string };
      if (!res.ok) {
        toast({
          title: "Motor stop failed",
          description: body?.message ?? `Server returned ${res.status}`,
          variant: "destructive",
        });
        return;
      }
      queryClient.invalidateQueries({ queryKey: getGetSessionQueryKey() });
      queryClient.invalidateQueries({ queryKey: getGetAlertsQueryKey() });
    } catch {
      toast({
        title: "Motor stop failed",
        description: "Could not reach the server.",
        variant: "destructive",
      });
    } finally {
      setMotorPending(false);
    }
  }

  // ── IR remote handling ────────────────────────────────────────────────────
  useEffect(() => {
    if (!latestIrCommand) return;
    if (prevIrTs.current === latestIrCommand.timestamp) return;
    prevIrTs.current = latestIrCommand.timestamp;

    const line = latestIrCommand.line;

    // ── Safety overrides — always active, no session required ────────────────
    if (line === "CMD:IR_STOP") {
      logTerminalEvent("warning", "[IR] STOP  →  Motor stop");
      void handleMotorStop();
      return;
    }
    if (line === "CMD:IR_EMERGENCY_STOP") {
      logTerminalEvent("critical", "[IR] 0  →  ⚠ EMERGENCY STOP");
      void (async () => {
        try {
          const res = await fetch(apiUrl("/api/motor/command"), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ command: "emergency_shutdown" }),
          });
          if (!res.ok) throw new Error();
          toast({ title: "Emergency shutdown", description: "Motor halted via IR remote.", variant: "destructive" });
        } catch {
          toast({ title: "E-stop failed", description: "Could not reach server.", variant: "destructive" });
        }
      })();
      return;
    }

    // ── CH+ — start a session via IR remote ─────────────────────────────────
    // Allowed without an active session so the operator can start the rig
    // from the remote. The server always runs its own hardware pre-flight
    // check regardless of caller — this client-side check is just an early,
    // friendlier toast, not a substitute for it.
    if (line === "CMD:IR_CH_PLUS") {
      if (isRunningRef.current) return; // session already active, ignore
      if (!isHardwareConnectedRef.current) {
        logTerminalEvent("warning", "[IR] CH+  →  No hardware — session not started");
        toast({
          title: "No hardware detected",
          description: "Connect the ESP32 before starting a session.",
          variant: "destructive",
        });
        return;
      }
      logTerminalEvent("info", "[IR] CH+  →  Starting session…");
      void (async () => {
        try {
          const s = settingsRef.current;
          const res = await fetch(apiUrl("/api/session"), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              targetRpm: s?.targetRpm ?? 8000,
              targetDurationHours: s?.targetDurationHours ?? 24,
            }),
          });
          const body = await res.json().catch(() => ({})) as { error?: string };
          if (!res.ok) {
            logTerminalEvent("warning", `[IR] CH+  →  Session start failed: ${body?.error ?? res.status}`);
            toast({ title: "Could not start session", description: body?.error ?? `Server returned ${res.status}`, variant: "destructive" });
            return;
          }
          logTerminalEvent("rx", "[IR] CH+  →  Session started");
          queryClient.invalidateQueries({ queryKey: getGetSessionQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetAlertsQueryKey() });
          toast({ title: "Session started", description: "Started via IR remote." });
        } catch {
          logTerminalEvent("warning", "[IR] CH+  →  Session start error — server unreachable");
          toast({ title: "Could not start session", description: "Could not reach the server.", variant: "destructive" });
        }
      })();
      return;
    }

    // ── Motor start (PLAY) — warn clearly if no session is active ────────────
    // The ESP32 firmware handles IR locally and may have already spun the motor.
    // Surface a clear toast so the operator knows to start a session first.
    if (line === "CMD:IR_START") {
      if (!isRunningRef.current) {
        logTerminalEvent("warning", "[IR] PLAY  →  No active session — start one first");
        toast({
          title: "No active session",
          description: "Start a session before using the remote to control the motor.",
          variant: "destructive",
        });
        return;
      }
      if (!motorOnRef.current && !motorEStoppedRef.current) {
        logTerminalEvent("info", "[IR] PLAY  →  Motor start");
        void handleMotorStart();
      }
      return;
    }

    // ── All remaining commands require an active session ──────────────────────
    if (!isRunningRef.current) return;

    // ── Confirm-stop dialog navigation ────────────────────────────────────────
    if (confirmOpenRef.current) {
      if (line === "CMD:IR_PREV" || line === "CMD:IR_NEXT") {
        const next = confirmSelectionRef.current === 0 ? 1 : 0;
        const label = next === 1 ? "Stop session" : "Cancel";
        logTerminalEvent("local", `[IR] ${line === "CMD:IR_PREV" ? "PREV" : "NEXT"}  →  dialog: ${label} selected`);
        setConfirmSelection(next);
        confirmSelectionRef.current = next;
        return;
      }
      if (line === "CMD:IR_EQ") {
        if (confirmSelectionRef.current === 1) {
          logTerminalEvent("warning", "[IR] EQ  →  Stop session confirmed");
          handleStop();
        } else {
          logTerminalEvent("local", "[IR] EQ  →  Stop session cancelled");
          setConfirmOpen(false);
        }
        return;
      }
    }

    // ── Active session commands ───────────────────────────────────────────────
    if (line === "CMD:IR_CH_MINUS") {
      logTerminalEvent("warning", "[IR] CH-  →  Stop session dialog opened");
      setConfirmOpen(true);
      return;
    }
  }, [latestIrCommand]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <Card className="bg-card border border-border/70 shadow-sm shrink-0 rounded-lg">
        <CardHeader className="py-1.5 px-2.5 border-b border-border/70 bg-muted/30">
          <CardTitle className="text-[9px] tracking-wider text-muted-foreground flex justify-between items-center">
            <span>Session Control</span>
            <div className="flex items-center gap-1.5">
              {elapsed && (
                <span className="flex items-center gap-1 text-[9px] font-mono text-chart-1">
                  <Timer className="w-2.5 h-2.5" />
                  {elapsed}
                </span>
              )}
              <span className={`text-[9px] font-bold capitalize font-mono
                ${isRunning ? "text-chart-3 animate-pulse" :
                  isError ? "text-destructive" :
                  session?.status === "completed" ? "text-chart-1" : "text-muted-foreground"}
              `}>
                {session?.status ?? "idle"}
              </span>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-2 space-y-1.5">
          {!isRunning ? (
            /* ── No active session: single "Start Session" button ── */
            <Button
              size="sm"
              className="w-full h-7 text-[10px] font-bold bg-blue-950/40 hover:bg-blue-900/50 text-blue-100 border border-blue-800/40"
              disabled={sessionPending}
              onClick={handleStart}
            >
              {sessionPending
                ? <><Loader2 className="w-3 h-3 mr-2 animate-spin" />Starting…</>
                : <><Play className="w-3 h-3 mr-2" />Start session</>}
            </Button>
          ) : (
            /* ── Session running: Motor toggle + Stop Session ── */
            <div className="flex gap-1.5">
              {/* Motor on/off toggle */}
              <Button
                size="sm"
                className={`flex-1 h-7 text-[10px] font-bold transition-colors ${
                  motorOn
                    ? "bg-destructive/10 hover:bg-destructive/80 hover:text-destructive-foreground text-destructive border border-destructive/40"
                    : "bg-green-950/40 hover:bg-green-900/50 text-green-100 border border-green-800/40"
                }`}
                disabled={motorPending}
                onClick={motorOn ? handleMotorStop : handleMotorStart}
              >
                {motorPending ? (
                  <><Loader2 className="w-3 h-3 mr-1 animate-spin" />{motorOn ? "Stopping…" : "Starting…"}</>
                ) : motorOn ? (
                  <><StopCircle className="w-3 h-3 mr-1" />Stop motor</>
                ) : (
                  <><Zap className="w-3 h-3 mr-1" />Start motor</>
                )}
              </Button>

              {/* Stop Session */}
              <Button
                size="sm"
                variant="destructive"
                className="flex-1 h-7 text-[10px] font-bold"
                disabled={stopSession.isPending}
                onClick={() => setConfirmOpen(true)}
              >
                {stopSession.isPending
                  ? <><Loader2 className="w-3 h-3 mr-1 animate-spin" />Stopping…</>
                  : <><Square className="w-3 h-3 mr-1" />Stop session</>}
              </Button>
            </div>
          )}

          {/* Motor state hint line */}
          {isRunning && (
            <p className={`text-[9px] font-mono text-center leading-tight ${
              motorEStopped ? "text-amber-400" :
              motorOn       ? "text-chart-3" :
                              "text-muted-foreground"
            }`}>
              {motorEStopped
                ? "Motor e-stopped — click Start Motor to resume"
                : motorOn
                ? "Motor running — press Stop Motor or ▶⏸ to halt"
                : "Motor off — press Start Motor or ▶⏸ to spin up"}
            </p>
          )}

        </CardContent>
      </Card>

      {/* Confirm stop — with IR navigation support */}
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent className="bg-card border-border">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-foreground">Stop session?</AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground">
              This will stop the motor and end the current session. Recorded data will be preserved.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex gap-2 sm:gap-2">
            {/* Cancel button — selection index 0 */}
            <button
              onClick={() => setConfirmOpen(false)}
              className={`flex-1 px-3 py-2 rounded-md border text-sm font-semibold transition-colors ${
                confirmSelection === 0
                  ? "border-primary ring-1 ring-primary/50 bg-muted text-foreground"
                  : "border-border text-foreground hover:bg-muted"
              }`}
            >
              Cancel
            </button>
            {/* Stop session button — selection index 1 */}
            <button
              onClick={handleStop}
              className={`flex-1 px-3 py-2 rounded-md border text-sm font-semibold transition-colors ${
                confirmSelection === 1
                  ? "border-destructive ring-1 ring-destructive/50 bg-destructive text-destructive-foreground"
                  : "border-destructive/60 bg-destructive/80 text-destructive-foreground hover:bg-destructive"
              }`}
            >
              Stop session
            </button>
          </AlertDialogFooter>
          {/* IR hint */}
          <p className="text-[9px] text-center font-mono text-muted-foreground/40 -mt-1 pb-0.5">
            PREV/NEXT to move · EQ to confirm
          </p>
        </AlertDialogContent>
      </AlertDialog>

    </>
  );
}
