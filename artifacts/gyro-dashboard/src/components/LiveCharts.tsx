import React, { useEffect, useState, useMemo } from "react";
import type { SensorReading } from "@workspace/api-client-react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, ReferenceLine, Area, AreaChart
} from "recharts";
import { format } from "date-fns";
import { ZoomIn, ZoomOut, Scan } from "lucide-react";

export type TimeScale = "30s" | "1m" | "5m" | "15m" | "1h" | "4h" | "1d";

interface ChartDataProps {
  history: SensorReading[];
  latestReading: SensorReading | null;
  timeScale?: TimeScale;
}

const TIME_SCALE_WINDOW_MS: Record<TimeScale, number> = {
  "30s": 30_000,
  "1m":  60_000,
  "5m":  5 * 60_000,
  "15m": 15 * 60_000,
  "1h":  60 * 60_000,
  "4h":  4 * 60 * 60_000,
  "1d":  24 * 60 * 60_000,
};

const MAX_CHART_POINTS = 400;

function downsample<T>(arr: T[], max: number): T[] {
  if (arr.length <= max) return arr;
  const step = arr.length / max;
  return Array.from({ length: max }, (_, i) => arr[Math.floor(i * step)]);
}

function useChartData({ history, latestReading, timeScale = "1m" }: ChartDataProps) {
  const [liveBuffer, setLiveBuffer] = useState<SensorReading[]>([]);

  useEffect(() => {
    setLiveBuffer([...history]);
  }, [history]);

  useEffect(() => {
    if (!latestReading) return;
    setLiveBuffer(prev => {
      if (prev.length > 0 && prev[prev.length - 1].id === latestReading.id) return prev;
      return [...prev, latestReading];
    });
  }, [latestReading]);

  const data = useMemo(() => {
    const windowMs = TIME_SCALE_WINDOW_MS[timeScale];
    const cutoff = Date.now() - windowMs;
    const filtered = liveBuffer.filter(r => new Date(r.timestamp).getTime() >= cutoff);
    return downsample(filtered, MAX_CHART_POINTS);
  }, [liveBuffer, timeScale]);

  return data;
}

const timeFormat = (isoString: string, timeScale: TimeScale) => {
  try {
    const d = new Date(isoString);
    if (timeScale === "1d" || timeScale === "4h" || timeScale === "1h") {
      return format(d, 'HH:mm');
    }
    return format(d, 'HH:mm:ss');
  } catch { return ""; }
};

const tooltipStyle = {
  contentStyle: {
    backgroundColor: 'hsl(var(--popover))',
    border: '1px solid hsl(var(--border))',
    borderRadius: '8px',
    fontSize: '11px',
    fontFamily: 'var(--font-mono)',
    boxShadow: '0 4px 16px rgba(0,0,0,0.35)',
  },
  isAnimationActive: false,
};

const axisProps = {
  stroke: 'hsl(var(--muted-foreground) / 0.5)',
  fontSize: 10,
  tickLine: false,
};

// Recharts' default tick formatter falls back to JS Number#toString, which
// switches to exponential notation for very small (e.g. 2e-7) or very large
// (>= 1e21) magnitudes. Format every axis tick as a plain fixed-point number
// instead, trimming trailing zeros so whole numbers render cleanly
// (e.g. "10" not "10.00"), normalizing "-0" to "0", and falling back to
// Number#toLocaleString (which never uses exponential notation, even for
// huge magnitudes) for anything toFixed can't handle safely.
export function formatAxisNumber(value: number, decimals = 2): string {
  if (!isFinite(value)) return "0";
  // toFixed itself switches to exponential form for |value| >= 1e21.
  if (Math.abs(value) >= 1e21) {
    return value.toLocaleString("en-US", { maximumFractionDigits: 0, useGrouping: false });
  }
  const fixed = value.toFixed(decimals);
  const trimmed = fixed.replace(/\.?0+$/, "") || "0";
  return trimmed === "-0" ? "0" : trimmed;
}

const gridProps = {
  strokeDasharray: "2 4",
  stroke: "hsl(var(--border))",
  strokeOpacity: 0.5,
  vertical: false,
};

function ZoomControls({
  onIn, onOut, canIn, canOut, onFit, showFit,
}: {
  onIn: () => void; onOut: () => void; canIn: boolean; canOut: boolean;
  onFit?: () => void; showFit?: boolean;
}) {
  return (
    <div className="flex items-center gap-0.5 ml-2">
      {showFit && onFit && (
        <button
          onClick={onFit}
          title="Fit to data"
          className="flex items-center justify-center w-5 h-5 rounded border border-border/60 text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
        >
          <Scan className="w-2.5 h-2.5" />
        </button>
      )}
      <button
        onClick={onOut}
        disabled={!canOut}
        title="Zoom out y-axis"
        className="flex items-center justify-center w-5 h-5 rounded border border-border/60 text-muted-foreground hover:text-foreground hover:bg-muted/40 disabled:opacity-25 disabled:cursor-not-allowed transition-colors"
      >
        <ZoomOut className="w-2.5 h-2.5" />
      </button>
      <button
        onClick={onIn}
        disabled={!canIn}
        title="Zoom in y-axis"
        className="flex items-center justify-center w-5 h-5 rounded border border-border/60 text-muted-foreground hover:text-foreground hover:bg-muted/40 disabled:opacity-25 disabled:cursor-not-allowed transition-colors"
      >
        <ZoomIn className="w-2.5 h-2.5" />
      </button>
    </div>
  );
}

function useYZoom(steps: [number, number][]) {
  const [idx, setIdx] = useState(0);
  const domain = steps[idx];
  const zoomIn  = () => setIdx(i => Math.min(i + 1, steps.length - 1));
  const zoomOut = () => setIdx(i => Math.max(i - 1, 0));
  return { domain, zoomIn, zoomOut, canIn: idx < steps.length - 1, canOut: idx > 0 };
}

// Classic "nice numbers" axis rounding (same idea old analog/instrument
// gauges and graph paper use): snap the domain to round step sizes like
// 1/2/5/10/20/50/100... instead of tightly hugging the live min/max. This
// keeps the scale steady — it only moves when data crosses into the next
// round bucket, rather than rescaling on every incoming sample.
function niceStep(rawStep: number): number {
  if (!isFinite(rawStep) || rawStep <= 0) return 1;
  const exponent = Math.floor(Math.log10(rawStep));
  const fraction = rawStep / Math.pow(10, exponent);
  let niceFraction: number;
  if (fraction <= 1) niceFraction = 1;
  else if (fraction <= 2) niceFraction = 2;
  else if (fraction <= 5) niceFraction = 5;
  else niceFraction = 10;
  return niceFraction * Math.pow(10, exponent);
}

function niceDomain(min: number, max: number, minFloor?: number, targetTicks = 5): [number, number] {
  const range = Math.max(max - min, 1e-6);
  const step = niceStep(range / targetTicks);
  let niceMin = Math.floor(min / step) * step;
  let niceMax = Math.ceil(max / step) * step;
  if (niceMin === niceMax) niceMax = niceMin + step;
  if (minFloor !== undefined) niceMin = Math.max(minFloor, niceMin);
  return [niceMin, niceMax];
}

function useDataFitZoom(
  bounds: [number, number],
  data: SensorReading[],
  accessors: Array<(r: SensorReading) => number | undefined>,
  options?: { minFloor?: number }
) {
  const [isAutoFit, setIsAutoFit] = useState(true);
  const [domain, setDomain] = useState<[number, number]>(bounds);

  const autoDomain = useMemo(() => {
    if (data.length === 0) return bounds;
    let min = Infinity;
    let max = -Infinity;
    for (const r of data) {
      for (const acc of accessors) {
        const v = acc(r);
        if (v != null && !isNaN(v)) {
          min = Math.min(min, v);
          max = Math.max(max, v);
        }
      }
    }
    if (min === Infinity) return bounds;
    return niceDomain(min, max, options?.minFloor);
  }, [data, accessors, bounds, options?.minFloor]);

  useEffect(() => {
    if (isAutoFit) setDomain(autoDomain);
  }, [isAutoFit, autoDomain]);

  const zoomIn = () => {
    setIsAutoFit(false);
    setDomain(prev => {
      const next: [number, number] = [Math.max(bounds[0], prev[0] + 5), Math.min(bounds[1], prev[1] - 5)];
      return next[0] < next[1] ? next : prev;
    });
  };

  const zoomOut = () => {
    setIsAutoFit(false);
    setDomain(prev => [
      Math.max(bounds[0], prev[0] - 5),
      Math.min(bounds[1], prev[1] + 5),
    ] as [number, number]);
  };

  const fit = () => setIsAutoFit(true);

  return {
    domain: isAutoFit ? (autoDomain as [number, number]) : domain,
    zoomIn, zoomOut, fit,
    canIn: isAutoFit || (domain[1] - domain[0] > 10),
    canOut: isAutoFit || (domain[0] > bounds[0] || domain[1] < bounds[1]),
    isAutoFit,
  };
}

const TILT_BOUNDS: [number, number] = [-180, 180];
const TILT_ACCESSORS: Array<(r: SensorReading) => number | undefined> = [
  (r) => r.filteredAngleX,
  (r) => r.filteredAngleY,
];

const RPM_BOUNDS: [number, number] = [0, 15000];
const RPM_ACCESSORS: Array<(r: SensorReading) => number | undefined> = [(r) => r.rpm];

const TEMP_BOUNDS: [number, number] = [10, 90];
const TEMP_ACCESSORS: Array<(r: SensorReading) => number | undefined> = [(r) => r.temperature];

const VIB_BOUNDS: [number, number] = [0, 1];
const VIB_ACCESSORS: Array<(r: SensorReading) => number | undefined> = [(r) => r.vibration];

const PWM_BOUNDS: [number, number] = [0, 105];
const PWM_ACCESSORS: Array<(r: SensorReading) => number | undefined> = [(r) => r.motorPwm];

/* ── Shared card shell ─────────────────────────────────────────────────────── */

function ChartCard({
  accentColor,
  title,
  subtitle,
  right,
  children,
  compact = false,
}: {
  accentColor: string;
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
  compact?: boolean;
}) {
  return (
    <div className="flex flex-col h-full min-h-0 rounded-xl overflow-hidden border border-border bg-card shadow-sm">
      {/* Colored top accent */}
      <div className="h-[2px] w-full shrink-0" style={{ background: accentColor }} />
      {/* Header */}
      <div className={`flex items-center justify-between shrink-0 border-b border-border/60 bg-muted/20 ${compact ? "px-3 py-1.5" : "px-3.5 py-2"}`}>
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-1.5 h-1.5 rounded-full shrink-0 opacity-90" style={{ background: accentColor }} />
          <span className={`font-semibold text-foreground truncate ${compact ? "text-[10px]" : "text-[11px]"}`}>{title}</span>
          {subtitle && (
            <span className="text-[9px] text-muted-foreground/60 font-mono truncate hidden sm:inline">{subtitle}</span>
          )}
        </div>
        {right && <div className="shrink-0 flex items-center">{right}</div>}
      </div>
      {/* Chart area */}
      <div className="flex-1 min-h-0 bg-card">
        {children}
      </div>
    </div>
  );
}

/* ── Charts ─────────────────────────────────────────────────────────────────── */

export function RpmChart({ history, latestReading, targetRpm, timeScale = "1m" }: ChartDataProps & { targetRpm?: number }) {
  const data = useChartData({ history, latestReading, timeScale });
  const { domain, zoomIn, zoomOut, fit, canIn, canOut, isAutoFit } = useDataFitZoom(RPM_BOUNDS, data, RPM_ACCESSORS, { minFloor: 0 });
  const liveRpm = latestReading?.rpm;

  return (
    <ChartCard
      accentColor="hsl(var(--chart-1))"
      title="Flywheel Speed"
      subtitle={isAutoFit ? "fit to data" : "revolutions per minute"}
      right={
        <div className="flex items-center gap-3">
          {liveRpm != null && (
            <span className="text-[11px] font-mono font-bold" style={{ color: "hsl(var(--chart-1))" }}>
              {Math.round(liveRpm).toLocaleString()} RPM
            </span>
          )}
          {targetRpm && (
            <span className="text-[10px] font-mono" style={{ color: "hsl(var(--chart-1))" }}>
              target {targetRpm.toLocaleString()}
            </span>
          )}
          <ZoomControls onIn={zoomIn} onOut={zoomOut} canIn={canIn} canOut={canOut} onFit={fit} showFit={!isAutoFit} />
        </div>
      }
    >
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 10, right: 12, left: -18, bottom: 4 }}>
          <defs>
            <linearGradient id="rpmGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="hsl(var(--chart-1))" stopOpacity={0.35} />
              <stop offset="95%" stopColor="hsl(var(--chart-1))" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid {...gridProps} />
          <XAxis dataKey="timestamp" tickFormatter={t => timeFormat(t, timeScale)} {...axisProps} tickMargin={6} minTickGap={50}
            label={{ value: "Time →", position: "insideBottomRight", fontSize: 8, fill: "hsl(var(--muted-foreground))", dy: 4, opacity: 0.5 }} />
          <YAxis {...axisProps} domain={domain} tickFormatter={v => Math.round(v).toLocaleString()}
            label={{ value: "RPM", angle: -90, position: "insideLeft", fontSize: 8, fill: "hsl(var(--muted-foreground))", dx: 14, opacity: 0.5 }} />
          <Tooltip {...tooltipStyle} labelFormatter={t => timeFormat(String(t), timeScale)}
            formatter={(v: number) => [`${v.toFixed(0)} RPM`, 'RPM']} />
          {targetRpm && (
            <ReferenceLine y={targetRpm} stroke="hsl(var(--chart-1))" strokeDasharray="6 3" strokeOpacity={0.45}
              label={{ value: 'target', position: 'insideTopRight', fontSize: 9, fill: 'hsl(var(--chart-1))', opacity: 0.6 }} />
          )}
          <Area type="monotone" dataKey="rpm" name="RPM" stroke="hsl(var(--chart-1))" strokeWidth={2} fill="url(#rpmGrad)" dot={false} isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

export function TiltChart({ history, latestReading, timeScale = "1m", maxTiltAngle = 14 }: ChartDataProps & { maxTiltAngle?: number }) {
  const data = useChartData({ history, latestReading, timeScale });
  const { domain, zoomIn, zoomOut, fit, canIn, canOut, isAutoFit } = useDataFitZoom(
    TILT_BOUNDS, data, TILT_ACCESSORS
  );
  const tiltWarn = maxTiltAngle * 0.85;

  return (
    <ChartCard
      accentColor="hsl(var(--chart-4))"
      title="Tilt X / Y"
      subtitle={isAutoFit ? "fit to data" : "filtered angle, degrees"}
      right={<ZoomControls onIn={zoomIn} onOut={zoomOut} canIn={canIn} canOut={canOut} onFit={fit} showFit={!isAutoFit} />}
    >
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 10, right: 12, left: -18, bottom: 4 }}>
          <CartesianGrid {...gridProps} />
          <XAxis dataKey="timestamp" tickFormatter={t => timeFormat(t, timeScale)} {...axisProps} tickMargin={6} minTickGap={50}
            label={{ value: "Time →", position: "insideBottomRight", fontSize: 8, fill: "hsl(var(--muted-foreground))", dy: 4, opacity: 0.5 }} />
          <YAxis {...axisProps} domain={domain} tickFormatter={v => `${formatAxisNumber(v)}°`}
            label={{ value: "°", angle: -90, position: "insideLeft", fontSize: 8, fill: "hsl(var(--muted-foreground))", dx: 14, opacity: 0.5 }} />
          <Tooltip {...tooltipStyle} labelFormatter={t => timeFormat(String(t), timeScale)}
            formatter={(v: number, name: string) => [`${v.toFixed(2)}°`, name === "filteredAngleX" ? "Tilt X (side-to-side)" : "Tilt Y (front-back)"]} />
          <ReferenceLine y={0} stroke="hsl(var(--muted-foreground))" strokeOpacity={0.25}
            label={{ value: "level", position: "insideTopRight", fontSize: 8, fill: "hsl(var(--muted-foreground))", opacity: 0.4 }} />
          <ReferenceLine y={tiltWarn} stroke="hsl(var(--accent))" strokeDasharray="4 3" strokeOpacity={0.5}
            label={{ value: `warn ${tiltWarn.toFixed(0)}°`, position: 'insideTopRight', fontSize: 8, fill: 'hsl(var(--accent))', opacity: 0.6 }} />
          <ReferenceLine y={maxTiltAngle} stroke="hsl(var(--destructive))" strokeDasharray="4 3" strokeOpacity={0.6}
            label={{ value: `max ${maxTiltAngle}°`, position: 'insideTopRight', fontSize: 8, fill: 'hsl(var(--destructive))', opacity: 0.7 }} />
          <ReferenceLine y={-tiltWarn} stroke="hsl(var(--accent))" strokeDasharray="4 3" strokeOpacity={0.5}
            label={{ value: `warn ${-tiltWarn.toFixed(0)}°`, position: 'insideBottomRight', fontSize: 8, fill: 'hsl(var(--accent))', opacity: 0.6 }} />
          <ReferenceLine y={-maxTiltAngle} stroke="hsl(var(--destructive))" strokeDasharray="4 3" strokeOpacity={0.6}
            label={{ value: `max ${-maxTiltAngle}°`, position: 'insideBottomRight', fontSize: 8, fill: 'hsl(var(--destructive))', opacity: 0.7 }} />
          <Legend iconType="plainline" iconSize={10}
            wrapperStyle={{ fontSize: '10px', paddingBottom: 4, opacity: 0.75 }}
            formatter={(value) => value === "filteredAngleX" ? "X (side-to-side)" : "Y (front-back)"} />
          <Line type="monotone" dataKey="filteredAngleX" name="filteredAngleX" stroke="hsl(var(--chart-4))" strokeWidth={2} dot={false} isAnimationActive={false} />
          <Line type="monotone" dataKey="filteredAngleY" name="filteredAngleY" stroke="hsl(var(--chart-3))" strokeWidth={2} dot={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

export function TempChart({ history, latestReading, timeScale = "1m", tempWarn = 55, tempCrit = 65 }: ChartDataProps & { tempWarn?: number; tempCrit?: number }) {
  const data = useChartData({ history, latestReading, timeScale });
  const { domain, zoomIn, zoomOut, fit, canIn, canOut, isAutoFit } = useDataFitZoom(TEMP_BOUNDS, data, TEMP_ACCESSORS, { minFloor: 10 });

  return (
    <ChartCard
      accentColor="hsl(var(--chart-5))"
      title="Temperature"
      subtitle={isAutoFit ? "fit to data" : "°C · bearing housing"}
      compact
      right={<ZoomControls onIn={zoomIn} onOut={zoomOut} canIn={canIn} canOut={canOut} onFit={fit} showFit={!isAutoFit} />}
    >
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 6, right: 10, left: -22, bottom: 2 }}>
          <defs>
            <linearGradient id="tempGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="hsl(var(--chart-5))" stopOpacity={0.4} />
              <stop offset="95%" stopColor="hsl(var(--chart-5))" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid {...gridProps} />
          <XAxis dataKey="timestamp" tickFormatter={t => timeFormat(t, timeScale)} {...axisProps} tickMargin={4} minTickGap={60} />
          <YAxis {...axisProps} domain={domain} tickFormatter={v => `${formatAxisNumber(v, 1)}°`} />
          <Tooltip {...tooltipStyle} labelFormatter={t => timeFormat(String(t), timeScale)}
            formatter={(v: number) => [`${v.toFixed(1)} °C`, 'Temp']} />
          <ReferenceLine y={tempWarn} stroke="hsl(var(--accent))" strokeDasharray="4 3" strokeOpacity={0.7}
            label={{ value: `warn ${tempWarn}°`, position: 'insideTopLeft', fontSize: 9, fill: 'hsl(var(--accent))', opacity: 0.8 }} />
          <ReferenceLine y={tempCrit} stroke="hsl(var(--destructive))" strokeDasharray="4 3" strokeOpacity={0.8}
            label={{ value: `crit ${tempCrit}°`, position: 'insideTopLeft', fontSize: 9, fill: 'hsl(var(--destructive))', opacity: 0.9 }} />
          <Area type="monotone" dataKey="temperature" name="Temp" stroke="hsl(var(--chart-5))" strokeWidth={2} fill="url(#tempGrad)" dot={false} isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

export function VibrationChart({ history, latestReading, timeScale = "1m", vibWarn = 4.5, vibCrit = 7.1 }: ChartDataProps & { vibWarn?: number; vibCrit?: number }) {
  const data = useChartData({ history, latestReading, timeScale });
  const { domain, zoomIn, zoomOut, fit, canIn, canOut, isAutoFit } = useDataFitZoom(VIB_BOUNDS, data, VIB_ACCESSORS, { minFloor: 0 });

  return (
    <ChartCard
      accentColor="hsl(var(--chart-2))"
      title="Vibration"
      subtitle={isAutoFit ? "fit to data" : "mm/s · ISO 10816-3"}
      compact
      right={<ZoomControls onIn={zoomIn} onOut={zoomOut} canIn={canIn} canOut={canOut} onFit={fit} showFit={!isAutoFit} />}
    >
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 6, right: 10, left: -22, bottom: 2 }}>
          <defs>
            <linearGradient id="vibGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="hsl(var(--chart-2))" stopOpacity={0.4} />
              <stop offset="95%" stopColor="hsl(var(--chart-2))" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid {...gridProps} />
          <XAxis dataKey="timestamp" tickFormatter={t => timeFormat(t, timeScale)} {...axisProps} tickMargin={4} minTickGap={60} />
          <YAxis {...axisProps} domain={domain} tickFormatter={v => formatAxisNumber(v, 2)} />
          <Tooltip {...tooltipStyle} labelFormatter={t => timeFormat(String(t), timeScale)}
            formatter={(v: number) => [`${(v as number).toFixed(2)} mm/s`, 'Vibration']} />
          <ReferenceLine y={vibWarn} stroke="hsl(var(--accent))" strokeDasharray="4 3" strokeOpacity={0.7}
            label={{ value: `warn ${vibWarn}`, position: 'insideTopRight', fontSize: 8, fill: 'hsl(var(--accent))', opacity: 0.8 }} />
          <ReferenceLine y={vibCrit} stroke="hsl(var(--destructive))" strokeDasharray="4 3" strokeOpacity={0.8}
            label={{ value: `crit ${vibCrit}`, position: 'insideTopRight', fontSize: 8, fill: 'hsl(var(--destructive))', opacity: 0.9 }} />
          <Area type="monotone" dataKey="vibration" name="Vibration" stroke="hsl(var(--chart-2))" strokeWidth={2} fill="url(#vibGrad)" dot={false} isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

export function PwmChart({ history, latestReading, timeScale = "1m" }: ChartDataProps) {
  const data = useChartData({ history, latestReading, timeScale });
  const { domain, zoomIn, zoomOut, fit, canIn, canOut, isAutoFit } = useDataFitZoom(PWM_BOUNDS, data, PWM_ACCESSORS, { minFloor: 0 });

  return (
    <ChartCard
      accentColor="hsl(var(--chart-3))"
      title="PWM"
      subtitle={isAutoFit ? "fit to data" : "% duty cycle"}
      compact
      right={<ZoomControls onIn={zoomIn} onOut={zoomOut} canIn={canIn} canOut={canOut} onFit={fit} showFit={!isAutoFit} />}
    >
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 6, right: 10, left: -22, bottom: 2 }}>
          <defs>
            <linearGradient id="pwmGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="hsl(var(--chart-3))" stopOpacity={0.35} />
              <stop offset="95%" stopColor="hsl(var(--chart-3))" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid {...gridProps} />
          <XAxis dataKey="timestamp" tickFormatter={t => timeFormat(t, timeScale)} {...axisProps} tickMargin={4} minTickGap={60} />
          <YAxis {...axisProps} domain={domain} tickFormatter={v => `${formatAxisNumber(v, 0)}%`} />
          <Tooltip {...tooltipStyle} labelFormatter={t => timeFormat(String(t), timeScale)}
            formatter={(v: number) => [`${v.toFixed(1)} %`, 'PWM']} />
          <ReferenceLine y={90} stroke="hsl(var(--destructive))" strokeDasharray="4 3" strokeOpacity={0.6}
            label={{ value: 'high load', position: 'insideTopRight', fontSize: 8, fill: 'hsl(var(--destructive))', opacity: 0.7 }} />
          <Area type="monotone" dataKey="motorPwm" name="PWM" stroke="hsl(var(--chart-3))" strokeWidth={2} fill="url(#pwmGrad)" dot={false} isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
