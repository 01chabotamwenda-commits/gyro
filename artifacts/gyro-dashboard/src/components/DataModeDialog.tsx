import { useState, useEffect } from "react";
import { Wifi, BookOpen, X, Settings } from "lucide-react";
import { Link } from "wouter";

const STORAGE_KEY = "gyro-dialog-last-shown";

function getTodayKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
}

export function useDataModeDialog() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const lastShown = localStorage.getItem(STORAGE_KEY);
    const today = getTodayKey();
    let t: ReturnType<typeof setTimeout> | null = null;
    // Only auto-show if user hasn't dismissed today AND has explicitly visited before
    // (avoid blocking first-time view of the dashboard)
    if (lastShown !== today && lastShown !== null) {
      t = setTimeout(() => setOpen(true), 400);
    }
    return () => {
      if (t) clearTimeout(t);
    };
  }, []);

  return { open, setOpen };
}

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function DataModeDialog({ open, onClose }: Props) {
  if (!open) return null;

  function handleClose() {
    localStorage.setItem(STORAGE_KEY, getTodayKey());
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={handleClose} />

      {/* Dialog */}
      <div className="relative z-10 w-full max-w-md mx-4 rounded-xl border border-border bg-card shadow-2xl overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div>
            <p className="font-mono text-[10px] text-muted-foreground tracking-widest uppercase">
              Gyro Monitor
            </p>
            <h2 className="text-base font-semibold text-foreground mt-0.5">
              Welcome back
            </h2>
          </div>
          <button
            onClick={handleClose}
            className="flex items-center justify-center w-7 h-7 rounded border border-border text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
            aria-label="Close"
          >
            <X size={14} />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5">
          <div className="flex items-center gap-2.5 mb-4 p-3 rounded-lg bg-chart-3/10 border border-chart-3/20">
            <Wifi size={16} className="shrink-0 text-chart-3" />
            <p className="text-xs text-chart-3 font-medium">
              Waiting for hardware connection
            </p>
          </div>

          <p className="text-sm text-muted-foreground leading-relaxed mb-5">
            The dashboard will show <span className="text-foreground font-medium">zeros</span> until
            your ESP32 connects via USB serial or Wi-Fi. Use the Get Started guide to configure
            your device and connection settings.
          </p>

          <div className="flex flex-col gap-2">
            <Link href="/guide" onClick={handleClose}>
              <button className="flex items-center justify-center gap-2 w-full rounded-lg border border-border bg-muted hover:bg-muted/70 text-foreground text-sm font-semibold px-4 py-2.5 transition-colors">
                <BookOpen size={15} />
                Get Started
              </button>
            </Link>
            <Link href="/settings" onClick={handleClose}>
              <button className="flex items-center justify-center gap-2 w-full rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-muted/30 text-sm px-4 py-2.5 transition-colors">
                <Settings size={14} />
                Go to Settings
              </button>
            </Link>
            <button
              onClick={handleClose}
              className="flex items-center justify-center w-full rounded-lg text-muted-foreground/60 hover:text-muted-foreground text-xs px-4 py-2 transition-colors"
            >
              View dashboard with no data
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
