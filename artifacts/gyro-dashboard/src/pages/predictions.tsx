import React, { useMemo, useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { apiUrl } from "@/lib/api-url";
import { useGetSettings, getGetSettingsQueryKey, useGetConnectivity, getGetConnectivityQueryKey } from "@workspace/api-client-react";
import {
  ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine, ReferenceArea, Legend,
} from "recharts";
import { ArrowLeft, TrendingUp, HelpCircle, X, Clock, Activity, Settings2, ChevronDown, ChevronUp } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatAxisNumber } from "@/components/LiveCharts";

// ─── Types ────────────────────────────────────────────────────────────────────

interface SessionStat {
  sessionId: number;
  label: string;
  avgTemp: number;
  maxTemp: number;
  avgRpm: number;
  targetRpm: number;
  rpmStddev: number;
  rpmCv: number;
  wobbleMag: number;
  avgVibration: number;
  maxVibration: number;
  readingCount: number;
}

// ─── Math ─────────────────────────────────────────────────────────────────────

function linReg(pts: { x: number; y: number }[]) {
  const n = pts.length;
  if (n < 2) return { slope: 0, intercept: pts[0]?.y ?? 0, r2: 0 };
  const sx  = pts.reduce((s, p) => s + p.x, 0);
  const sy  = pts.reduce((s, p) => s + p.y, 0);
  const sxy = pts.reduce((s, p) => s + p.x * p.y, 0);
  const sxx = pts.reduce((s, p) => s + p.x * p.x, 0);
  const den = n * sxx - sx * sx;
  if (den === 0) return { slope: 0, intercept: sy / n, r2: 0 };
  const slope     = (n * sxy - sx * sy) / den;
  const intercept = (sy - slope * sx) / n;
  const yMean = sy / n;
  const ssTot = pts.reduce((s, p) => s + (p.y - yMean) ** 2, 0);
  const ssRes = pts.reduce((s, p) => s + (p.y - (slope * p.x + intercept)) ** 2, 0);
  return { slope, intercept, r2: ssTot < 1e-9 ? 1 : 1 - ssRes / ssTot };
}

function sessionsTo(reg: { slope: number; intercept: number }, lastIdx: number, threshold: number) {
  if (reg.slope <= 0) return null;
  const x = (threshold - reg.intercept) / reg.slope;
  return x > lastIdx ? Math.ceil(x - lastIdx) : 0;
}

function fmtHrs(hrs: number): string {
  if (hrs < 1) return `${Math.round(hrs * 60)} min`;
  if (hrs < 24) return `${Math.round(hrs)} h`;
  const d = Math.round(hrs / 24);
  return `${d} day${d !== 1 ? "s" : ""}`;
}

// ─── Time-unit formatting for the X-axis ─────────────────────────────────────

type TimeUnit = "seconds" | "minutes" | "hours" | "days";

const UNIT_LABEL: Record<TimeUnit, string> = {
  seconds: "s",
  minutes: "min",
  hours: "h",
  days: "d",
};

function fmtTime(hrs: number, unit: TimeUnit): string {
  switch (unit) {
    case "seconds":  return `${Math.round(hrs * 3600)} ${UNIT_LABEL.seconds}`;
    case "minutes":  return `${Math.round(hrs * 60)} ${UNIT_LABEL.minutes}`;
    case "hours":    return `${Math.round(hrs)} ${UNIT_LABEL.hours}`;
    case "days":     return `${(hrs / 24).toFixed(1)} ${UNIT_LABEL.days}`;
  }
}

function fmtTimeShort(hrs: number, unit: TimeUnit): string {
  switch (unit) {
    case "seconds":  {
      const s = Math.round(hrs * 3600);
      return s >= 1000 ? `${(s / 1000).toFixed(1)}k` : `${s}`;
    }
    case "minutes":  return `${Math.round(hrs * 60)}`;
    case "hours":    return `${Math.round(hrs)}`;
    case "days":     return `${(hrs / 24).toFixed(1)}`;
  }
}

function buildChart(
  sessions: SessionStat[],
  getVal: (s: SessionStat) => number,
  future = 4,
  avgHrsPerSession = 24,
  timeUnit: TimeUnit = "hours",
) {
  const pts = sessions.map((s, i) => ({ x: i, y: getVal(s) }));
  const reg = linReg(pts);
  const data: {
    label: string; timeLabel: string; actual: number | null; trend: number; isFuture: boolean;
  }[] = sessions.map((s, i) => {
    const hrs = i * avgHrsPerSession;
    return {
      label: fmtTimeShort(hrs, timeUnit),
      timeLabel: `Session ${s.sessionId} — ${fmtTime(hrs, timeUnit)}`,
      actual: Math.round(getVal(s) * 100) / 100,
      trend: Math.round((reg.slope * i + reg.intercept) * 100) / 100,
      isFuture: false,
    };
  });
  for (let f = 1; f <= future; f++) {
    const i = sessions.length - 1 + f;
    const hrs = (sessions.length - 1 + f) * avgHrsPerSession;
    data.push({
      label: fmtTimeShort(hrs, timeUnit),
      timeLabel: `Projected — ${fmtTime(hrs, timeUnit)}`,
      actual: null,
      trend: Math.round((reg.slope * i + reg.intercept) * 100) / 100,
      isFuture: true,
    });
  }
  return { data, reg };
}

// ─── Custom tooltip ───────────────────────────────────────────────────────────

function ChartTip({
  active, payload, label, unit,
}: {
  active?: boolean;
  payload?: { name: string; value: number; color: string }[];
  label?: string;
  unit?: string;
}) {
  if (!active || !payload?.length) return null;
  const entry = payload[0];
  const timeLabel = (entry as { payload?: { timeLabel?: string } })?.payload?.timeLabel ?? label ?? "";
  return (
    <div
      style={{
        backgroundColor: "hsl(var(--popover))",
        border: "1px solid hsl(var(--border))",
        borderRadius: 6,
        fontSize: 11,
        fontFamily: "var(--font-mono)",
      }}
      className="px-2.5 py-1.5 space-y-0.5"
    >
      <p className="text-[10px] text-muted-foreground">{timeLabel}</p>
      {payload.map((p, i) =>
        p.value != null && (
          <p key={i} className="text-[11px]" style={{ color: p.color }}>
            {p.name === "actual" ? "Measured" : "Trend"}:{" "}
            <span className="font-bold">{Number(p.value).toFixed(2)}</span>
            {unit ? ` ${unit}` : ""}
          </p>
        ),
      )}
    </div>
  );
}

// ─── Explanation panel ────────────────────────────────────────────────────────

interface ExplanationProps {
  metric: string;
  unit: string;
  reg: { slope: number; intercept: number; r2: number };
  latest: number;
  sessionCount: number;
  thresholds?: { label: string; value: number; sessionsAway: number | null }[];
  avgHrsPerSession: number;
  action: string;
}

function ExplanationPanel({
  metric, unit, reg, latest, sessionCount, thresholds = [], avgHrsPerSession, action,
}: ExplanationProps) {
  const slopeAbs = Math.abs(reg.slope);
  const direction = reg.slope > 0.001 ? "rising" : reg.slope < -0.001 ? "falling" : "flat";
  const r2Pct = (reg.r2 * 100).toFixed(0);
  const confidence = reg.r2 > 0.8 ? "high" : reg.r2 > 0.5 ? "moderate" : "low";

  return (
    <div className="mt-2 rounded-lg border border-border bg-muted/10 p-3 space-y-2 text-[11px] leading-relaxed">
      <p className="font-semibold text-foreground text-[11px]">How this prediction was made</p>

      <div className="space-y-1 text-muted-foreground">
        <p>
          <span className="text-foreground font-medium">Data used:</span>{" "}
          {sessionCount} completed session{sessionCount !== 1 ? "s" : ""}. Each session's average {metric.toLowerCase()} was plotted over time.
        </p>
        <p>
          <span className="text-foreground font-medium">Method:</span>{" "}
          Ordinary Least Squares (OLS) regression — we draw the best-fit straight line through all your historical data points. This line tells us the direction and speed of change.
        </p>
        <p>
          <span className="text-foreground font-medium">What the line says:</span>{" "}
          {direction === "flat"
            ? `${metric} is stable — the line is nearly horizontal (change per session: ${reg.slope.toFixed(3)} ${unit}).`
            : `${metric} is ${direction} at ${slopeAbs.toFixed(3)} ${unit} per session. Over ${fmtHrs(avgHrsPerSession)} (1 session) that is ${(slopeAbs * (avgHrsPerSession / 24)).toFixed(3)} ${unit}/day.`}
        </p>
        <p>
          <span className="text-foreground font-medium">Current value:</span>{" "}
          {latest.toFixed(2)} {unit}
        </p>
        <p>
          <span className="text-foreground font-medium">Confidence (R² = {reg.r2.toFixed(3)}):</span>{" "}
          {r2Pct}% of the variation in your data follows this trend — {confidence} confidence.
          {confidence === "low" && " More sessions will improve accuracy."}
        </p>
        {thresholds.length > 0 && (
          <div>
            <span className="text-foreground font-medium">Time to threshold:</span>
            {thresholds.map(t => (
              <p key={t.label} className="pl-2">
                • {t.label} ({t.value} {unit}):{" "}
                {t.sessionsAway === null
                  ? "no trend in this direction"
                  : t.sessionsAway === 0
                  ? "already exceeded"
                  : `~${t.sessionsAway} session${t.sessionsAway !== 1 ? "s" : ""} away ≈ ${fmtHrs(t.sessionsAway * avgHrsPerSession)}`}
              </p>
            ))}
          </div>
        )}
        <p>
          <span className="text-foreground font-medium">Recommendation:</span>{" "}
          {action}
        </p>
      </div>
      <p className="text-[9px] text-muted-foreground/50 border-t border-border/40 pt-1">
        The dashed line on the chart extends the trend into the future — it assumes today's pattern continues unchanged.
        A flat or improving trend is good; a steep rising trend needs attention.
      </p>
    </div>
  );
}

// ─── Trend chart ──────────────────────────────────────────────────────────────

interface TrendChartProps {
  title: string;
  subtitle: string;
  yAxisLabel: string;
  unit: string;
  chartData: ReturnType<typeof buildChart>;
  areaColor: string;
  refLines?: { y: number; label: string; color: string }[];
  sessionCount: number;
  timeUnit?: TimeUnit;
}

function TrendChart({
  title, subtitle, yAxisLabel, unit, chartData, areaColor, refLines = [], sessionCount, timeUnit = "hours",
}: TrendChartProps) {
  const { data } = chartData;
  const futureStart = sessionCount > 0 ? data[sessionCount - 1]?.label : null;
  const unitLabel = UNIT_LABEL[timeUnit];

  return (
    <Card className="bg-card border-border flex flex-col">
      <CardHeader className="py-2 px-3 border-b border-border shrink-0">
        <CardTitle className="text-xs flex flex-col gap-0.5">
          <span className="font-semibold text-foreground">{title}</span>
          <span className="text-[9px] text-muted-foreground font-normal">{subtitle}</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-2 pt-3 flex-1">
        <ResponsiveContainer width="100%" height={200}>
          <ComposedChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 20 }}>
            <defs>
              <linearGradient id={`grad-${title}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor={areaColor} stopOpacity={0.25} />
                <stop offset="95%" stopColor={areaColor} stopOpacity={0} />
              </linearGradient>
            </defs>

            {/* Shade the projected region */}
            {futureStart && (
              <ReferenceArea
                x1={futureStart}
                fill="hsl(var(--muted))"
                fillOpacity={0.15}
                label={{ value: "projected →", position: "insideTopLeft", fontSize: 8, fill: "hsl(var(--muted-foreground))", opacity: 0.6 }}
              />
            )}

            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))", fontFamily: "var(--font-mono)" }}
              axisLine={false}
              tickLine={false}
              label={{
                value: `Time (${unitLabel}) ← past sessions | future projections →`,
                position: "insideBottom",
                fontSize: 8,
                fill: "hsl(var(--muted-foreground))",
                dy: 18,
              }}
            />
            <YAxis
              tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))", fontFamily: "var(--font-mono)" }}
              axisLine={false}
              tickLine={false}
              width={36}
              tickFormatter={formatAxisNumber}
              label={{
                value: yAxisLabel,
                angle: -90,
                position: "insideLeft",
                fontSize: 8,
                fill: "hsl(var(--muted-foreground))",
                dx: 8,
              }}
            />
            <Tooltip content={<ChartTip unit={unit} />} />
            <Legend
              wrapperStyle={{ fontSize: 9, fontFamily: "var(--font-mono)", paddingTop: 4 }}
              formatter={(value) =>
                value === "actual" ? "● Measured data" : "- - Trend (projected)"
              }
            />

            {refLines.map(rl => (
              <ReferenceLine
                key={rl.label}
                y={rl.y}
                stroke={rl.color}
                strokeDasharray="4 3"
                strokeOpacity={0.7}
                label={{
                  value: rl.label,
                  position: "insideTopRight",
                  fontSize: 8,
                  fill: rl.color,
                  opacity: 0.85,
                }}
              />
            ))}

            <Area
              type="monotone"
              dataKey="actual"
              name="actual"
              stroke={areaColor}
              strokeWidth={1.5}
              fill={`url(#grad-${title})`}
              dot={{ r: 2.5, fill: areaColor, strokeWidth: 0 }}
              connectNulls={false}
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="trend"
              name="trend"
              stroke="hsl(var(--muted-foreground))"
              strokeWidth={1}
              strokeDasharray="5 3"
              dot={false}
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

// ─── Analysis ─────────────────────────────────────────────────────────────────

function analyse(sessions: SessionStat[], tempWarn: number, tempCrit: number) {
  const last = sessions.length - 1;

  const tempReg = linReg(sessions.map((s, i) => ({ x: i, y: s.avgTemp })));
  const vibReg  = linReg(sessions.map((s, i) => ({ x: i, y: s.avgVibration })));
  const wobReg  = linReg(sessions.map((s, i) => ({ x: i, y: s.wobbleMag })));
  const cvReg   = linReg(sessions.map((s, i) => ({ x: i, y: s.rpmCv })));

  const latestTemp = sessions[last].avgTemp;
  const latestVib  = sessions[last].avgVibration;
  const latestWob  = sessions[last].wobbleMag;
  const latestCv   = sessions[last].rpmCv;

  const isoZone = latestVib < 2.3 ? "A" : latestVib < 4.5 ? "B" : latestVib < 7.1 ? "C" : "D";

  return {
    temp: {
      reg: tempReg, latest: latestTemp,
      warnIn: sessionsTo(tempReg, last, tempWarn),
      critIn: sessionsTo(tempReg, last, tempCrit),
      status:
        latestTemp >= tempCrit ? "Critical" :
        latestTemp >= tempWarn ? "Warning" :
        tempReg.slope > 0.3 ? `+${tempReg.slope.toFixed(2)}°/session` : "Stable",
      statusColor:
        latestTemp >= tempCrit ? "text-destructive" :
        latestTemp >= tempWarn ? "text-accent" : "text-chart-3",
      action:
        latestTemp >= tempCrit
          ? "Stop immediately. Check bearing friction and motor winding for heat buildup."
          : latestTemp >= tempWarn
          ? "Reduce duty cycle or improve ventilation before next session."
          : tempReg.slope > 0.3
          ? `Rising ${tempReg.slope.toFixed(2)}°C per session. Inspect cooling path.`
          : "Thermal system healthy.",
    },
    vib: {
      reg: vibReg, latest: latestVib, isoZone,
      zoneCIn: sessionsTo(vibReg, last, 4.5),
      zoneDIn: sessionsTo(vibReg, last, 7.1),
      status:
        isoZone === "D" ? "Zone D — danger" :
        isoZone === "C" ? "Zone C — alarm" :
        vibReg.slope > 0.05 ? `+${vibReg.slope.toFixed(3)}/session` :
        `Zone ${isoZone} — stable`,
      statusColor:
        isoZone === "D" ? "text-destructive" :
        isoZone === "C" ? "text-accent" :
        vibReg.slope > 0.05 ? "text-accent" : "text-chart-3",
      action:
        isoZone === "D"
          ? "Stop: Zone D reached. Immediate bearing inspection required."
          : isoZone === "C"
          ? "Zone C alarm. Schedule bearing inspection within 24 h. Do not increase RPM."
          : vibReg.slope > 0.1
          ? `Vibration rising ${vibReg.slope.toFixed(3)} mm/s per session. Check rotor balance.`
          : `Zone ${isoZone} — acceptable. Continue monitoring.`,
    },
    wob: {
      reg: wobReg, latest: latestWob,
      trend: wobReg.slope > 0.05 ? "Increasing" : wobReg.slope < -0.05 ? "Decreasing" : "Stable",
      status:
        latestWob > 5 ? "Severe" :
        latestWob > 2 ? "Elevated" :
        wobReg.slope > 0.05 ? "Growing" : "Normal",
      statusColor:
        latestWob > 5 ? "text-destructive" :
        latestWob > 2 ? "text-accent" :
        wobReg.slope > 0.05 ? "text-accent" : "text-chart-3",
      action:
        latestWob > 5
          ? "Severe precession. Stop and perform dynamic rotor balancing before resuming."
          : latestWob > 2
          ? "Moderate wobble. Plan rotor balance check at next maintenance window."
          : wobReg.slope > 0.05
          ? `Wobble growing +${wobReg.slope.toFixed(3)}°/session. Early imbalance. Plan balancing.`
          : "Rotor balance normal.",
    },
    cv: {
      reg: cvReg, latest: latestCv,
      trend:
        cvReg.slope > 0.2 ? "Degrading" :
        cvReg.slope < -0.2 ? "Improving" : "Stable",
      status:
        latestCv > 15 ? "High" :
        latestCv > 8  ? "Elevated" :
        latestCv > 3  ? "Moderate" : "Good",
      statusColor:
        latestCv > 15 ? "text-destructive" :
        latestCv > 8  ? "text-accent" :
        latestCv > 3  ? "text-chart-1" : "text-chart-3",
      action:
        latestCv > 15
          ? "High RPM variance. Check motor driver and PID gains urgently."
          : latestCv > 8
          ? "Elevated CV. Consider increasing Ki (integral gain) by 10–20%."
          : latestCv > 3
          ? "Mild instability. Monitor over next sessions; may settle at thermal equilibrium."
          : "Controller holding speed well. PID appears well-tuned.",
    },
    pid: (() => {
      if (latestCv > 10 && latestWob > 2) return "Both RPM CV and wobble are high. Full PID retune recommended — Ziegler–Nichols method. Also inspect rotor balance before tuning.";
      if (latestCv > 10) return `RPM CV ${latestCv.toFixed(1)}% — steady-state error. Increase Ki (integral gain) by 10–20% and observe settling.`;
      if (latestWob > 2 && latestCv < 5) return "High wobble with stable RPM — mechanical imbalance, not a PID issue. Increasing Kd will not help; focus on rotor balancing.";
      if (wobReg.slope > 0.05) return "Wobble increasing session-over-session. Progressive imbalance developing. Physical inspection recommended.";
      return "RPM CV and wobble within acceptable range. No PID or balance changes needed.";
    })(),
  };
}

// ─── Engineering RUL — ISO 281, SKF Arrhenius, Palmgren-Miner, Weibull ────────

interface BearingConfig {
  C: number;           // Dynamic load rating (N)
  dm: number;          // Pitch diameter mm = (bore + OD) / 2
  t_f0: number;        // Base grease life at 40 °C (h)
  weibullBeta: number; // Weibull shape parameter (3.5 = typical rolling-element fatigue)
  rotorMass: number;   // Estimated rotor mass (kg) — used for vibration-to-load conversion
}

const DEFAULT_BEARING: BearingConfig = {
  C: 14_000,     // 6205-2RS: 14 kN
  dm: 38.5,      // (25 bore + 52 OD) / 2
  t_f0: 5_000,   // h at 40 °C for Li-grease in a small deep-groove ball bearing
  weibullBeta: 3.5,
  rotorMass: 0.5,
};

function computeEngineeringRUL(
  sessions: SessionStat[],
  config: BearingConfig,
  targetRpm: number,
) {
  const { C, dm, t_f0, weibullBeta, rotorMass } = config;

  let totalHours = 0;
  let totalDamage = 0;
  let weightedTempSum = 0;
  let weightedTempWeight = 0;

  for (const s of sessions) {
    // Approximate session hours from reading count (1 reading ≈ 1 s)
    const sessionHours = s.readingCount > 0 ? s.readingCount / 3600 : 1;
    const n  = s.avgRpm > 0 ? s.avgRpm : s.targetRpm || targetRpm;
    const T  = s.avgTemp > 0 ? s.avgTemp : 25;
    const vib = s.avgVibration;

    // Equivalent dynamic load P (N) — ISO 281 §5
    // Vibration velocity → force: F = m · ω · v_rms (simplified from v = ω·e imbalance model)
    const omega  = (2 * Math.PI * n) / 60;
    const F_vib  = rotorMass * omega * (vib / 1000); // vib mm/s → m/s
    const P_min  = 0.02 * C; // ISO 281 minimum load (2 %) to avoid skidding
    const P      = Math.max(P_min, F_vib);

    // Speed factor for grease (SKF bearing catalogue §9)
    // ndm < 150 000: no penalty; 150 000–750 000: linear reduction; > 750 000: ~0.2
    const ndm         = n * dm;
    const speedFactor = ndm < 150_000 ? 1.0 : ndm < 750_000 ? 150_000 / ndm : 0.2;

    // L10h for this session's conditions (Lundberg-Palmgren, ISO 281)
    // L10h = (10^6 / (60·n)) · (C/P)^3 · speed_factor
    const L10h = (1_000_000 / (60 * n)) * Math.pow(C / P, 3) * speedFactor;

    // Palmgren-Miner damage fraction
    totalDamage += sessionHours / L10h;
    totalHours  += sessionHours;
    weightedTempSum    += T * sessionHours;
    weightedTempWeight += sessionHours;
  }

  const weightedAvgTemp = weightedTempWeight > 0
    ? weightedTempSum / weightedTempWeight : 25;

  // Reference conditions for RUL projection (use sessions average, or settings targetRpm)
  const avgRpmOverall = sessions.length > 0
    ? sessions.reduce((s, ss) => s + (ss.avgRpm > 0 ? ss.avgRpm : ss.targetRpm || targetRpm), 0) / sessions.length
    : targetRpm;

  // Reference L10h at current average conditions (P at minimum load — typical for light rig)
  const refOmega       = (2 * Math.PI * avgRpmOverall) / 60;
  const refP           = Math.max(0.02 * C, rotorMass * refOmega * 0.001); // assume 1 mm/s baseline vib
  const refNdm         = avgRpmOverall * dm;
  const refSpeedFactor = refNdm < 150_000 ? 1.0 : refNdm < 750_000 ? 150_000 / refNdm : 0.2;
  const referenceL10h  = (1_000_000 / (60 * avgRpmOverall)) * Math.pow(C / refP, 3) * refSpeedFactor;

  // Fatigue RUL via Palmgren-Miner residual life
  const damageFraction = Math.min(1, totalDamage);
  const fatigueRUL     = Math.max(0, referenceL10h * (1 - damageFraction));

  // Grease life — SKF Arrhenius thermal model
  const greaseSpeedFactor = refNdm < 150_000 ? 1.0 : refNdm < 750_000 ? 150_000 / refNdm : 0.2;
  const greaseTempFactor  = Math.pow(0.5, Math.max(0, (weightedAvgTemp - 40) / 15));
  const greaseLifeTotal   = t_f0 * greaseTempFactor * greaseSpeedFactor;
  const greaseRUL         = Math.max(0, greaseLifeTotal - totalHours);

  // Weibull failure probability at accumulated hours
  // Characteristic life η converts L10h to Weibull η: η = L10h / (-ln 0.9)^(1/β)
  const eta = referenceL10h / Math.pow(-Math.log(0.9), 1 / weibullBeta);
  const failureProbability = totalHours > 0
    ? (1 - Math.exp(-Math.pow(totalHours / eta, weibullBeta))) * 100 : 0;

  // Composite health score: 40 % fatigue residual, 60 % grease residual
  const healthFatigue = (1 - damageFraction) * 100;
  const healthGrease  = greaseLifeTotal > 0 ? (greaseRUL / greaseLifeTotal) * 100 : 100;
  const healthScore   = Math.max(0, Math.min(100, healthFatigue * 0.4 + healthGrease * 0.6));

  return {
    totalHours, weightedAvgTemp, avgRpmOverall, damageFraction,
    damagePercent: damageFraction * 100,
    fatigueRUL, greaseLifeTotal, greaseRUL, referenceL10h,
    combinedRUL: Math.min(fatigueRUL, greaseRUL),
    failureProbability, healthScore,
    greaseSpeedFactor, greaseTempFactor,
    // Exposed purely so the "how is this calculated" panel can show the
    // exact intermediate numbers that feed the Weibull failure-probability curve.
    refP, refNdm, weibullEta: eta,
    preOperational: sessions.length === 0,
  };
}

function rulLabel(h: number): string {
  if (h > 200_000) return "> 200 000 h";
  if (h < 0.5)    return "< 1 h";
  if (h < 100)    return `${h.toFixed(1)} h`;
  return `${Math.round(h).toLocaleString()} h`;
}

function RULExplanationPanel({
  rul, config, targetRpm,
}: {
  rul: ReturnType<typeof computeEngineeringRUL>;
  config: BearingConfig;
  targetRpm: number;
}) {
  const { C, dm, t_f0, weibullBeta, rotorMass } = config;
  const greasePct = rul.greaseLifeTotal > 0
    ? (1 - rul.greaseRUL / rul.greaseLifeTotal) * 100 : 0;

  return (
    <div className="mt-2 rounded-lg border border-border bg-muted/10 p-4 space-y-4 text-[11px] leading-relaxed">
      <p className="font-semibold text-foreground text-[12px]">How the Engineering RUL numbers are calculated</p>
      <p className="text-muted-foreground">
        Every figure below is derived from standard bearing-life engineering models — nothing is guessed.
        {rul.preOperational
          ? " No sessions have run yet, so these are design-life estimates computed at your configured bearing (below) and target RPM."
          : ` Computed from ${rul.totalHours.toFixed(2)} h of accumulated operating data across all recorded sessions.`}
      </p>

      {/* 1. Equivalent dynamic load */}
      <div className="space-y-1 border-t border-border/40 pt-3">
        <p className="text-foreground font-medium">1. Equivalent dynamic load (P)</p>
        <p className="text-muted-foreground">
          Vibration velocity is converted to an equivalent radial force using the rotor's mass and angular speed:
        </p>
        <p className="font-mono text-[10px] bg-background/60 border border-border/50 rounded px-2 py-1.5">
          ω = 2π·n / 60 &nbsp;·&nbsp; F_vib = m · ω · (v_rms / 1000) &nbsp;·&nbsp; P = max(0.02·C, F_vib)
        </p>
        <p className="text-muted-foreground">
          n = shaft speed (rpm), m = rotor mass ({rotorMass} kg), v_rms = vibration (mm/s), C = dynamic load rating ({C.toLocaleString()} N).
          The 0.02·C floor is the ISO 281 §5 minimum load needed to prevent ball skidding.
        </p>
        <p className="text-[10px] text-muted-foreground/70">
          At avg RPM {Math.round(rul.avgRpmOverall).toLocaleString()}: P ≈ {Math.round(rul.refP).toLocaleString()} N
          (n·dm = {Math.round(rul.refNdm).toLocaleString()} mm·rpm, dm = {dm} mm).
        </p>
      </div>

      {/* 2. Fatigue life / Palmgren-Miner */}
      <div className="space-y-1 border-t border-border/40 pt-3">
        <p className="text-foreground font-medium">2. Bearing fatigue life — ISO 281 + Palmgren-Miner</p>
        <p className="text-muted-foreground">
          The Lundberg-Palmgren basic rating life (ISO 281) gives the hours at which 90% of identical bearings
          survive under load P, adjusted by a grease speed factor:
        </p>
        <p className="font-mono text-[10px] bg-background/60 border border-border/50 rounded px-2 py-1.5">
          L10h = (10⁶ / (60·n)) · (C / P)³ · speed_factor
        </p>
        <p className="text-muted-foreground">
          Each session consumes a fraction of that life (hours ÷ L10h for that session's conditions). The
          Palmgren-Miner rule sums these fractions across every session into one cumulative damage number —
          this is how fatigue from many different speeds/temperatures/loads gets combined into a single track record:
        </p>
        <p className="font-mono text-[10px] bg-background/60 border border-border/50 rounded px-2 py-1.5">
          damage = Σ (session hours / L10h at that session's conditions)
        </p>
        <p className="text-muted-foreground">Remaining fatigue life is the reference L10h scaled by what's left:</p>
        <p className="font-mono text-[10px] bg-background/60 border border-border/50 rounded px-2 py-1.5">
          fatigue RUL = reference L10h × (1 − damage)
        </p>
        <p className="text-[10px] text-muted-foreground/70">
          Reference L10h at current avg conditions ≈ {Math.round(rul.referenceL10h).toLocaleString()} h ·
          damage consumed so far = {rul.damagePercent < 0.001 ? "< 0.001" : rul.damagePercent.toFixed(4)}% ·
          fatigue RUL = {rulLabel(rul.fatigueRUL)}.
        </p>
      </div>

      {/* 3. Grease life / SKF Arrhenius */}
      <div className="space-y-1 border-t border-border/40 pt-3">
        <p className="text-foreground font-medium">3. Grease relubrication interval — SKF Arrhenius thermal model</p>
        <p className="text-muted-foreground">
          Grease breaks down chemically roughly twice as fast for every 15°C above a 40°C baseline (an
          Arrhenius-type thermal degradation rule used in SKF's bearing catalogue), and is further discounted
          by the same speed factor used above:
        </p>
        <p className="font-mono text-[10px] bg-background/60 border border-border/50 rounded px-2 py-1.5">
          temp_factor = 0.5^((T − 40) / 15) &nbsp;·&nbsp; grease life = t_f0 · temp_factor · speed_factor
        </p>
        <p className="text-muted-foreground">
          T = weighted-average bearing temperature ({rul.weightedAvgTemp.toFixed(1)} °C), t_f0 = base grease life
          at 40°C for this grease/bearing ({t_f0.toLocaleString()} h, configurable below).
        </p>
        <p className="font-mono text-[10px] bg-background/60 border border-border/50 rounded px-2 py-1.5">
          grease RUL = grease life − hours already operated
        </p>
        <p className="text-[10px] text-muted-foreground/70">
          temp factor = {(rul.greaseTempFactor * 100).toFixed(0)}% · speed factor = {(rul.greaseSpeedFactor * 100).toFixed(0)}% ·
          total design grease life ≈ {Math.round(rul.greaseLifeTotal).toLocaleString()} h ·
          {" "}{greasePct.toFixed(2)}% already consumed · grease RUL = {rulLabel(rul.greaseRUL)}.
        </p>
      </div>

      {/* 4. Weibull failure probability */}
      <div className="space-y-1 border-t border-border/40 pt-3">
        <p className="text-foreground font-medium">4. Failure probability — 2-parameter Weibull distribution</p>
        <p className="text-muted-foreground">
          Bearing failures follow a Weibull distribution far more accurately than a straight-line average, because
          fatigue failure risk accelerates with age rather than staying constant. The characteristic life η (the age
          at which ~63.2% of bearings have failed) is derived from the L10 life and shape parameter β
          ({weibullBeta} — typical for rolling-element fatigue):
        </p>
        <p className="font-mono text-[10px] bg-background/60 border border-border/50 rounded px-2 py-1.5">
          η = L10h / (−ln 0.9)^(1/β) &nbsp;·&nbsp; F(t) = 1 − exp(−(t / η)^β)
        </p>
        <p className="text-muted-foreground">
          F(t) is the probability the bearing has already failed by the current accumulated running time t.
        </p>
        <p className="text-[10px] text-muted-foreground/70">
          η ≈ {Math.round(rul.weibullEta).toLocaleString()} h · t = {rul.totalHours.toFixed(2)} h ·
          F(t) = {rul.failureProbability < 0.001 ? "< 0.001" : rul.failureProbability.toFixed(3)}%.
        </p>
      </div>

      {/* 5. Composite health score */}
      <div className="space-y-1 border-t border-border/40 pt-3">
        <p className="text-foreground font-medium">5. Composite health score</p>
        <p className="text-muted-foreground">
          A single at-a-glance number combining both remaining-life tracks — weighted so lubrication (which
          fails more often in practice than the bearing steel itself) counts for more:
        </p>
        <p className="font-mono text-[10px] bg-background/60 border border-border/50 rounded px-2 py-1.5">
          health = (1 − damage) × 100 × 0.4 &nbsp;+&nbsp; (grease RUL / grease life) × 100 × 0.6
        </p>
        <p className="text-[10px] text-muted-foreground/70">
          health score = {Math.round(rul.healthScore)}% (target RPM {Math.round(targetRpm).toLocaleString()},
          bearing C = {C.toLocaleString()} N / dm = {dm} mm).
        </p>
      </div>

      <p className="text-[9px] text-muted-foreground/50 border-t border-border/40 pt-2">
        Adjust the bearing parameters (dynamic load rating, pitch diameter, base grease life, rotor mass) using the
        bearing button above to match your actual hardware — every formula here recomputes live from those values.
      </p>
    </div>
  );
}

function EngineeringRULPanel({
  rul, config, onConfigChange, targetRpm,
}: {
  rul: ReturnType<typeof computeEngineeringRUL>;
  config: BearingConfig;
  onConfigChange: (c: Partial<BearingConfig>) => void;
  targetRpm: number;
}) {
  const [showConfig, setShowConfig] = useState(false);
  const [showExplain, setShowExplain] = useState(false);

  const healthColor =
    rul.healthScore > 70 ? "text-chart-3" :
    rul.healthScore > 40 ? "text-accent"  : "text-destructive";

  const greasePct = rul.greaseLifeTotal > 0
    ? (1 - rul.greaseRUL / rul.greaseLifeTotal) * 100 : 0;

  function Field({ label, value, onChange, step = 1 }: {
    label: string; value: number; onChange: (v: number) => void; step?: number;
  }) {
    return (
      <div className="space-y-1">
        <p className="text-[9px] text-muted-foreground font-mono">{label}</p>
        <input
          type="number"
          step={step}
          value={value}
          onChange={e => onChange(Number(e.target.value))}
          className="w-24 h-7 px-2 text-[11px] font-mono bg-background border border-border rounded text-foreground"
        />
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-muted/20">
        <div className="flex items-center gap-2 min-w-0">
          <Activity className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
          <span className="text-[11px] font-semibold text-foreground">Engineering RUL</span>
          <span className="text-[9px] text-muted-foreground font-mono hidden md:inline truncate">
            ISO 281 · SKF Arrhenius · Palmgren-Miner · Weibull
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {rul.preOperational && (
            <span className="text-[9px] font-mono bg-muted/40 text-muted-foreground px-2 py-0.5 rounded border border-border">
              pre-operational — design-life estimate
            </span>
          )}
          <button
            onClick={() => setShowConfig(v => !v)}
            className="flex items-center gap-1 text-[9px] font-mono px-2 py-0.5 rounded border border-border text-muted-foreground hover:text-foreground hover:bg-muted/20 transition-colors"
          >
            <Settings2 className="w-2.5 h-2.5" />
            {config.C === DEFAULT_BEARING.C ? "6205-2RS" : "custom"}
            {showConfig ? <ChevronUp className="w-2.5 h-2.5" /> : <ChevronDown className="w-2.5 h-2.5" />}
          </button>
          <button
            onClick={() => setShowExplain(v => !v)}
            title="How is this calculated?"
            className={`flex items-center gap-1 text-[9px] font-mono px-2 py-0.5 rounded border transition-colors ${
              showExplain
                ? "border-primary text-primary bg-primary/10"
                : "border-border text-muted-foreground hover:text-foreground hover:bg-muted/20"
            }`}
          >
            {showExplain
              ? <><X className="w-2.5 h-2.5" /> Close</>
              : <><HelpCircle className="w-2.5 h-2.5" /> How is this calculated?</>
            }
          </button>
        </div>
      </div>

      {/* Bearing config */}
      {showConfig && (
        <div className="px-4 py-3 border-b border-border bg-muted/10 flex flex-wrap gap-4">
          <Field label="Dynamic load C (N)" value={config.C}      onChange={v => onConfigChange({ C: v })} step={100} />
          <Field label="Pitch diam dm (mm)"  value={config.dm}     onChange={v => onConfigChange({ dm: v })} step={0.5} />
          <Field label="Base grease life (h)" value={config.t_f0}  onChange={v => onConfigChange({ t_f0: v })} step={500} />
          <Field label="Rotor mass (kg)"      value={config.rotorMass} onChange={v => onConfigChange({ rotorMass: v })} step={0.1} />
          <div className="text-[9px] text-muted-foreground space-y-0.5 font-mono self-end pb-0.5">
            <p className="text-foreground font-semibold text-[10px]">Common bearings:</p>
            <p>6202: C=7 650 N, dm=24.5 mm</p>
            <p>6205: C=14 000 N, dm=38.5 mm ← default</p>
            <p>6208: C=29 500 N, dm=58.5 mm</p>
          </div>
        </div>
      )}

      {/* Main 4-metric row */}
      <div className="grid grid-cols-2 md:grid-cols-4 divide-y md:divide-y-0 divide-x-0 md:divide-x divide-border">
        {/* Health */}
        <div className="px-4 py-3 space-y-1">
          <p className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">Health Score</p>
          <p className={`text-2xl font-bold font-mono ${healthColor}`}>{Math.round(rul.healthScore)}%</p>
          <p className="text-[9px] text-muted-foreground">fatigue 40 % · grease 60 %</p>
        </div>
        {/* Fatigue RUL */}
        <div className="px-4 py-3 space-y-1">
          <p className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">Bearing Fatigue RUL</p>
          <p className="text-lg font-bold font-mono text-foreground">{rulLabel(rul.fatigueRUL)}</p>
          <p className="text-[9px] text-muted-foreground">
            L10 = {Math.round(rul.referenceL10h).toLocaleString()} h · damage {rul.damagePercent < 0.001 ? "< 0.001" : rul.damagePercent.toFixed(4)}%
          </p>
          <p className="text-[9px] text-muted-foreground/50">ISO 281 + Palmgren-Miner</p>
        </div>
        {/* Grease RUL */}
        <div className="px-4 py-3 space-y-1">
          <p className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">Grease Relubrication In</p>
          <p className="text-lg font-bold font-mono text-foreground">{rulLabel(rul.greaseRUL)}</p>
          <p className="text-[9px] text-muted-foreground">
            design grease life: {Math.round(rul.greaseLifeTotal).toLocaleString()} h
          </p>
          <p className="text-[9px] text-muted-foreground/50">SKF Arrhenius — 15 °C halving rule</p>
        </div>
        {/* Weibull */}
        <div className="px-4 py-3 space-y-1">
          <p className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">Failure Probability</p>
          <p className={`text-lg font-bold font-mono ${rul.failureProbability > 10 ? "text-destructive" : rul.failureProbability > 2 ? "text-accent" : "text-chart-3"}`}>
            {rul.failureProbability < 0.001 ? "< 0.001" : rul.failureProbability.toFixed(3)}%
          </p>
          <p className="text-[9px] text-muted-foreground">
            at {rul.totalHours.toFixed(1)} h · η={Math.round(rul.referenceL10h * 1.29).toLocaleString()} h
          </p>
          <p className="text-[9px] text-muted-foreground/50">2-parameter Weibull β={config.weibullBeta}</p>
        </div>
      </div>

      {/* Progress bars */}
      <div className="px-4 py-2 border-t border-border space-y-2">
        <div className="space-y-0.5">
          <div className="flex justify-between text-[9px] font-mono text-muted-foreground">
            <span>Bearing fatigue damage (Palmgren-Miner rule)</span>
            <span>{rul.damagePercent < 0.001 ? "< 0.001" : rul.damagePercent.toFixed(4)}% consumed</span>
          </div>
          <div className="h-1.5 rounded-full bg-muted overflow-hidden">
            <div
              className={`h-full rounded-full ${rul.damageFraction > 0.8 ? "bg-destructive" : rul.damageFraction > 0.5 ? "bg-accent" : "bg-chart-3"}`}
              style={{ width: `${Math.max(0.3, Math.min(100, rul.damageFraction * 100))}%` }}
            />
          </div>
        </div>
        <div className="space-y-0.5">
          <div className="flex justify-between text-[9px] font-mono text-muted-foreground">
            <span>Grease life consumed (SKF thermal model)</span>
            <span>{greasePct.toFixed(2)}% consumed</span>
          </div>
          <div className="h-1.5 rounded-full bg-muted overflow-hidden">
            <div
              className={`h-full rounded-full ${greasePct > 80 ? "bg-destructive" : greasePct > 50 ? "bg-accent" : "bg-chart-3"}`}
              style={{ width: `${Math.max(0.3, Math.min(100, greasePct))}%` }}
            />
          </div>
        </div>
      </div>

      {/* Operating conditions footer */}
      <div className="px-4 py-1.5 border-t border-border flex flex-wrap gap-x-6 gap-y-0.5 text-[9px] font-mono text-muted-foreground">
        <span>target RPM: <span className="text-foreground">{Math.round(targetRpm).toLocaleString()}</span></span>
        <span>avg RPM: <span className="text-foreground">{Math.round(rul.avgRpmOverall).toLocaleString()}</span></span>
        <span>n·dm: <span className="text-foreground">{Math.round(rul.avgRpmOverall * config.dm).toLocaleString()} mm·rpm</span></span>
        <span>speed factor: <span className="text-foreground">{(rul.greaseSpeedFactor * 100).toFixed(0)}%</span></span>
        <span>weighted avg T: <span className="text-foreground">{rul.weightedAvgTemp.toFixed(1)} °C</span></span>
        <span>T factor: <span className="text-foreground">{(rul.greaseTempFactor * 100).toFixed(0)}%</span></span>
        <span>total operated: <span className="text-foreground">{rul.totalHours.toFixed(2)} h</span></span>
      </div>

      {showExplain && (
        <div className="px-4 pb-4">
          <RULExplanationPanel rul={rul} config={config} targetRpm={targetRpm} />
        </div>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function Predictions() {
  const [avgHrsPerSession, setAvgHrsPerSession] = useState(24);
  const [timeUnit, setTimeUnit] = useState<TimeUnit>("hours");
  const [openExplanation, setOpenExplanation] = useState<string | null>(null);
  const [noDataBannerDismissed, setNoDataBannerDismissed] = useState(false);

  const { data: sessions, isLoading, isError } = useQuery<SessionStat[]>({
    queryKey: ["analytics-sessions"],
    queryFn: async () => {
      const res = await fetch(apiUrl("/api/analytics/sessions"));
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    refetchInterval: 30000,
  });

  const [bearingConfig, setBearingConfig] = useState<BearingConfig>(DEFAULT_BEARING);

  const { data: settings } = useGetSettings({
    query: { refetchInterval: 30000, queryKey: getGetSettingsQueryKey() },
  });
  const tempWarn  = settings?.tempWarnThreshold ?? 55;
  const tempCrit  = settings?.tempCritThreshold ?? 65;
  const targetRpm = settings?.targetRpm ?? 8000;

  const { data: connectivity } = useGetConnectivity({
    query: { refetchInterval: 5000, queryKey: getGetConnectivityQueryKey() },
  });
  const isConnected = connectivity?.connected ?? false;

  const engineeringRUL = useMemo(
    () => computeEngineeringRUL(sessions ?? [], bearingConfig, targetRpm),
    [sessions, bearingConfig, targetRpm],
  );

  const result = useMemo(() => {
    if (!sessions || sessions.length < 1) return null;
    const a = analyse(sessions, tempWarn, tempCrit);
    return {
      a,
      tempChart: buildChart(sessions, s => s.avgTemp,      4, avgHrsPerSession, timeUnit),
      vibChart:  buildChart(sessions, s => s.avgVibration, 4, avgHrsPerSession, timeUnit),
      wobChart:  buildChart(sessions, s => s.wobbleMag,    4, avgHrsPerSession, timeUnit),
      cvChart:   buildChart(sessions, s => s.rpmCv,        4, avgHrsPerSession, timeUnit),
    };
  }, [sessions, tempWarn, tempCrit, avgHrsPerSession, timeUnit]);

  const last = sessions?.[sessions.length - 1];
  const n = sessions?.length ?? 0;

  const toggleExplanation = (key: string) =>
    setOpenExplanation(prev => (prev === key ? null : key));

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      {/* Header */}
      <header className="h-12 shrink-0 border-b border-border px-4 flex items-center justify-between bg-card">
        <div className="flex items-center gap-3">
          <Link href="/">
            <button className="flex items-center gap-1.5 text-[10px] font-mono px-2 py-1 rounded border border-border text-muted-foreground hover:text-foreground hover:bg-muted/20 transition-colors">
              <ArrowLeft className="w-3 h-3" />
              Dashboard
            </button>
          </Link>
          <TrendingUp className="w-4 h-4 text-muted-foreground" />
          <h1 className="text-sm font-semibold">Predictive Analytics</h1>
          <span className="text-muted-foreground text-xs hidden sm:inline">· Copperbelt University</span>
        </div>
        {last && (
          <div className="flex items-center gap-4 text-[10px] font-mono text-muted-foreground">
            <span>{n} sessions</span>
            <span>last: <span className="text-foreground">#{last.sessionId}</span></span>
            <span>avg temp: <span className="text-foreground">{last.avgTemp.toFixed(1)}°C</span></span>
            <span>vib: <span className="text-foreground">{last.avgVibration.toFixed(2)} mm/s</span></span>
          </div>
        )}
      </header>

      <main className="flex-1 p-4 overflow-auto space-y-4">

        {/* ── Engineering RUL — always visible, even pre-operationally ── */}
        {!isLoading && !isError && (
          <EngineeringRULPanel
            rul={engineeringRUL}
            config={bearingConfig}
            onConfigChange={patch => setBearingConfig(prev => ({ ...prev, ...patch }))}
            targetRpm={targetRpm}
          />
        )}

        {isLoading && (
          <p className="text-[10px] font-mono text-muted-foreground p-4">Computing session analytics…</p>
        )}
        {isError && (
          <p className="text-[10px] font-mono text-destructive p-4">Failed to load analytics.</p>
        )}
        {sessions && sessions.length === 0 && !isConnected && !noDataBannerDismissed && (
          <div className="max-w-2xl mx-auto mt-8 rounded-lg border border-border bg-card p-6 space-y-4 relative">
            <button
              onClick={() => setNoDataBannerDismissed(true)}
              title="Close"
              aria-label="Close"
              className="absolute top-3 right-3 p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted/20 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
            <div className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-muted-foreground" />
              <span className="text-sm font-semibold text-foreground">No session data yet</span>
            </div>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              Predictive analytics need at least <span className="text-foreground font-semibold">one completed session</span> with
              5 or more sensor readings. As you run more sessions, the system will plot trends and predict
              when each metric (temperature, vibration, wobble, RPM stability) is likely to reach a warning or critical threshold.
            </p>
            <div className="rounded-lg border border-border bg-muted/20 p-3 space-y-1.5 text-[10px] font-mono">
              <p className="text-foreground font-semibold font-sans text-[11px] mb-2">To get started:</p>
              <p>① Connect the ESP32 via USB</p>
              <p>② Start a session from the dashboard with your target RPM</p>
              <p>③ Let it run — readings are stored every second</p>
              <p>④ Stop the session — it will appear here once it has ≥ 5 readings</p>
              <p>⑤ Run more sessions over time — predictions improve with each one</p>
            </div>
            <p className="text-[9px] text-muted-foreground/60">
              Analysis tracks: bearing temperature · vibration (mm/s · ISO 10816-3) · rotor wobble · RPM controller stability (CV%)
            </p>
          </div>
        )}

        {sessions && sessions.length === 0 && !isConnected && noDataBannerDismissed && (
          <div className="max-w-6xl mx-auto space-y-4">
            <p className="text-[9px] font-mono text-muted-foreground/60 uppercase tracking-wider text-center">
              Template view — no recorded sessions yet, nothing below is real data
            </p>
            <div className="grid grid-cols-2 gap-3">
              {[
                { title: "Temperature over sessions", sub: "°C" },
                { title: "Vibration over sessions (ISO 10816-3)", sub: "mm/s" },
                { title: "Rotor wobble (precession) over sessions", sub: "deg" },
                { title: "RPM controller stability (CV%) over sessions", sub: "CV%" },
              ].map(({ title, sub }) => (
                <div key={title} className="bg-card border border-border rounded-lg p-3 h-56 flex flex-col">
                  <p className="text-[10px] font-semibold text-foreground">{title}</p>
                  <p className="text-[9px] text-muted-foreground mb-2">Y-axis: {sub}</p>
                  <div className="flex-1 flex items-center justify-center text-[10px] font-mono text-muted-foreground/50 border border-dashed border-border rounded">
                    No data yet
                  </div>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-3 gap-3">
              {["When will thresholds be reached?", "Condition assessment", "PID & maintenance"].map(title => (
                <div key={title} className="bg-card border border-border rounded-lg p-3 space-y-2">
                  <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">{title}</span>
                  <p className="text-[10px] text-muted-foreground/50 font-mono py-4 text-center">Awaiting session data…</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {result && (
          <div className="max-w-6xl mx-auto space-y-4">

            {/* Single-session notice */}
            {n === 1 && (
              <div className="rounded-lg border border-border bg-muted/10 px-3 py-2 text-[10px] font-mono text-muted-foreground">
                <span className="text-foreground font-semibold">1 session recorded.</span>{" "}
                Trend lines below show your current baseline with a flat projection. Complete more sessions to unlock real trend analysis and accurate predictions.
              </div>
            )}

            {/* Session duration control */}
            <div className="flex items-center gap-3 bg-card border border-border rounded-lg px-3 py-2">
              <Clock className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
              <span className="text-[10px] text-muted-foreground font-mono">
                Avg session duration:
              </span>
              {[4, 8, 12, 24, 48].map(h => (
                <button
                  key={h}
                  onClick={() => setAvgHrsPerSession(h)}
                  className={`text-[10px] font-mono px-2 py-0.5 rounded border transition-colors ${
                    avgHrsPerSession === h
                      ? "border-primary text-primary bg-primary/10"
                      : "border-border text-muted-foreground hover:text-foreground hover:bg-muted/20"
                  }`}
                >
                  {h}h
                </button>
              ))}
              <span className="text-[9px] text-muted-foreground/60 ml-1">
                {fmtHrs(avgHrsPerSession)}/session
              </span>
            </div>

            {/* Time unit selector */}
            <div className="flex items-center gap-3 bg-card border border-border rounded-lg px-3 py-2">
              <span className="text-[10px] text-muted-foreground font-mono">
                X-axis time unit:
              </span>
              {(["seconds", "minutes", "hours", "days"] as TimeUnit[]).map(u => (
                <button
                  key={u}
                  onClick={() => setTimeUnit(u)}
                  className={`text-[10px] font-mono px-2 py-0.5 rounded border transition-colors capitalize ${
                    timeUnit === u
                      ? "border-primary text-primary bg-primary/10"
                      : "border-border text-muted-foreground hover:text-foreground hover:bg-muted/20"
                  }`}
                >
                  {u}
                </button>
              ))}
            </div>

            {/* Charts — 2 × 2 */}
            <div className="grid grid-cols-2 gap-3">
              <TrendChart
                title="Temperature over sessions"
                subtitle={`Y-axis: avg bearing temperature (°C)`}
                yAxisLabel="°C"
                unit="°C"
                chartData={result.tempChart}
                areaColor="hsl(var(--chart-5))"
                sessionCount={n}
                timeUnit={timeUnit}
                refLines={[
                  { y: tempWarn, label: `⚠ warn ${tempWarn}°C — reduce load`, color: "hsl(var(--accent))" },
                  { y: tempCrit, label: `✕ crit ${tempCrit}°C — stop now`,   color: "hsl(var(--destructive))" },
                ]}
              />
              <TrendChart
                title="Vibration over sessions (ISO 10816-3)"
                subtitle={`Y-axis: avg vibration in mm/s RMS  ·  Zones A (best) → D (danger)`}
                yAxisLabel="mm/s"
                unit="mm/s"
                chartData={result.vibChart}
                areaColor="hsl(var(--chart-2))"
                sessionCount={n}
                timeUnit={timeUnit}
                refLines={[
                  { y: 2.3, label: "Zone A→B",                              color: "hsl(var(--chart-3))" },
                  { y: 4.5, label: "Zone B→C — schedule inspection",        color: "hsl(var(--accent))" },
                  { y: 7.1, label: "Zone C→D — bearing danger",             color: "hsl(var(--destructive))" },
                ]}
              />
              <TrendChart
                title="Rotor wobble (precession) over sessions"
                subtitle={`Y-axis: wobble magnitude in degrees  ·  Above 2°: inspect rotor balance`}
                yAxisLabel="deg"
                unit="°"
                chartData={result.wobChart}
                areaColor="hsl(var(--chart-4))"
                sessionCount={n}
                timeUnit={timeUnit}
                refLines={[
                  { y: 2, label: "2° — inspect balance", color: "hsl(var(--accent))" },
                  { y: 5, label: "5° — critical wobble", color: "hsl(var(--destructive))" },
                ]}
              />
              <TrendChart
                title="RPM controller stability (CV%) over sessions"
                subtitle={`Y-axis: coefficient of variation (% spread around target RPM)  ·  Lower = more stable`}
                yAxisLabel="CV%"
                unit="%"
                chartData={result.cvChart}
                areaColor="hsl(var(--chart-3))"
                sessionCount={n}
                timeUnit={timeUnit}
                refLines={[
                  { y: 5,  label: "5% — watch",  color: "hsl(var(--accent))" },
                  { y: 10, label: "10% — retune PID", color: "hsl(var(--destructive))" },
                ]}
              />
            </div>

            {/* Analysis row */}
            <div className="grid grid-cols-3 gap-3">

              {/* Intervention horizon */}
              <div className="bg-card border border-border rounded-lg p-3 space-y-2">
                <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                  When will thresholds be reached?
                </span>
                <div className="space-y-1.5">
                  {[
                    { label: "Temp → warn",    val: result.a.temp.warnIn, color: result.a.temp.warnIn === 0 ? "text-accent" : "text-foreground" },
                    { label: "Temp → critical",val: result.a.temp.critIn, color: result.a.temp.critIn === 0 ? "text-destructive" : "text-foreground" },
                    { label: "Vib → Zone C",   val: result.a.vib.zoneCIn, color: result.a.vib.zoneCIn === 0 ? "text-accent" : "text-foreground" },
                    { label: "Vib → Zone D",   val: result.a.vib.zoneDIn, color: result.a.vib.zoneDIn === 0 ? "text-destructive" : "text-foreground" },
                  ].map(({ label, val, color }) => (
                    <div key={label} className="flex justify-between items-start border-b border-border/40 last:border-0 pb-1.5 last:pb-0 gap-2">
                      <span className="text-[10px] text-muted-foreground shrink-0">{label}</span>
                      <span className={`text-[10px] font-mono font-semibold text-right ${val === null ? "text-muted-foreground" : color}`}>
                        {val === null
                          ? "no upward trend"
                          : val === 0
                          ? "⚠ now"
                          : (
                            <>
                              ~{val} session{val !== 1 ? "s" : ""}
                              <br />
                              <span className="text-[9px] font-normal opacity-70">
                                ≈ {fmtHrs(val * avgHrsPerSession)}
                              </span>
                            </>
                          )}
                      </span>
                    </div>
                  ))}
                </div>
                <p className="text-[9px] text-muted-foreground/50 border-t border-border/40 pt-1">
                  Based on {n} sessions · {fmtHrs(avgHrsPerSession)}/session assumed
                </p>
              </div>

              {/* Condition assessment with explain buttons */}
              <div className="bg-card border border-border rounded-lg p-3 space-y-2">
                <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                  Condition assessment
                </span>
                <div className="space-y-2">
                  {[
                    { key: "temp", label: "Thermal",    status: result.a.temp.status, color: result.a.temp.statusColor, action: result.a.temp.action },
                    { key: "vib",  label: "Vibration",  status: result.a.vib.status,  color: result.a.vib.statusColor,  action: result.a.vib.action },
                    { key: "wob",  label: "Wobble",     status: result.a.wob.status,  color: result.a.wob.statusColor,  action: result.a.wob.action },
                    { key: "cv",   label: "Controller", status: result.a.cv.status,   color: result.a.cv.statusColor,   action: result.a.cv.action },
                  ].map(({ key, label, status, color, action }) => (
                    <div key={key} className="border-b border-border/30 last:border-0 pb-1.5 last:pb-0">
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-[10px] font-medium text-foreground">{label}</span>
                        <div className="flex items-center gap-1.5">
                          <span className={`text-[9px] font-mono ${color}`}>{status}</span>
                          <button
                            onClick={() => toggleExplanation(key)}
                            title="How was this predicted?"
                            className={`flex items-center gap-0.5 text-[9px] font-mono px-1.5 py-0.5 rounded border transition-colors ${
                              openExplanation === key
                                ? "border-primary text-primary bg-primary/10"
                                : "border-border text-muted-foreground hover:text-foreground hover:bg-muted/20"
                            }`}
                          >
                            {openExplanation === key
                              ? <><X className="w-2.5 h-2.5" /> Close</>
                              : <><HelpCircle className="w-2.5 h-2.5" /> Explain</>
                            }
                          </button>
                        </div>
                      </div>
                      <p className="text-[10px] text-muted-foreground leading-snug mt-0.5">{action}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* PID & regression notes */}
              <div className="bg-card border border-border rounded-lg p-3 space-y-2">
                <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">PID & maintenance</span>
                <p className="text-[10px] text-muted-foreground leading-relaxed">{result.a.pid}</p>

                <div className="pt-1 border-t border-border/40 grid grid-cols-2 gap-x-3 gap-y-1">
                  {[
                    { label: "ISO zone",     val: `Zone ${result.a.vib.isoZone}`,                                        color: result.a.vib.statusColor },
                    { label: "wobble trend", val: result.a.wob.trend,                                                     color: result.a.wob.trend === "Increasing" ? "text-accent" : result.a.wob.trend === "Decreasing" ? "text-chart-3" : "text-foreground" },
                    { label: "CV trend",     val: result.a.cv.trend,                                                      color: result.a.cv.trend === "Degrading" ? "text-accent" : result.a.cv.trend === "Improving" ? "text-chart-3" : "text-foreground" },
                    { label: "temp slope",   val: `${result.a.temp.reg.slope > 0 ? "+" : ""}${result.a.temp.reg.slope.toFixed(2)}°/session`, color: result.a.temp.reg.slope > 0.5 ? "text-accent" : "text-foreground" },
                  ].map(({ label, val, color }) => (
                    <div key={label}>
                      <p className="text-[9px] text-muted-foreground">{label}</p>
                      <p className={`text-[10px] font-mono font-semibold ${color}`}>{val}</p>
                    </div>
                  ))}
                </div>

                <p className="text-[9px] text-muted-foreground/50 leading-relaxed border-t border-border/40 pt-1">
                  OLS regression across {n} sessions. Dashed chart line = trend projection. Vibration stored directly from sensor (falls back to RPM-derived if sensor unavailable). ISO 10816-3 zones A–D.
                  {n < 5 && " More sessions improve accuracy."}
                </p>
              </div>
            </div>

            {/* Explanation panels */}
            {openExplanation === "temp" && (
              <ExplanationPanel
                metric="Temperature"
                unit="°C"
                reg={result.a.temp.reg}
                latest={result.a.temp.latest}
                sessionCount={n}
                avgHrsPerSession={avgHrsPerSession}
                action={result.a.temp.action}
                thresholds={[
                  { label: "Warning threshold", value: tempWarn, sessionsAway: result.a.temp.warnIn },
                  { label: "Critical threshold", value: tempCrit, sessionsAway: result.a.temp.critIn },
                ]}
              />
            )}
            {openExplanation === "vib" && (
              <ExplanationPanel
                metric="Vibration"
                unit="mm/s"
                reg={result.a.vib.reg}
                latest={result.a.vib.latest}
                sessionCount={n}
                avgHrsPerSession={avgHrsPerSession}
                action={result.a.vib.action}
                thresholds={[
                  { label: "Zone B→C boundary", value: 4.5, sessionsAway: result.a.vib.zoneCIn },
                  { label: "Zone C→D boundary", value: 7.1, sessionsAway: result.a.vib.zoneDIn },
                ]}
              />
            )}
            {openExplanation === "wob" && (
              <ExplanationPanel
                metric="Wobble / precession"
                unit="°"
                reg={result.a.wob.reg}
                latest={result.a.wob.latest}
                sessionCount={n}
                avgHrsPerSession={avgHrsPerSession}
                action={result.a.wob.action}
                thresholds={[
                  { label: "Inspect threshold", value: 2, sessionsAway: sessionsTo(result.a.wob.reg, n - 1, 2) },
                  { label: "Critical wobble",   value: 5, sessionsAway: sessionsTo(result.a.wob.reg, n - 1, 5) },
                ]}
              />
            )}
            {openExplanation === "cv" && (
              <ExplanationPanel
                metric="RPM Controller stability (CV%)"
                unit="% CV"
                reg={result.a.cv.reg}
                latest={result.a.cv.latest}
                sessionCount={n}
                avgHrsPerSession={avgHrsPerSession}
                action={result.a.cv.action}
                thresholds={[
                  { label: "Watch level",  value: 5,  sessionsAway: sessionsTo(result.a.cv.reg, n - 1, 5) },
                  { label: "Retune level", value: 10, sessionsAway: sessionsTo(result.a.cv.reg, n - 1, 10) },
                ]}
              />
            )}

          </div>
        )}
      </main>
    </div>
  );
}
