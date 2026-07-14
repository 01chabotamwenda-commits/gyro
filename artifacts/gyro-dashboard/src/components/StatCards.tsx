import React from "react";
import type { SensorReading, SessionStats } from "@workspace/api-client-react";
import { Gauge, Thermometer, Compass, Activity, WifiOff } from "lucide-react";

interface Capabilities {
  imu: boolean;
  motor: boolean;
  temperature: boolean;
  vibration: boolean;
  sdcard: boolean;
}

interface StatCardsProps {
  reading: SensorReading | null;
  stats: SessionStats | null;
  targetRpm?: number;
  tempWarn?: number;
  tempCrit?: number;
  vibWarn?: number;
  vibCrit?: number;
  maxTiltAngle?: number;
  capabilities?: Capabilities | null;
  isHardwareMode?: boolean;
}

function bearingLabel(v: number, warn: number, crit: number): { label: string; color: string } {
  if (v < warn)   return { label: "Good",     color: "text-chart-3" };
  if (v < crit)   return { label: "Elevated", color: "text-accent" };
  return                  { label: "Critical", color: "text-destructive" };
}

function rpmStatus(avgRpm: number, targetRpm?: number): { label: string; color: string } {
  if (avgRpm <= 0)    return { label: "Idle",         color: "text-muted-foreground" };
  if (!targetRpm)     return { label: "Running",      color: "text-chart-3" };
  const ratio = avgRpm / targetRpm;
  if (ratio < 0.5)    return { label: "Below target", color: "text-accent" };
  if (ratio < 0.90)   return { label: "Below target", color: "text-accent" };
  if (ratio <= 1.10)  return { label: "On target",    color: "text-chart-3" };
  return                     { label: "Over speed",   color: "text-destructive" };
}

function tiltStatus(avgTiltX: number, avgTiltY: number, maxTilt: number): { label: string; color: string } {
  const mag = Math.sqrt(avgTiltX * avgTiltX + avgTiltY * avgTiltY);
  const warn = maxTilt * 0.5;
  const crit = maxTilt * 0.85;
  if (mag < warn)   return { label: "Level",         color: "text-chart-3" };
  if (mag < crit)   return { label: "Slight tilt",   color: "text-chart-3" };
  if (mag < maxTilt) return { label: "Tilted",        color: "text-accent" };
  return                   { label: "Critical tilt", color: "text-destructive" };
}

function OfflineCard({ title, icon, reason }: { title: string; icon: React.ReactNode; reason: string }) {
  return (
    <div className="bg-card border border-border/40 rounded-lg p-2 flex flex-col gap-0.5 opacity-50">
      <div className="flex items-center justify-between">
        <span className="text-[9px] text-muted-foreground/60 font-medium truncate">{title}</span>
        <div className="flex items-center gap-0.5">
          <WifiOff className="w-2.5 h-2.5 text-muted-foreground/40" />
          <div className="w-2.5 h-2.5 flex items-center justify-center">{icon}</div>
        </div>
      </div>
      <span className="text-[8px] font-mono text-muted-foreground/50 italic">{reason}</span>
    </div>
  );
}

export function StatCards({
  reading,
  stats,
  targetRpm,
  tempWarn = 55,
  tempCrit = 65,
  vibWarn = 4.5,
  vibCrit = 7.1,
  maxTiltAngle = 14,
  capabilities,
  isHardwareMode = false,
}: StatCardsProps) {
  // Use live reading as fallback when polled stats are empty (e.g. 2-second window
  // is too short or the DB branch has zero recent readings).
  const liveRpm   = reading?.rpm ?? 0;
  const liveTemp  = reading?.temperature ?? 0;
  const liveTiltX = reading?.tiltX ?? 0;
  const liveTiltY = reading?.tiltY ?? 0;
  // Actual ESC pulse width sent to the motor (µs) — a more actionable stat
  // than raw RPM, since it reflects exactly what's being commanded right now.
  const motorPulseUs = reading?.motorPulseUs ?? 0;

  const avgRpm   = (stats?.totalReadings ?? 0) > 0 ? (stats?.avgRpm ?? 0) : liveRpm;
  const avgTemp  = (stats?.totalReadings ?? 0) > 0 ? (stats?.avgTemperature ?? 0) : liveTemp;
  const avgTiltX = (stats?.totalReadings ?? 0) > 0 ? (stats?.avgTiltX ?? 0) : liveTiltX;
  const avgTiltY = (stats?.totalReadings ?? 0) > 0 ? (stats?.avgTiltY ?? 0) : liveTiltY;
  // Vibration from live reading, or derived from RPM when hardware doesn't send it directly
  const rawVib = reading?.vibration;
  const avgVib = (rawVib != null && rawVib > 0) ? rawVib : (avgRpm / 14000) * 8.5;
  // vibrationFreq — dominant FFT frequency from firmware (Hz)
  const vibrFreqHz: number = (reading as any)?.vibrationFreq ?? 0;

  // hasData is true if we have any polled stats OR a live WebSocket reading
  const hasData = ((stats?.totalReadings ?? 0) > 0) || (reading != null);

  // Always show all cards regardless of capabilities
  const showRpm         = true;
  const showTemperature = true;
  const showVibration   = true;
  const showTilt        = true;

  // Motor pulse card (status label reuses the RPM-vs-target framing since
  // that's still the operationally meaningful comparison).
  const rpmStat = rpmStatus(avgRpm, targetRpm);

  // Temperature card
  const tempColor =
    !hasData ? "text-muted-foreground" :
    avgTemp >= tempCrit ? "text-destructive" :
    avgTemp >= tempWarn ? "text-accent" :
    "text-foreground";
  const tempStatusLabel = !hasData ? "No data" : avgTemp >= tempCrit ? "Critical" : avgTemp >= tempWarn ? "Warning" : "Stable";
  const tempStatusColor = !hasData ? "text-muted-foreground" : avgTemp >= tempCrit ? "text-destructive" : avgTemp >= tempWarn ? "text-accent" : "text-chart-3";

  // Tilt card
  const tiltStat = tiltStatus(avgTiltX, avgTiltY, maxTiltAngle);
  const avgTiltMag = Math.sqrt(avgTiltX * avgTiltX + avgTiltY * avgTiltY);
  const tiltColor =
    !hasData ? "text-muted-foreground" :
    avgTiltMag >= maxTiltAngle ? "text-destructive" :
    avgTiltMag >= maxTiltAngle * 0.85 ? "text-accent" :
    "text-foreground";

  // Vibration card
  const vibStatus = bearingLabel(avgVib, vibWarn, vibCrit);
  const vibColor = !hasData ? "text-muted-foreground" : avgVib >= vibCrit ? "text-destructive" : avgVib >= vibWarn ? "text-accent" : "text-foreground";

  return (
    <div className="grid grid-cols-2 gap-2">

      {/* Motor pulse — the actual ESC command in flight right now. More
          actionable at a glance than RPM (which the flywheel chart already
          covers in detail with a live readout in its header). */}
      {showRpm ? (
        <MiniCard
          title="Sent to Motor"
          value={hasData ? Math.round(motorPulseUs).toString() : "----"}
          unit="µs"
          icon={<Gauge className="w-3.5 h-3.5 text-chart-1" />}
          valueColor={hasData ? "text-foreground" : "text-muted-foreground"}
          sub={hasData ? rpmStat.label : "No data"}
          subColor={hasData ? rpmStat.color : "text-muted-foreground"}
          label="pulse"
          accentColor="hsl(var(--chart-1))"
        />
      ) : (
        <OfflineCard
          title="Sent to Motor"
          icon={<Gauge className="w-3.5 h-3.5 text-muted-foreground/40" />}
          reason="needs ESC connection"
        />
      )}

      {/* Temperature — needs DS18B20, NTC, or BME sensor */}
      {showTemperature ? (
        <MiniCard
          title="Temperature"
          value={hasData ? avgTemp.toFixed(1) : "--.-"}
          unit="°C"
          icon={<Thermometer className="w-3.5 h-3.5 text-chart-5" />}
          valueColor={tempColor}
          sub={tempStatusLabel}
          subColor={tempStatusColor}
          label="avg"
          accentColor="hsl(var(--chart-5))"
        />
      ) : (
        <OfflineCard
          title="Temperature"
          icon={<Thermometer className="w-3.5 h-3.5 text-muted-foreground/40" />}
          reason="needs DS18B20 / NTC"
        />
      )}

      {/* Tilt — provided by MPU6050 */}
      {showTilt ? (
        <MiniCard
          title="Tilt"
          value={hasData ? avgTiltMag.toFixed(2) : "--.-"}
          unit="deg"
          icon={<Compass className="w-3.5 h-3.5 text-chart-4" />}
          valueColor={tiltColor}
          sub={hasData ? tiltStat.label : "No data"}
          subColor={hasData ? tiltStat.color : "text-muted-foreground"}
          label="avg"
          accentColor="hsl(var(--chart-4))"
        />
      ) : (
        <OfflineCard
          title="Tilt"
          icon={<Compass className="w-3.5 h-3.5 text-muted-foreground/40" />}
          reason="needs IMU (MPU6050)"
        />
      )}

      {/* Vibration — RMS acceleration from MPU6050 FFT */}
      {showVibration ? (
        <MiniCard
          title="Vibration"
          value={hasData ? avgVib.toFixed(4) : "--.--"}
          unit="g"
          icon={<Activity className="w-3.5 h-3.5 text-chart-2" />}
          valueColor={hasData ? vibColor : "text-muted-foreground"}
          sub={hasData && vibrFreqHz > 0 ? `Peak: ${vibrFreqHz.toFixed(1)} Hz` : hasData ? `Bearing: ${vibStatus.label}` : "No data"}
          subColor={hasData ? vibStatus.color : "text-muted-foreground"}
          label={vibrFreqHz > 0 ? "rms" : "avg"}
          accentColor="hsl(var(--chart-2))"
        />
      ) : (
        <OfflineCard
          title="Vibration"
          icon={<Activity className="w-3.5 h-3.5 text-muted-foreground/40" />}
          reason="needs IMU / accelerometer"
        />
      )}

    </div>
  );
}

function MiniCard({
  title, value, unit, icon, valueColor, sub, subColor, label, accentColor,
}: {
  title: string;
  value: string;
  unit: string;
  icon?: React.ReactNode;
  valueColor?: string;
  sub?: string;
  subColor?: string;
  label?: string;
  accentColor?: string;
}) {
  return (
    <div className="bg-card border border-border rounded-lg overflow-hidden flex flex-col shadow-sm">
      {/* Colored top accent */}
      {accentColor && <div className="h-[2px] w-full" style={{ background: accentColor }} />}
      <div className="px-2 py-1.5 flex flex-col gap-0.5 flex-1">
        <div className="flex items-center justify-between">
          <span className="text-[9px] text-muted-foreground font-semibold uppercase tracking-wider truncate">{title}</span>
          <div className="flex items-center gap-1">
            {label && (
              <span className="text-[8px] text-muted-foreground/50 font-mono bg-muted/50 px-1 rounded">
                {label}
              </span>
            )}
            {icon && <div className="w-3 h-3 flex items-center justify-center opacity-70">{icon}</div>}
          </div>
        </div>
        <div className="flex items-baseline gap-1">
          <span className={`text-base font-bold tracking-tight font-mono leading-tight ${valueColor ?? "text-foreground"}`}>
            {value}
          </span>
          <span className="text-[9px] text-muted-foreground/70 font-mono">{unit}</span>
        </div>
        {sub !== undefined && (
          <span className={`text-[9px] font-medium leading-none ${subColor ?? "text-muted-foreground"}`}>{sub}</span>
        )}
      </div>
    </div>
  );
}
