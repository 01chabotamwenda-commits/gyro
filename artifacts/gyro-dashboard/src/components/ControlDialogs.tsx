import React, { useEffect, useRef, useState } from "react";
import { apiUrl } from "@/lib/api-url";
import type { IrCommandEvent } from "@/hooks/use-websocket";
import { SlidersHorizontal, Radio, Gauge, ShieldOff, ShieldAlert, Wrench } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  useUpdateSettings, useGetSettings, getGetSettingsQueryKey,
  useSetMotorSetpoint, useGetLatestReading, getGetLatestReadingQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { logTerminalEvent } from "@/lib/terminal-bus";

/* ── Shared field ──────────────────────────────────────────────────────────── */

function Field({
  label, value, onChange, disabled,
}: {
  label: string; value: string; onChange: (v: string) => void; disabled?: boolean;
}) {
  return (
    <div className="space-y-1">
      <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </label>
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="w-full bg-background border border-border rounded-md px-3 py-1.5 text-sm font-mono text-foreground disabled:opacity-40 focus:outline-none focus:ring-1 focus:ring-primary/50"
      />
    </div>
  );
}

/* ── Thresholds Dialog ─────────────────────────────────────────────────────── */

interface ThresholdsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function EnforceToggle({
  label,
  enforce,
  onChange,
}: {
  label: string;
  enforce: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between py-1">
      <div className="flex items-center gap-1.5">
        {enforce
          ? <ShieldAlert className="w-3 h-3 text-destructive shrink-0" />
          : <ShieldOff   className="w-3 h-3 text-muted-foreground shrink-0" />}
        <span className="text-[10px] text-muted-foreground">{label}</span>
      </div>
      <button
        type="button"
        onClick={() => onChange(!enforce)}
        className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none ${
          enforce ? "bg-destructive" : "bg-muted"
        }`}
        title={enforce ? "E-stop ON — click to disable" : "E-stop OFF — click to enable"}
      >
        <span
          className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow-sm transform transition-transform ${
            enforce ? "translate-x-4" : "translate-x-0"
          }`}
        />
      </button>
    </div>
  );
}

export function ThresholdsDialog({ open, onOpenChange }: ThresholdsDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const updateSettings = useUpdateSettings();
  const { data: settings } = useGetSettings({ query: { queryKey: getGetSettingsQueryKey() } });

  const [tempWarn,       setTempWarn]       = useState(String(settings?.tempWarnThreshold ?? 55));
  const [tempCrit,       setTempCrit]       = useState(String(settings?.tempCritThreshold ?? 65));
  const [vibWarn,        setVibWarn]        = useState(String(settings?.vibWarnThreshold  ?? 4.5));
  const [vibCrit,        setVibCrit]        = useState(String(settings?.vibCritThreshold  ?? 7.1));
  const [maxTilt,        setMaxTilt]        = useState(String(settings?.maxTiltAngle      ?? 45));
  const [enforceTilt,    setEnforceTilt]    = useState(settings?.enforceTilt    ?? true);
  const [enforceTempCrit,setEnforceTempCrit]= useState(settings?.enforceTempCrit ?? true);
  const [enforceVibCrit, setEnforceVibCrit] = useState(settings?.enforceVibCrit  ?? true);

  // Re-sync from server whenever the dialog opens (not just when settings
  // load) so a stale draft toggle from a previous open — e.g. one flipped
  // but never saved — doesn't reappear "on" the next time the dialog opens.
  // Matches the fix already applied to PidTuningDialog below.
  useEffect(() => {
    if (!settings) return;
    setTempWarn(String(settings.tempWarnThreshold ?? 55));
    setTempCrit(String(settings.tempCritThreshold ?? 65));
    setVibWarn(String(settings.vibWarnThreshold ?? 4.5));
    setVibCrit(String(settings.vibCritThreshold ?? 7.1));
    setMaxTilt(String(settings.maxTiltAngle ?? 45));
    setEnforceTilt(settings.enforceTilt ?? true);
    setEnforceTempCrit(settings.enforceTempCrit ?? true);
    setEnforceVibCrit(settings.enforceVibCrit ?? true);
  }, [settings, open]); // eslint-disable-line react-hooks/exhaustive-deps

  function handleSave() {
    updateSettings.mutate({
      data: {
        tempWarnThreshold: Number(tempWarn),
        tempCritThreshold: Number(tempCrit),
        vibWarnThreshold:  Number(vibWarn),
        vibCritThreshold:  Number(vibCrit),
        maxTiltAngle:      Number(maxTilt),
        enforceTilt,
        enforceTempCrit,
        enforceVibCrit,
      },
    }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetSettingsQueryKey() });
        toast({ title: "Thresholds saved", description: "Safety limits updated." });
        onOpenChange(false);
      },
      onError: () => toast({ title: "Save failed", variant: "destructive" }),
    });
  }

  const anyDisabled = !enforceTilt || !enforceTempCrit || !enforceVibCrit;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm bg-card border-border shadow-2xl p-0 gap-0">
        <DialogHeader className="px-5 py-4 border-b border-border">
          <DialogTitle className="flex items-center gap-2 text-sm font-bold">
            <SlidersHorizontal className="w-4 h-4 text-primary" />
            Safety Thresholds
          </DialogTitle>
          <p className="text-[10px] text-muted-foreground mt-0.5">
            Set limits and choose which ones trigger an emergency stop.
          </p>
        </DialogHeader>

        <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">

          {/* Monitor-only banner */}
          {anyDisabled && (
            <div className="flex items-start gap-2 rounded border border-amber-500/30 bg-amber-500/5 px-3 py-2">
              <ShieldOff className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
              <p className="text-[10px] text-amber-400 leading-relaxed">
                One or more constraints are set to <strong>Monitor only</strong> — thresholds will fire alerts but won't stop the motor. Enable E-stop when you're done calibrating.
              </p>
            </div>
          )}

          {/* Temperature */}
          <div className="space-y-2.5">
            <p className="text-[10px] font-bold text-amber-500 uppercase tracking-wider">Temperature</p>
            <Field label="Warn threshold (°C)" value={tempWarn} onChange={setTempWarn} />
            <Field label="Critical threshold (°C)" value={tempCrit} onChange={setTempCrit} />
            <EnforceToggle
              label={enforceTempCrit ? "E-stop on critical — click to disable" : "Monitor only — click to enable e-stop"}
              enforce={enforceTempCrit}
              onChange={setEnforceTempCrit}
            />
          </div>

          <div className="border-t border-border/40" />

          {/* Vibration */}
          <div className="space-y-2.5">
            <p className="text-[10px] font-bold text-orange-500 uppercase tracking-wider">Vibration</p>
            <Field label="Warn threshold (mm/s)" value={vibWarn} onChange={setVibWarn} />
            <Field label="Critical threshold (mm/s)" value={vibCrit} onChange={setVibCrit} />
            <EnforceToggle
              label={enforceVibCrit ? "E-stop on critical — click to disable" : "Monitor only — click to enable e-stop"}
              enforce={enforceVibCrit}
              onChange={setEnforceVibCrit}
            />
          </div>

          <div className="border-t border-border/40" />

          {/* Tilt */}
          <div className="space-y-2.5">
            <p className="text-[10px] font-bold text-violet-500 uppercase tracking-wider">Tilt</p>
            <Field label="Max tilt angle (°)" value={maxTilt} onChange={setMaxTilt} />
            <EnforceToggle
              label={enforceTilt ? "E-stop on breach — click to disable" : "Monitor only — click to enable e-stop"}
              enforce={enforceTilt}
              onChange={setEnforceTilt}
            />
          </div>

          <button
            onClick={handleSave}
            disabled={updateSettings.isPending}
            className="w-full py-2 rounded-md bg-primary/10 border border-primary/40 text-primary text-sm font-semibold hover:bg-primary/20 disabled:opacity-50 transition-colors"
          >
            {updateSettings.isPending ? "Saving…" : "Apply Thresholds"}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ── Speed / Idle Pulse Dialog ─────────────────────────────────────────────── */

const PULSE_MIN = 1200;
const PULSE_MAX = 1800;

interface SpeedDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  latestIrCommand?: IrCommandEvent | null;
}

export function SpeedDialog({ open, onOpenChange, latestIrCommand }: SpeedDialogProps) {
  const { toast } = useToast();
  const [typed, setTyped] = useState("");
  const [sending, setSending] = useState(false);

  const typedRef = useRef("");
  const latestIrRef = useRef(latestIrCommand);
  const prevIrTs = useRef<string | null>(null);

  useEffect(() => { typedRef.current = typed; }, [typed]);
  useEffect(() => { latestIrRef.current = latestIrCommand; }, [latestIrCommand]);

  // Reset display and consume the IR timestamp that opened the dialog so the
  // IR effect below doesn't re-process the same CMD:IR_PID_TUNING event and
  // immediately close the dialog again (same fix as the old TuningDialog Bug 1).
  useEffect(() => {
    if (open) {
      setTyped("");
      typedRef.current = "";
      prevIrTs.current = latestIrRef.current?.timestamp ?? null;
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  async function submit(val: string) {
    const n = parseInt(val, 10);
    if (isNaN(n) || n < PULSE_MIN || n > PULSE_MAX) {
      toast({
        title: "Out of range",
        description: `Enter a value between ${PULSE_MIN} and ${PULSE_MAX} µs`,
        variant: "destructive",
      });
      return;
    }
    setSending(true);
    try {
      const res = await fetch(apiUrl("/api/motor/pulse"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pulse: n }),
      });
      const body = await res.json().catch(() => ({})) as { message?: string };
      if (!res.ok) throw new Error(body.message ?? `Server returned ${res.status}`);
      toast({ title: "Speed set", description: `Idle pulse → ${n} µs` });
      onOpenChange(false);
    } catch (err) {
      toast({
        title: "Failed to set speed",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setSending(false);
    }
  }

  // IR remote handler — digits 1–9 build the number, EQ applies.
  // NOTE: CMD:IR_PID_TUNING (CH) is intentionally NOT handled here.
  // dashboard.tsx is the single owner of the toggle — handling it here too
  // would create a Bug-2-style double-setter conflict (both effects firing on
  // the same event in the same React batch, one opening and one closing).
  useEffect(() => {
    if (!open || !latestIrCommand) return;
    if (prevIrTs.current === latestIrCommand.timestamp) return;
    prevIrTs.current = latestIrCommand.timestamp;

    const line = latestIrCommand.line;

    // Digits 1–9 (0 is wired to E-STOP on firmware; use on-screen 0 button instead)
    const numMatch = line.match(/^CMD:IR_NUM_([1-9])$/);
    if (numMatch) {
      appendDigit(numMatch[1]);
      const afterDigit = typedRef.current + numMatch[1];
      logTerminalEvent("local", `[IR] NUM:${numMatch[1]}  →  input: "${afterDigit.padEnd(4, "_")}"`);
      return;
    }

    if (line === "CMD:IR_BACKSPACE") {
      setTyped(prev => {
        const next = prev.length > 0 ? prev.slice(0, -1) : "";
        typedRef.current = next;
        logTerminalEvent("local", `[IR] 100+  →  backspace: "${next.padEnd(4, "_")}"`);
        return next;
      });
      return;
    }

    if (line === "CMD:IR_EQ") {
      logTerminalEvent("info", `[IR] EQ  →  Applying ${typedRef.current} µs`);
      void submit(typedRef.current);
      return;
    }
  }, [latestIrCommand, open]); // eslint-disable-line react-hooks/exhaustive-deps

  function appendDigit(d: string) {
    setTyped(prev => {
      if (prev.length >= 4) return prev;
      const next = prev + d;
      typedRef.current = next;
      return next;
    });
  }

  const pulse = parseInt(typed, 10);
  const inRange = !isNaN(pulse) && pulse >= PULSE_MIN && pulse <= PULSE_MAX;
  const overMax = !isNaN(pulse) && pulse > PULSE_MAX;
  const underMin = !isNaN(pulse) && typed.length === 4 && pulse < PULSE_MIN;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xs bg-card border-border shadow-2xl p-0 gap-0">
        <DialogHeader className="px-5 py-4 border-b border-border">
          <DialogTitle className="flex items-center gap-2 text-sm font-bold">
            <Gauge className="w-4 h-4 text-primary" />
            Set Idle Speed
          </DialogTitle>
          <p className="text-[10px] text-muted-foreground mt-0.5">
            ESC pulse width — type with the remote (1–9) or keyboard. Use the 0 button for zero digits.
          </p>
        </DialogHeader>

        <div className="p-5 space-y-4">
          {/* Value display */}
          <div className={`rounded-lg border px-4 py-4 text-center transition-colors ${
            inRange         ? "border-primary/50 bg-primary/5" :
            overMax || underMin ? "border-destructive/50 bg-destructive/5" :
            "border-border bg-muted/20"
          }`}>
            <div className={`font-mono font-bold text-3xl tracking-[0.2em] ${
              inRange         ? "text-primary" :
              overMax || underMin ? "text-destructive" :
              typed.length > 0    ? "text-foreground" : "text-muted-foreground/30"
            }`}>
              {typed.padEnd(4, "_").split("").join(" ")}
            </div>
            <div className="mt-1 text-xs text-muted-foreground">µs</div>
            {typed.length > 0 && (
              <div className="mt-1.5 text-[10px]">
                {inRange    ? <span className="text-primary/80">✓ in range — press EQ or Apply</span> :
                 overMax    ? <span className="text-destructive/80">✗ max is {PULSE_MAX}</span> :
                 underMin   ? <span className="text-destructive/80">✗ min is {PULSE_MIN}</span> :
                              <span className="text-muted-foreground/50">keep typing…</span>}
              </div>
            )}
          </div>

          {/* Range bar */}
          <div className="flex justify-between text-[9px] font-mono text-muted-foreground/50 px-0.5">
            <span>{PULSE_MIN} min</span>
            <span>1500 mid</span>
            <span>{PULSE_MAX} max</span>
          </div>

          {/* Quick-enter row: 0 button (remote can't send 0) + backspace */}
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => appendDigit("0")}
              disabled={typed.length >= 4}
              className="py-2 rounded-md border border-border text-sm font-mono font-bold text-muted-foreground hover:text-foreground hover:bg-muted/40 disabled:opacity-30 transition-colors"
              title="Insert 0 (remote 0 key is wired to E-STOP)"
            >
              0
            </button>
            <button
              onClick={() => setTyped(prev => prev.length > 0 ? prev.slice(0, -1) : "")}
              disabled={typed.length === 0}
              className="py-2 rounded-md border border-border text-xs text-muted-foreground hover:text-foreground hover:bg-muted/40 disabled:opacity-30 transition-colors"
            >
              ← Backspace (100+)
            </button>
          </div>

          {/* Apply button */}
          <button
            onClick={() => void submit(typed)}
            disabled={!inRange || sending}
            className="w-full py-2 rounded-md bg-primary/10 border border-primary/40 text-primary text-sm font-semibold hover:bg-primary/20 disabled:opacity-40 transition-colors"
          >
            {sending ? "Sending…" : "Apply  (EQ)"}
          </button>

          {/* IR cheat-sheet */}
          <div className="border-t border-border/40 pt-2 text-[9px] text-muted-foreground/60 leading-relaxed">
            <span className="text-foreground/50">1–9</span> — remote digit &nbsp;·&nbsp;
            <span className="text-foreground/50">0</span> — button above &nbsp;·&nbsp;
            <span className="text-foreground/50">100+</span> — backspace &nbsp;·&nbsp;
            <span className="text-foreground/50">EQ</span> — apply &nbsp;·&nbsp;
            <span className="text-foreground/50">CH</span> — close
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ── PID Tuning Dialog ──────────────────────────────────────────────────────── */

interface PidTuningDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function PidSliderField({
  label, value, onChange, min, max, step, unit, hint,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step: number;
  unit?: string;
  hint?: string;
}) {
  const [raw, setRaw] = useState(String(value));

  useEffect(() => { setRaw(String(value)); }, [value]);

  function commitRaw() {
    const n = parseFloat(raw);
    if (!isNaN(n)) {
      const clamped = Math.max(min, Math.min(max, n));
      onChange(clamped);
      setRaw(String(clamped));
    } else {
      setRaw(String(value));
    }
  }

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2">
        <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground shrink-0">
          {label}
        </label>
        <div className="flex items-center gap-1">
          <input
            type="number"
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            onBlur={commitRaw}
            min={min}
            max={max}
            step={step}
            className="w-20 bg-background border border-border rounded px-2 py-0.5 text-xs font-mono text-foreground text-right focus:outline-none focus:ring-1 focus:ring-primary/50"
          />
          {unit && (
            <span className="text-[10px] text-muted-foreground/60 font-mono w-5 shrink-0">{unit}</span>
          )}
        </div>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => {
          const n = parseFloat(e.target.value);
          onChange(n);
          setRaw(String(n));
        }}
        className="w-full accent-primary h-1.5 cursor-pointer"
      />
      <div className="flex justify-between text-[9px] font-mono text-muted-foreground/40">
        <span>{min}</span>
        {hint && <span className="text-primary/50 italic">{hint}</span>}
        <span>{max}</span>
      </div>
    </div>
  );
}

export function PidTuningDialog({ open, onOpenChange }: PidTuningDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const updateSettings = useUpdateSettings();
  const { data: settings } = useGetSettings({ query: { queryKey: getGetSettingsQueryKey() } });

  const [kp,           setKp]           = useState(settings?.pidKp           ?? 30);
  const [ki,           setKi]           = useState(settings?.pidKi           ?? 1.5);
  const [kd,           setKd]           = useState(settings?.pidKd           ?? 3.0);
  const [setpointDeg,  setSetpointDeg]  = useState(settings?.pidSetpointDeg  ?? 0);
  const [deadbandDeg,  setDeadbandDeg]  = useState(settings?.pidDeadbandDeg  ?? 0.5);
  const [integralMax,  setIntegralMax]  = useState(settings?.pidIntegralMax  ?? 250);
  const [baseThrottle, setBaseThrottle] = useState(settings?.pidBaseThrottle ?? 1100);

  // Sync from server whenever the dialog opens or settings load
  useEffect(() => {
    if (!settings) return;
    setKp(settings.pidKp           ?? 30);
    setKi(settings.pidKi           ?? 1.5);
    setKd(settings.pidKd           ?? 3.0);
    setSetpointDeg(settings.pidSetpointDeg  ?? 0);
    setDeadbandDeg(settings.pidDeadbandDeg  ?? 0.5);
    setIntegralMax(settings.pidIntegralMax  ?? 250);
    setBaseThrottle(settings.pidBaseThrottle ?? 1100);
  }, [settings, open]); // re-sync on open so stale drafts are discarded

  function handleApply() {
    updateSettings.mutate(
      {
        data: {
          pidKp: kp,
          pidKi: ki,
          pidKd: kd,
          pidSetpointDeg: setpointDeg,
          pidDeadbandDeg: deadbandDeg,
          pidIntegralMax: integralMax,
          pidBaseThrottle: Math.round(baseThrottle),
        },
      },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetSettingsQueryKey() });
          toast({
            title: "PID constants sent",
            description: "All parameters forwarded to the ESP32.",
          });
        },
        onError: () =>
          toast({ title: "Send failed", description: "Could not reach server.", variant: "destructive" }),
      },
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm bg-card border-border shadow-2xl p-0 gap-0">
        <DialogHeader className="px-5 py-4 border-b border-border">
          <DialogTitle className="flex items-center gap-2 text-sm font-bold">
            <Wrench className="w-4 h-4 text-primary" />
            PID Tuning
          </DialogTitle>
          <p className="text-[10px] text-muted-foreground mt-0.5">
            Adjust gains and config — hitting Apply pushes all three commands to the ESP32 immediately.
          </p>
        </DialogHeader>

        <div className="p-5 space-y-5 max-h-[75vh] overflow-y-auto">

          {/* PID Gains ──────────────────────────────────── */}
          <div className="space-y-3">
            <p className="text-[10px] font-bold text-primary uppercase tracking-wider">
              PID Gains → <code className="normal-case font-mono text-primary/70">CMD:SET_PID</code>
            </p>
            <PidSliderField
              label="Kp  Proportional"
              value={kp} onChange={setKp}
              min={0} max={200} step={0.1}
              hint="higher = faster response"
            />
            <PidSliderField
              label="Ki  Integral"
              value={ki} onChange={setKi}
              min={0} max={50} step={0.1}
              hint="removes steady-state error"
            />
            <PidSliderField
              label="Kd  Derivative"
              value={kd} onChange={setKd}
              min={0} max={100} step={0.1}
              hint="damps oscillation"
            />
          </div>

          <div className="border-t border-border/40" />

          {/* Stabilisation Config ───────────────────────── */}
          <div className="space-y-3">
            <p className="text-[10px] font-bold text-violet-400 uppercase tracking-wider">
              Stabilisation Config → <code className="normal-case font-mono text-violet-400/70">CMD:SET_PID_CFG</code>
            </p>
            <PidSliderField
              label="Setpoint"
              value={setpointDeg} onChange={setSetpointDeg}
              min={-45} max={45} step={0.1}
              unit="°"
              hint="target tilt angle"
            />
            <PidSliderField
              label="Deadband"
              value={deadbandDeg} onChange={setDeadbandDeg}
              min={0.1} max={10} step={0.1}
              unit="°"
              hint="no-correction zone"
            />
            <PidSliderField
              label="Integral Max"
              value={integralMax} onChange={setIntegralMax}
              min={0} max={1000} step={1}
              hint="anti-windup clamp"
            />
          </div>

          <div className="border-t border-border/40" />

          {/* Motor Base Throttle ────────────────────────── */}
          <div className="space-y-3">
            <p className="text-[10px] font-bold text-amber-400 uppercase tracking-wider">
              Motor → <code className="normal-case font-mono text-amber-400/70">CMD:SET_BASE_THROTTLE</code>
            </p>
            <PidSliderField
              label="Base Throttle"
              value={baseThrottle} onChange={setBaseThrottle}
              min={1050} max={1800} step={1}
              unit="µs"
              hint="idle ESC floor"
            />
          </div>

          {/* Live command preview ───────────────────────── */}
          <div className="rounded-md border border-border/50 bg-muted/20 px-3 py-2.5 space-y-1 font-mono text-[9px] leading-relaxed">
            <div>
              <span className="text-muted-foreground">CMD:SET_PID:</span>
              <span className="text-foreground">{kp},{ki},{kd}</span>
            </div>
            <div>
              <span className="text-muted-foreground">CMD:SET_PID_CFG:</span>
              <span className="text-foreground">{setpointDeg},{deadbandDeg},{integralMax}</span>
            </div>
            <div>
              <span className="text-muted-foreground">CMD:SET_BASE_THROTTLE:</span>
              <span className="text-foreground">{Math.round(baseThrottle)}</span>
            </div>
          </div>

          <button
            onClick={handleApply}
            disabled={updateSettings.isPending}
            className="w-full py-2.5 rounded-md bg-primary/10 border border-primary/40 text-primary text-sm font-semibold hover:bg-primary/20 disabled:opacity-50 transition-colors"
          >
            {updateSettings.isPending ? "Sending to ESP32…" : "Apply & Send to Hardware"}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ── Remote Control Dialog ──────────────────────────────────────────────────── */

const MAX_RPM = 12000;

interface RemoteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function RemoteDialog({ open, onOpenChange }: RemoteDialogProps) {
  const { toast } = useToast();
  const setpoint = useSetMotorSetpoint();

  const [mode, setMode] = useState<"auto" | "manual">("auto");
  const [targetRpm, setTargetRpm] = useState(0);
  const [lastSent, setLastSent] = useState<{ rpm: number; mode: "auto" | "manual" } | null>(null);

  const { data: latest } = useGetLatestReading({
    query: {
      queryKey: getGetLatestReadingQueryKey(),
      refetchInterval: 1000,
      enabled: open,
    },
  });

  const liveRpm = latest?.rpm ?? null;

  function clamp(v: number) {
    return Math.max(0, Math.min(MAX_RPM, Math.round(v / 100) * 100));
  }

  function step(delta: number) {
    setTargetRpm((prev) => clamp(prev + delta));
  }

  function handleSwitchMode(next: "auto" | "manual") {
    setMode(next);
    if (next === "auto") {
      setpoint.mutate({ data: { targetRpm: 0, mode: "auto" } }, {
        onSuccess: (data) => {
          setLastSent({ rpm: 0, mode: "auto" });
          toast({ title: "Auto mode", description: data.message });
        },
        onError: () => toast({ title: "Failed to switch mode", variant: "destructive" }),
      });
    }
  }

  function handleApply() {
    setpoint.mutate(
      { data: { targetRpm, mode } },
      {
        onSuccess: (data) => {
          setLastSent({ rpm: targetRpm, mode });
          toast({ title: "Setpoint sent", description: data.message });
        },
        onError: () =>
          toast({ title: "Failed to send setpoint", description: "Check hardware connection.", variant: "destructive" }),
      },
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm bg-card border-border shadow-2xl p-0 gap-0">
        <DialogHeader className="px-5 py-4 border-b border-border">
          <DialogTitle className="flex items-center gap-2 text-sm font-bold">
            <Radio className="w-4 h-4 text-primary" />
            Remote Control
          </DialogTitle>
          <p className="text-[10px] text-muted-foreground mt-0.5">
            Override motor RPM directly — bypasses session target.
          </p>
        </DialogHeader>

        <div className="p-5 space-y-4">
          {/* Live RPM */}
          <div className="flex items-center justify-between rounded-lg border border-border bg-muted/20 px-3 py-2">
            <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
              <Gauge className="w-3 h-3" />
              Live RPM
            </div>
            <span className="text-sm font-mono font-bold text-foreground">
              {liveRpm !== null ? liveRpm.toLocaleString() : "—"}
            </span>
          </div>

          {/* Auto / Manual toggle */}
          <div className="flex gap-2">
            <button
              onClick={() => handleSwitchMode("auto")}
              disabled={setpoint.isPending}
              className={`flex-1 py-2 rounded-md border text-sm font-semibold transition-colors disabled:opacity-50 ${
                mode === "auto"
                  ? "border-chart-3/60 bg-chart-3/10 text-chart-3"
                  : "border-border bg-muted/20 text-muted-foreground hover:bg-muted/40"
              }`}
            >
              Auto
            </button>
            <button
              onClick={() => setMode("manual")}
              disabled={setpoint.isPending}
              className={`flex-1 py-2 rounded-md border text-sm font-semibold transition-colors disabled:opacity-50 ${
                mode === "manual"
                  ? "border-primary/60 bg-primary/10 text-primary"
                  : "border-border bg-muted/20 text-muted-foreground hover:bg-muted/40"
              }`}
            >
              Manual
            </button>
          </div>

          {/* Manual controls */}
          <div className={`space-y-3 transition-opacity duration-200 ${mode === "manual" ? "opacity-100" : "opacity-30 pointer-events-none"}`}>
            {/* Target RPM label + value */}
            <div className="flex justify-between items-center">
              <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Target RPM
              </label>
              <span className="text-sm font-mono font-bold text-foreground">
                {targetRpm.toLocaleString()}
              </span>
            </div>

            {/* Slider */}
            <input
              type="range"
              min={0}
              max={MAX_RPM}
              step={100}
              value={targetRpm}
              onChange={(e) => setTargetRpm(Number(e.target.value))}
              className="w-full accent-primary"
            />
            <div className="flex justify-between text-[10px] font-mono text-muted-foreground/60">
              <span>0</span><span>6,000</span><span>12,000</span>
            </div>

            {/* Step buttons */}
            <div className="grid grid-cols-4 gap-1.5">
              {[
                { label: "−500", delta: -500 },
                { label: "−100", delta: -100 },
                { label: "+100", delta: 100 },
                { label: "+500", delta: 500 },
              ].map(({ label, delta }) => (
                <button
                  key={label}
                  onClick={() => step(delta)}
                  className="py-1.5 rounded-md border border-border text-[11px] font-mono text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
                >
                  {label}
                </button>
              ))}
            </div>

            {/* Apply button */}
            <button
              onClick={handleApply}
              disabled={setpoint.isPending}
              className="w-full py-2 rounded-md bg-primary/10 border border-primary/40 text-primary text-sm font-semibold hover:bg-primary/20 disabled:opacity-50 transition-colors"
            >
              {setpoint.isPending ? "Sending…" : `Apply ${targetRpm.toLocaleString()} RPM`}
            </button>
          </div>

          {/* Last sent confirmation */}
          {lastSent && (
            <p className="text-[9px] text-muted-foreground/60 text-center font-mono">
              Last sent: {lastSent.mode === "auto" ? "Auto mode" : `${lastSent.rpm.toLocaleString()} RPM (manual)`}
            </p>
          )}

          {/* Note */}
          <p className="text-[9px] text-muted-foreground/50 leading-relaxed border-t border-border/40 pt-2">
            Sends <code className="font-mono">CMD:MANUAL_RPM:&lt;value&gt;</code> to the ESP32 via serial / WiFi.
            Auto mode sends <code className="font-mono">CMD:SET_AUTO</code> to resume PID control.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
