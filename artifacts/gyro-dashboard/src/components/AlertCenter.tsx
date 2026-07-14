import React, { useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Bell, BellOff, CheckCheck, Trash2, X } from "lucide-react";
import { format } from "date-fns";
import { useAlertContext } from "@/contexts/alert-context";
import type { AlertLevel } from "@/contexts/alert-context";
import type { Alert } from "@workspace/api-client-react";

// ── Styling maps ──────────────────────────────────────────────────────────────

const LEVEL_DOT: Record<string, string> = {
  emergency: "bg-red-500",
  critical:  "bg-destructive",
  error:     "bg-orange-500",
  warning:   "bg-amber-400",
  info:      "bg-blue-400",
};

const LEVEL_BADGE: Record<string, string> = {
  emergency: "bg-red-600 text-white border-red-500",
  critical:  "bg-destructive/20 text-destructive border-destructive/40",
  error:     "bg-orange-500/20 text-orange-400 border-orange-400/40",
  warning:   "bg-amber-400/20 text-amber-400 border-amber-400/40",
  info:      "bg-blue-400/20 text-blue-400 border-blue-400/40",
};

type FilterLevel = AlertLevel | "all";

// ── AlertRow ──────────────────────────────────────────────────────────────────

function AlertRow({
  alert,
  onDismiss,
}: {
  alert: Alert;
  onDismiss?: () => void;
}) {
  const dot = LEVEL_DOT[alert.level] ?? "bg-muted-foreground";
  const badge = LEVEL_BADGE[alert.level] ?? "bg-muted text-muted-foreground border-border";
  return (
    <div className="px-4 py-3 hover:bg-muted/20 transition-colors">
      <div className="flex items-start gap-3">
        <div className={`w-2 h-2 rounded-full shrink-0 mt-1.5 ${dot}`} />
        <div className="flex-1 min-w-0 space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className={`text-[10px] font-bold px-1.5 py-0.5 rounded border capitalize font-mono ${badge}`}
            >
              {alert.level}
            </span>
            <span className="text-[10px] font-mono text-muted-foreground">
              {format(new Date(alert.timestamp), "HH:mm:ss")}
            </span>
            <span className="text-[10px] font-mono text-muted-foreground hidden sm:block">
              {format(new Date(alert.timestamp), "yyyy-MM-dd")}
            </span>
          </div>
          <p className="text-xs font-mono text-foreground leading-relaxed">
            {alert.message}
          </p>
        </div>
        {onDismiss && (
          <button
            onClick={onDismiss}
            className="shrink-0 p-0.5 text-muted-foreground hover:text-foreground transition-colors rounded"
            title="Dismiss"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}

// ── AlertCenter panel ─────────────────────────────────────────────────────────

interface AlertCenterProps {
  open: boolean;
  onClose: () => void;
}

export function AlertCenter({ open, onClose }: AlertCenterProps) {
  const { history, activeAlerts, acknowledge, acknowledgeAll, clearHistory, clearAll } =
    useAlertContext();
  const [filter, setFilter] = useState<FilterLevel>("all");
  const [tab, setTab] = useState<"active" | "history">("active");

  const sourceList =
    tab === "active" ? activeAlerts.map((a) => a.alert) : history.map((h) => h.alert);

  const filtered =
    filter === "all"
      ? sourceList
      : sourceList.filter((a) => a.level === filter);

  const levels: FilterLevel[] = [
    "all",
    "emergency",
    "critical",
    "error",
    "warning",
    "info",
  ];

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-md bg-card border-l border-border flex flex-col p-0 gap-0"
      >
        {/* Header */}
        <SheetHeader className="pl-4 pr-10 py-3 border-b border-border shrink-0 space-y-0">
          <div className="flex items-center justify-between">
            <SheetTitle className="text-sm font-bold flex items-center gap-2">
              <Bell className="w-4 h-4" />
              Alert Center
              {activeAlerts.length > 0 && (
                <span className="bg-destructive text-destructive-foreground text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none">
                  {activeAlerts.length}
                </span>
              )}
            </SheetTitle>
            <div className="flex items-center gap-1">
              {tab === "active" && activeAlerts.length > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={acknowledgeAll}
                  title="Mark all as read"
                  className="text-[10px] h-6 px-2 text-muted-foreground hover:text-foreground"
                >
                  <CheckCheck className="w-3 h-3 mr-1" />
                  Mark all read
                </Button>
              )}
              {(activeAlerts.length > 0 || history.length > 0) && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={clearAll}
                  title="Clear notifications"
                  className="text-[10px] h-6 px-2 text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="w-3 h-3" />
                </Button>
              )}
              {tab === "history" && history.length > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={clearHistory}
                  className="text-[10px] h-6 px-2 text-muted-foreground hover:text-foreground"
                >
                  Clear history
                </Button>
              )}
            </div>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 mt-3">
            {(["active", "history"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`text-[11px] font-semibold px-3 py-1 rounded transition-colors capitalize ${
                  tab === t
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/30"
                }`}
              >
                {t}
                {t === "active" && activeAlerts.length > 0 && (
                  <span className="ml-1.5 bg-destructive text-destructive-foreground rounded-full text-[9px] px-1 py-0.5 leading-none">
                    {activeAlerts.length}
                  </span>
                )}
                {t === "history" && history.length > 0 && (
                  <span className="ml-1.5 text-[9px] text-muted-foreground font-mono">
                    ({history.length})
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Level filter */}
          <div className="flex flex-wrap gap-1 mt-2">
            {levels.map((lvl) => (
              <button
                key={lvl}
                onClick={() => setFilter(lvl)}
                className={`text-[10px] font-mono px-2 py-0.5 rounded border transition-colors capitalize ${
                  filter === lvl
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:border-muted-foreground"
                }`}
              >
                {lvl}
              </button>
            ))}
          </div>
        </SheetHeader>

        {/* List */}
        <div className="flex-1 overflow-y-auto min-h-0">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 gap-2 text-muted-foreground">
              <BellOff className="w-6 h-6 opacity-40" />
              <p className="text-xs">No alerts</p>
            </div>
          ) : (
            <div className="divide-y divide-border/60">
              {filtered.map((alert) => (
                <AlertRow
                  key={alert.id}
                  alert={alert}
                  onDismiss={
                    tab === "active"
                      ? () => acknowledge(alert.id)
                      : undefined
                  }
                />
              ))}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ── Bell button (used in dashboard header) ────────────────────────────────────

export function AlertBellButton({ onClick }: { onClick: () => void }) {
  const { notifiedCount, activeAlerts } = useAlertContext();
  const hasActive = activeAlerts.length > 0;
  const badge = notifiedCount;

  return (
    <button
      onClick={onClick}
      className="relative group flex items-center gap-0 hover:gap-1.5 text-[10px] font-mono px-2 py-1 rounded border border-border text-muted-foreground hover:text-foreground hover:bg-muted/20 transition-all duration-200"
      title="Alert center"
    >
      <Bell
        className={`w-3 h-3 shrink-0 transition-colors ${
          hasActive ? "text-destructive" : ""
        }`}
      />
      <span className="overflow-hidden max-w-0 group-hover:max-w-[40px] transition-all duration-200 whitespace-nowrap">
        Alerts
      </span>
      {badge > 0 && (
        <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 bg-destructive text-destructive-foreground text-[9px] font-bold rounded-full flex items-center justify-center px-0.5 leading-none">
          {badge > 99 ? "99+" : badge}
        </span>
      )}
    </button>
  );
}
