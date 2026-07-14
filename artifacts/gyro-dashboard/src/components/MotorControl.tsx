import React, { useState } from "react";
import { apiUrl } from "@/lib/api-url";
import { useSendMotorCommand } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { getGetSessionQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Power, Zap } from "lucide-react";
import type { Session } from "@workspace/api-client-react";

type MotorState = "on" | "off" | "emergency_stopped";

interface MotorControlProps {
  motorState?: MotorState;
  session?: Session | null;
  onTerminalMessage?: (msg: string) => void;
}

const motorStateConfig: Record<MotorState, { label: string; dotClass: string; textClass: string }> = {
  on:                { label: "Running",  dotClass: "bg-chart-3 animate-pulse",    textClass: "text-chart-3" },
  off:               { label: "Off",      dotClass: "bg-muted-foreground",          textClass: "text-muted-foreground" },
  emergency_stopped: { label: "E-Stop",   dotClass: "bg-destructive animate-pulse", textClass: "text-destructive" },
};

export function MotorControl({ motorState = "off", session }: MotorControlProps) {
  const queryClient = useQueryClient();
  const sendCommand = useSendMotorCommand();
  const [eShutdownPending, setEShutdownPending] = useState(false);

  const config = motorStateConfig[motorState] ?? motorStateConfig.off;
  const isRunning = motorState === "on";
  const isEStopped = motorState === "emergency_stopped";
  const sessionActive = session?.status === "running" || session?.status === "warning";

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: getGetSessionQueryKey() });
  }

  function handleToggle() {
    if (isRunning) {
      sendCommand.mutate({ data: { command: "off" } }, { onSuccess: invalidate });
      return;
    }
    sendCommand.mutate({ data: { command: "on" } }, { onSuccess: invalidate });
  }

  async function handleEmergencyShutdown() {
    setEShutdownPending(true);
    try {
      await fetch(apiUrl("/api/motor/command"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command: "emergency_shutdown" }),
      });
      invalidate();
    } finally {
      setEShutdownPending(false);
    }
  }

  const isBusy = sendCommand.isPending || eShutdownPending;

  return (
    <Card className="bg-card border border-border/70 shadow-sm shrink-0 rounded-lg">
      <CardHeader className="py-1.5 px-2.5 border-b border-border/70">
        <CardTitle className="text-xs flex items-center justify-between">
          <span className="font-semibold text-foreground">Motor Control</span>
          <span className={`flex items-center gap-1 text-[9px] font-mono ${config.textClass}`}>
            <span className={`w-1 h-1 rounded-full ${config.dotClass}`} />
            {config.label}
          </span>
        </CardTitle>
      </CardHeader>

      <CardContent className="p-2 flex gap-1.5">
        {/* On / Off toggle */}
        <Button
          size="sm"
          variant="outline"
          className={`flex-1 h-7 text-xs gap-1 font-semibold transition-colors ${
            isRunning
              ? "border-muted-foreground/40 text-muted-foreground hover:bg-muted/50"
              : "border-chart-3/40 text-chart-3 hover:bg-chart-3/10 hover:text-chart-3"
          } disabled:opacity-40`}
          disabled={isEStopped || isBusy || (!isRunning && !sessionActive)}
          onClick={handleToggle}
        >
          <Power className="w-3 h-3" />
          {isRunning ? "Off" : "On"}
        </Button>

        {/* Emergency Shutdown */}
        <Button
          size="sm"
          className="flex-1 h-7 text-xs gap-1 font-semibold bg-destructive/15 hover:bg-destructive text-destructive hover:text-destructive-foreground border border-destructive/40 disabled:opacity-40"
          disabled={isEStopped || isBusy || !sessionActive}
          onClick={handleEmergencyShutdown}
        >
          <Zap className="w-3 h-3" />
          E-Shutdown
        </Button>
      </CardContent>

      {isEStopped && (
        <p className="text-[9px] text-destructive text-center font-mono px-2.5 pb-1.5">
          Motor halted — start new session to resume
        </p>
      )}

      {!sessionActive && !isEStopped && (
        <p className="text-[9px] text-muted-foreground text-center font-mono px-2.5 pb-1.5">
          Start a session to enable motor
        </p>
      )}
    </Card>
  );
}
