import React from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { AlertTriangle } from "lucide-react";
import { format } from "date-fns";
import { useAlertContext, isHardwareDisconnectAlert } from "@/contexts/alert-context";
import type { AlertLevel } from "@/contexts/alert-context";

const LEVEL_COLOR: Record<string, string> = {
  critical: "text-destructive",
  error:    "text-orange-400",
  warning:  "text-amber-400",
  info:     "text-blue-400",
};

const BORDER_COLOR: Record<string, string> = {
  critical: "border-destructive/60",
  error:    "border-orange-400/60",
  warning:  "border-amber-400/60",
  info:     "border-blue-400/60",
};

export function AlertCriticalDialog() {
  const { activeAlerts, behavior, acknowledge } = useAlertContext();

  // Only show alerts whose configured delivery is "dialog"
  const dialogAlerts = activeAlerts.filter((a) => {
    const lvl = (a.alert.level as AlertLevel) || "info";
    const cfg = behavior[lvl] ?? behavior.info;
    return cfg.delivery === "dialog";
  });

  const current = dialogAlerts[0];
  if (!current) return null;

  const level = (current.alert.level as AlertLevel) || "info";
  const textColor = LEVEL_COLOR[level] ?? "text-destructive";
  const borderColor = BORDER_COLOR[level] ?? "border-destructive/60";
  const remaining = dialogAlerts.length - 1;
  // Hardware-disconnect dialogs are plain and low-key: a short message and
  // an OK button, no "requires acknowledgement" framing or alarm styling.
  const isDisconnect = isHardwareDisconnectAlert(current.alert);

  return (
    <AlertDialog open>
      <AlertDialogContent className={`${borderColor} bg-card max-w-md`}>
        <AlertDialogHeader>
          <AlertDialogTitle
            className={`flex items-center gap-2 ${textColor} uppercase tracking-wide text-sm font-mono`}
          >
            <AlertTriangle className="w-4 h-4 shrink-0" />
            {isDisconnect ? "Hardware disconnected" : `${level} Alert`}
            {remaining > 0 && (
              <span className="ml-auto text-[10px] font-mono text-muted-foreground normal-case tracking-normal">
                +{remaining} more pending
              </span>
            )}
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3 pt-1">
              <p className="font-mono text-sm text-foreground leading-relaxed">
                {current.alert.message}
              </p>
              <p className="text-[11px] text-muted-foreground font-mono">
                {format(new Date(current.alert.timestamp), "HH:mm:ss · yyyy-MM-dd")}
              </p>
              {!isDisconnect && (
                <div className={`text-[11px] font-mono px-3 py-2 rounded bg-muted/30 border ${borderColor} ${textColor}`}>
                  This alert requires acknowledgement before it can be dismissed.
                </div>
              )}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogAction
            className={
              isDisconnect
                ? "font-mono"
                : "bg-destructive hover:bg-destructive/90 text-destructive-foreground font-bold font-mono tracking-wide"
            }
            onClick={() => acknowledge(current.alert.id)}
          >
            {isDisconnect ? "OK" : "Got it"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
