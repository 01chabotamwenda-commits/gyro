import React from "react";
import { useQuery } from "@tanstack/react-query";
import { apiUrl } from "@/lib/api-url";
import { Link } from "wouter";
import { ArrowLeft, Download, History } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface SessionRecord {
  id: number;
  status: string;
  startedAt: string | null;
  stoppedAt: string | null;
  targetRpm: number;
  targetDurationHours: number;
  durationSeconds: number | null;
}

function formatDuration(secs: number | null): string {
  if (secs == null) return "—";
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString("en-GB", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hour12: false,
  });
}

const STATUS_STYLE: Record<string, string> = {
  running:   "bg-chart-3/20 text-chart-3 border-chart-3/30",
  warning:   "bg-accent/20 text-accent border-accent/30",
  completed: "bg-chart-1/20 text-chart-1 border-chart-1/30",
  error:     "bg-destructive/20 text-destructive border-destructive/30",
  idle:      "bg-muted text-muted-foreground border-border",
};

export default function Sessions() {
  const { data: sessions, isLoading, isError, refetch } = useQuery<SessionRecord[]>({
    queryKey: ["sessions-history"],
    queryFn: async () => {
      const res = await fetch(apiUrl("/api/sessions"));
      if (!res.ok) throw new Error("Failed to load sessions");
      return res.json();
    },
    refetchInterval: 10000,
  });

  return (
    <div className="min-h-screen bg-background text-foreground font-sans flex flex-col">
      {/* Header */}
      <header className="h-12 shrink-0 border-b border-border px-4 flex items-center justify-between bg-card">
        <div className="flex items-center gap-3">
          <Link href="/">
            <button className="text-muted-foreground hover:text-foreground transition-colors" title="Back to dashboard">
              <ArrowLeft className="w-4 h-4" />
            </button>
          </Link>
          <div className="flex items-center gap-2">
            <History className="w-4 h-4 text-primary" />
            <h1 className="text-sm font-bold tracking-tight text-foreground">Session History</h1>
            <span className="text-muted-foreground font-normal text-xs ml-1 hidden sm:inline">
              · Copperbelt University
            </span>
          </div>
        </div>
        <a
          href={apiUrl("/api/readings/export")}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded border border-border hover:border-foreground/30"
          download="all-readings.csv"
        >
          <Download className="w-3 h-3" />
          Export all readings
        </a>
      </header>

      {/* Content */}
      <main className="flex-1 p-6 overflow-auto">
        {isLoading && (
          <div className="flex items-center justify-center h-48 text-muted-foreground font-mono text-sm">
            Loading sessions…
          </div>
        )}

        {isError && (
          <div className="flex flex-col items-center justify-center h-48 gap-3">
            <p className="text-destructive font-mono text-sm">Failed to load session history.</p>
            <button onClick={() => refetch()} className="text-xs text-primary hover:underline">Retry</button>
          </div>
        )}

        {sessions && sessions.length === 0 && (
          <div className="flex items-center justify-center h-48 text-muted-foreground font-mono text-sm">
            No sessions recorded yet.
          </div>
        )}

        {sessions && sessions.length > 0 && (
          <div className="rounded-lg border border-border/70 overflow-hidden shadow-sm">
            <table className="w-full text-xs font-mono">
              <thead>
                <tr className="border-b border-border/70 bg-muted/40 text-muted-foreground">
                  <th className="text-left px-4 py-3 font-semibold w-16">#</th>
                  <th className="text-left px-4 py-3 font-semibold w-28">Status</th>
                  <th className="text-left px-4 py-3 font-semibold">Started</th>
                  <th className="text-left px-4 py-3 font-semibold">Stopped</th>
                  <th className="text-right px-4 py-3 font-semibold w-28">Duration</th>
                  <th className="text-right px-4 py-3 font-semibold w-28">Target RPM</th>
                  <th className="text-center px-4 py-3 font-semibold w-24">CSV</th>
                </tr>
              </thead>
              <tbody>
                {sessions.map((s, i) => (
                  <tr
                    key={s.id}
                    className={`border-b border-border last:border-0 transition-colors hover:bg-muted/20 ${
                      i % 2 === 0 ? "bg-card" : "bg-muted/10"
                    }`}
                  >
                    <td className="px-4 py-3 text-muted-foreground">#{s.id}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded border text-[10px] font-bold capitalize ${STATUS_STYLE[s.status] ?? STATUS_STYLE.idle}`}>
                        {s.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-foreground">{formatDate(s.startedAt)}</td>
                    <td className="px-4 py-3 text-muted-foreground">{formatDate(s.stoppedAt)}</td>
                    <td className="px-4 py-3 text-right text-foreground">{formatDuration(s.durationSeconds)}</td>
                    <td className="px-4 py-3 text-right text-foreground">{s.targetRpm.toLocaleString()}</td>
                    <td className="px-4 py-3 text-center">
                      <a
                        href={apiUrl(`/api/readings/export?sessionId=${s.id}`)}
                        className="inline-flex items-center gap-1 text-primary hover:text-primary/80 transition-colors"
                        download={`session-${s.id}-readings.csv`}
                        title={`Download readings for session #${s.id}`}
                      >
                        <Download className="w-3 h-3" />
                        CSV
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}
