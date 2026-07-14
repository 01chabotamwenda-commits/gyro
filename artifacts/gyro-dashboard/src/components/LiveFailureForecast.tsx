import { useEffect, useMemo, useRef, useState } from "react";
import {
  useGetReadingHistory,
  getGetReadingHistoryQueryKey,
} from "@workspace/api-client-react";
import { AlertTriangle, TrendingUp, ShieldCheck, Loader2 } from "lucide-react";

// ─── Math (same OLS approach used on the Predictions page, applied to a
//     short live window instead of session-to-session history) ────────────

function linReg(pts: { x: number; y: number }[]) {
  const n = pts.length;
  if (n < 2) return { slope: 0, intercept: pts[0]?.y ?? 0 };
  const sx = pts.reduce((s, p) => s + p.x, 0);
  const sy = pts.reduce((s, p) => s + p.y, 0);
  const sxy = pts.reduce((s, p) => s + p.x * p.y, 0);
  const sxx = pts.reduce((s, p) => s + p.x * p.x, 0);
  const den = n * sxx - sx * sx;
  if (den === 0) return { slope: 0, intercept: sy / n };
  const slope = (n * sxy - sx * sy) / den;
  const intercept = (sy - slope * sx) / n;
  return { slope, intercept };
}

/** Minutes from `fromX` (in minutes) until the regression line crosses `threshold`. */
function minutesTo(reg: { slope: number; intercept: number }, fromX: number, threshold: number): number | null {
  if (reg.slope <= 1e-6) return null; // flat or falling — will never reach threshold
  const x = (threshold - reg.intercept) / reg.slope;
  return x > fromX ? x - fromX : 0;
}

function fmtMinutes(mins: number): string {
  if (mins < 1) return "under a minute";
  if (mins < 60) return `${Math.round(mins)} min`;
  const hrs = mins / 60;
  if (hrs < 24) return `${hrs.toFixed(1)} h`;
  return `${(hrs / 24).toFixed(1)} d`;
}

interface Metric {
  key: string;
  label: string;
  unit: string;
  latest: number;
  warnAt: number;
  critAt: number;
  minsToWarn: number | null;
  minsToCrit: number | null;
  rising: boolean;
}

const WINDOW_MINUTES = 10;
// Readings arrive roughly every ~0.5-1s, but the regression needs enough
// spread of real performance data — not just a handful of samples taken a
// second apart — before a trend line means anything. Require at least 2
// minutes worth of samples in the window before producing any forecast.
const MIN_READINGS = 60;
const MIN_SPAN_MINUTES = 2;
// Only surface a forecast alert if the projected breach is within this horizon —
// beyond it, the trend is too noisy/far out to be a meaningful warning.
const HORIZON_MINUTES = 6 * 60;
// The forecast card's conclusion may only change (e.g. from "stable" to
// "warning") at most this often — recomputing on every 5s poll made the
// verdict flip-flop before enough data had actually changed.
const MIN_UPDATE_INTERVAL_MS = 30_000;

export function LiveFailureForecast({
  sessionRunning,
  tempWarn,
  tempCrit,
  vibWarn,
  vibCrit,
}: {
  sessionRunning: boolean;
  tempWarn: number;
  tempCrit: number;
  vibWarn: number;
  vibCrit: number;
}) {
  const params = { sinceMinutes: WINDOW_MINUTES };
  const { data: history } = useGetReadingHistory(params, {
    query: {
      enabled: sessionRunning,
      refetchInterval: 5000,
      queryKey: getGetReadingHistoryQueryKey(params),
    },
  });

  const rawMetrics = useMemo<Metric[] | null>(() => {
    if (!history || history.length < MIN_READINGS) return null;
    const t0 = new Date(history[0].timestamp).getTime();
    const toX = (ts: string) => (new Date(ts).getTime() - t0) / 60000; // minutes since window start
    const lastX = toX(history[history.length - 1].timestamp);
    // Not enough real elapsed time collected yet — a burst of readings that
    // all land within a few seconds isn't "enough performance data",
    // regardless of the raw sample count.
    if (lastX < MIN_SPAN_MINUTES) return null;

    const tempPts = history.map(r => ({ x: toX(r.timestamp), y: r.temperature }));
    const vibPts = history.map(r => ({ x: toX(r.timestamp), y: (r as any).vibration ?? 0 }));
    const tempReg = linReg(tempPts);
    const vibReg = linReg(vibPts);

    return [
      {
        key: "temperature",
        label: "Bearing temperature",
        unit: "°C",
        latest: tempPts[tempPts.length - 1].y,
        warnAt: tempWarn,
        critAt: tempCrit,
        minsToWarn: minutesTo(tempReg, lastX, tempWarn),
        minsToCrit: minutesTo(tempReg, lastX, tempCrit),
        rising: tempReg.slope > 1e-6,
      },
      {
        key: "vibration",
        label: "Vibration",
        unit: "mm/s",
        latest: vibPts[vibPts.length - 1].y,
        warnAt: vibWarn,
        critAt: vibCrit,
        minsToWarn: minutesTo(vibReg, lastX, vibWarn),
        minsToCrit: minutesTo(vibReg, lastX, vibCrit),
        rising: vibReg.slope > 1e-6,
      },
    ];
  }, [history, tempWarn, tempCrit, vibWarn, vibCrit]);

  // Gate how often the *displayed* verdict is allowed to change. The query
  // above still refreshes every 5s so `latest` values feel live once a
  // verdict is shown, but the conclusion itself (stable/warning/critical)
  // only updates at most every MIN_UPDATE_INTERVAL_MS — enough performance
  // data must accumulate between notification-worthy changes.
  const [metrics, setMetrics] = useState<Metric[] | null>(null);
  const lastUpdateRef = useRef(0);
  useEffect(() => {
    if (!rawMetrics) {
      setMetrics(null);
      lastUpdateRef.current = 0;
      return;
    }
    const now = Date.now();
    if (now - lastUpdateRef.current >= MIN_UPDATE_INTERVAL_MS || lastUpdateRef.current === 0) {
      lastUpdateRef.current = now;
      setMetrics(rawMetrics);
    }
  }, [rawMetrics]);

  if (!sessionRunning) return null;

  if (!metrics) {
    return (
      <div className="rounded-lg border border-border bg-card p-2.5 flex items-center gap-2">
        <Loader2 className="w-3.5 h-3.5 text-muted-foreground animate-spin shrink-0" />
        <span className="text-[10px] text-muted-foreground font-mono">
          Building live failure forecast… ({history?.length ?? 0}/{MIN_READINGS} readings)
        </span>
      </div>
    );
  }

  // Most urgent metric already past a threshold, else soonest projected crit crossing within horizon.
  const alreadyCrit = metrics.find(m => m.latest >= m.critAt);
  const alreadyWarn = metrics.find(m => m.latest >= m.warnAt);
  const projected = metrics
    .filter(m => m.minsToCrit !== null && m.minsToCrit <= HORIZON_MINUTES)
    .sort((a, b) => (a.minsToCrit ?? Infinity) - (b.minsToCrit ?? Infinity))[0];

  if (alreadyCrit) {
    return (
      <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-2.5 flex items-start gap-2">
        <AlertTriangle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
        <div className="min-w-0">
          <p className="text-[11px] font-bold text-destructive">
            {alreadyCrit.label} at critical level now
          </p>
          <p className="text-[10px] text-destructive/80 font-mono">
            {alreadyCrit.latest.toFixed(1)} {alreadyCrit.unit} ≥ {alreadyCrit.critAt} {alreadyCrit.unit} — system may fail imminently
          </p>
        </div>
      </div>
    );
  }

  if (projected && projected.minsToCrit != null) {
    const isImminent = projected.minsToCrit <= 30;
    return (
      <div
        className={`rounded-lg border p-2.5 flex items-start gap-2 ${
          isImminent
            ? "border-destructive/50 bg-destructive/10"
            : "border-amber-500/40 bg-amber-500/10"
        }`}
      >
        <AlertTriangle className={`w-4 h-4 shrink-0 mt-0.5 ${isImminent ? "text-destructive" : "text-amber-500"}`} />
        <div className="min-w-0">
          <p className={`text-[11px] font-bold ${isImminent ? "text-destructive" : "text-amber-500"}`}>
            System may fail in {fmtMinutes(projected.minsToCrit)}
          </p>
          <p className={`text-[10px] font-mono ${isImminent ? "text-destructive/80" : "text-amber-500/80"}`}>
            {projected.label} trending up — {projected.latest.toFixed(1)} {projected.unit} now, projected to hit critical
            ({projected.critAt} {projected.unit}) at current rate.
          </p>
          {alreadyWarn && alreadyWarn.key !== projected.key && (
            <p className="text-[9px] text-muted-foreground mt-0.5">
              {alreadyWarn.label} is also above warning level ({alreadyWarn.latest.toFixed(1)} {alreadyWarn.unit}).
            </p>
          )}
        </div>
      </div>
    );
  }

  if (alreadyWarn) {
    return (
      <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-2.5 flex items-start gap-2">
        <TrendingUp className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
        <div className="min-w-0">
          <p className="text-[11px] font-bold text-amber-500">{alreadyWarn.label} above warning level</p>
          <p className="text-[10px] text-amber-500/80 font-mono">
            {alreadyWarn.latest.toFixed(1)} {alreadyWarn.unit} ≥ {alreadyWarn.warnAt} {alreadyWarn.unit} — no critical crossing projected within the next {HORIZON_MINUTES / 60} h at the current rate.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-card p-2.5 flex items-start gap-2">
      <ShieldCheck className="w-4 h-4 text-chart-3 shrink-0 mt-0.5" />
      <div className="min-w-0">
        <p className="text-[11px] font-bold text-foreground">No failure predicted</p>
        <p className="text-[10px] text-muted-foreground font-mono">
          Temp {metrics[0].latest.toFixed(1)}°C · Vib {metrics[1].latest.toFixed(2)} mm/s — stable over last {WINDOW_MINUTES} min.
        </p>
      </div>
    </div>
  );
}
