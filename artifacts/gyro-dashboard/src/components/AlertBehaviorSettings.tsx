import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Bell } from "lucide-react";
import {
  useAlertContext,
  DEFAULT_ALERT_BEHAVIOR,
} from "@/contexts/alert-context";
import type { AlertLevel, AlertDelivery, AlertBehaviorConfig, AlertLevelBehavior } from "@/contexts/alert-context";

// ── Config ────────────────────────────────────────────────────────────────────

const LEVELS: AlertLevel[] = ["info", "warning", "error", "critical", "emergency"];

const LEVEL_META: Record<AlertLevel, { label: string; color: string; desc: string }> = {
  info:      { label: "Info",      color: "text-blue-400",      desc: "Routine status messages and low-priority events" },
  warning:   { label: "Warning",   color: "text-amber-400",     desc: "Abnormal conditions that need attention soon" },
  error:     { label: "Error",     color: "text-orange-400",    desc: "Failures requiring prompt operator response" },
  critical:  { label: "Critical",  color: "text-destructive",   desc: "Serious faults; may trigger safety actions" },
  emergency: { label: "Emergency", color: "text-red-500",       desc: "Immediate danger — requires instant response" },
};

const DELIVERY_OPTIONS: { value: AlertDelivery; label: string; desc: string }[] = [
  { value: "log",        label: "Log only",        desc: "Silent — recorded in history only" },
  { value: "toast",      label: "Toast banner",     desc: "Slide-in notification, optionally auto-dismissed" },
  { value: "dialog",     label: "Modal dialog",     desc: "Blocking dialog — must click Acknowledge" },
  { value: "fullscreen", label: "Full-screen",      desc: "Full-screen takeover with alarm animation" },
];

// ── Component ─────────────────────────────────────────────────────────────────

export function AlertBehaviorSettings() {
  const { behavior, setBehavior } = useAlertContext();

  function update(
    level: AlertLevel,
    key: keyof AlertLevelBehavior,
    value: AlertDelivery | number | null | boolean,
  ) {
    setBehavior({
      ...behavior,
      [level]: {
        ...behavior[level],
        [key]: value,
      },
    });
  }

  function handleReset() {
    setBehavior(DEFAULT_ALERT_BEHAVIOR);
  }

  return (
    <Card className="bg-card border-border">
      <CardHeader className="py-3 px-4 border-b border-border/60">
        <CardTitle className="text-sm font-bold flex items-center gap-2">
          <Bell className="w-4 h-4 text-primary" />
          Alert &amp; Notification Behaviour
        </CardTitle>
        <p className="text-[11px] text-muted-foreground mt-1">
          Configure how each severity level is surfaced. Changes take effect immediately and are saved to this browser.
        </p>
      </CardHeader>
      <CardContent className="p-4 space-y-1">

        {/* Column headers */}
        <div className="grid grid-cols-[110px_1fr_110px_60px_60px] gap-3 pb-2 border-b border-border/40">
          <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Level</span>
          <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Delivery</span>
          <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Auto-dismiss</span>
          <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider text-center">Sound</span>
          <span></span>
        </div>

        {LEVELS.map((level) => {
          const meta = LEVEL_META[level];
          const cfg = behavior[level];

          return (
            <div
              key={level}
              className="grid grid-cols-[110px_1fr_110px_60px_60px] gap-3 items-center py-2.5 border-b border-border/20 last:border-0"
            >
              {/* Level name */}
              <div>
                <span className={`text-xs font-bold font-mono ${meta.color}`}>
                  {meta.label}
                </span>
                <p className="text-[9px] text-muted-foreground leading-tight mt-0.5 hidden lg:block">
                  {meta.desc}
                </p>
              </div>

              {/* Delivery select */}
              <select
                value={cfg.delivery}
                onChange={(e) =>
                  update(level, "delivery", e.target.value as AlertDelivery)
                }
                className="h-7 text-[11px] font-mono bg-background border border-border rounded px-2 text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              >
                {DELIVERY_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>

              {/* Auto-dismiss */}
              {cfg.delivery === "toast" ? (
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    min={0}
                    step={500}
                    value={cfg.autoDismissMs ?? 0}
                    onChange={(e) => {
                      const v = parseInt(e.target.value, 10);
                      update(level, "autoDismissMs", isNaN(v) || v <= 0 ? null : v);
                    }}
                    className="h-7 w-16 text-[11px] font-mono bg-background border border-border rounded px-2 text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                    placeholder="ms"
                  />
                  <span className="text-[10px] text-muted-foreground">ms</span>
                </div>
              ) : (
                <span className="text-[10px] text-muted-foreground font-mono pl-1">—</span>
              )}

              {/* Sound toggle */}
              <div className="flex justify-center">
                <button
                  onClick={() => update(level, "sound", !cfg.sound)}
                  className={`w-9 h-5 rounded-full transition-colors relative ${
                    cfg.sound ? "bg-primary" : "bg-muted"
                  }`}
                  title={cfg.sound ? "Sound on" : "Sound off"}
                >
                  <div
                    className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform shadow-sm ${
                      cfg.sound ? "translate-x-4" : "translate-x-0.5"
                    }`}
                  />
                </button>
              </div>

              {/* Reset to default */}
              <div className="flex justify-center">
                <button
                  onClick={() =>
                    setBehavior({
                      ...behavior,
                      [level]: DEFAULT_ALERT_BEHAVIOR[level],
                    })
                  }
                  className="text-[10px] text-muted-foreground hover:text-foreground transition-colors font-mono"
                  title="Reset to default"
                >
                  ↺
                </button>
              </div>
            </div>
          );
        })}

        {/* Global reset */}
        <div className="flex justify-end pt-3 border-t border-border/40 mt-2">
          <button
            onClick={handleReset}
            className="text-[11px] font-mono text-muted-foreground hover:text-foreground border border-border hover:border-muted-foreground px-3 py-1.5 rounded transition-colors"
          >
            Reset all to defaults
          </button>
        </div>
      </CardContent>
    </Card>
  );
}
