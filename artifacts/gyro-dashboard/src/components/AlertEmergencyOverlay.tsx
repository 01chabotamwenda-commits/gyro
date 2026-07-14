import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AlertOctagon } from "lucide-react";
import { format } from "date-fns";
import { useAlertContext } from "@/contexts/alert-context";
import type { AlertLevel } from "@/contexts/alert-context";

const LEVEL_LABEL: Record<string, string> = {
  emergency: "Emergency",
  critical:  "Critical",
  error:     "Error",
  warning:   "Warning",
  info:      "Alert",
};

export function AlertEmergencyOverlay() {
  const { activeAlerts, behavior, acknowledge, acknowledgeByDelivery } = useAlertContext();

  const emergencyAlerts = activeAlerts.filter((a) => {
    const lvl = (a.alert.level as AlertLevel) || "info";
    const cfg = behavior[lvl] ?? behavior.info;
    return cfg.delivery === "fullscreen";
  });

  const current = emergencyAlerts[0];
  const remaining = emergencyAlerts.length - 1;
  const levelLabel = current ? (LEVEL_LABEL[current.alert.level] ?? "Alert") : "Alert";

  return (
    <AnimatePresence>
      {current && (
        <motion.div
          key={String(current.alert.id)}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.2 } }}
          className="fixed inset-0 z-[200] flex flex-col items-center justify-center bg-background/97 backdrop-blur-sm"
        >
          {/* Pulsing red border ring */}
          <motion.div
            className="fixed inset-0 pointer-events-none rounded border-4 border-red-500"
            animate={{
              boxShadow: [
                "inset 0 0 0px rgba(239,68,68,0), 0 0 0px rgba(239,68,68,0)",
                "inset 0 0 30px rgba(239,68,68,0.15), 0 0 30px rgba(239,68,68,0.2)",
                "inset 0 0 0px rgba(239,68,68,0), 0 0 0px rgba(239,68,68,0)",
              ],
            }}
            transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
          />

          <div className="max-w-lg w-full mx-6 space-y-8 text-center">
            {/* Icon */}
            <motion.div
              animate={{ scale: [1, 1.08, 1] }}
              transition={{ duration: 0.9, repeat: Infinity, ease: "easeInOut" }}
              className="flex justify-center"
            >
              <AlertOctagon className="w-20 h-20 text-red-500 drop-shadow-[0_0_20px_rgba(239,68,68,0.6)]" />
            </motion.div>

            {/* Text */}
            <div className="space-y-3">
              <motion.h1
                className="text-3xl font-black text-red-500 uppercase tracking-[0.25em] font-mono"
                animate={{ opacity: [1, 0.6, 1] }}
                transition={{ duration: 1.2, repeat: Infinity }}
              >
                ⚠ {levelLabel}
              </motion.h1>
              <p className="text-base font-mono text-foreground font-semibold leading-relaxed px-2">
                {current.alert.message}
              </p>
              <div className="flex items-center justify-center gap-4 text-[11px] text-muted-foreground font-mono">
                <span>{format(new Date(current.alert.timestamp), "HH:mm:ss · yyyy-MM-dd")}</span>
                {remaining > 0 && (
                  <span className="text-red-400">+{remaining} more</span>
                )}
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-3 justify-center">
              <button
                onClick={() => acknowledge(current.alert.id)}
                className="px-10 py-3 bg-red-600 hover:bg-red-500 active:bg-red-700 text-white font-black rounded-lg transition-colors font-mono tracking-widest uppercase text-sm shadow-lg shadow-red-900/40"
              >
                Got it
              </button>
              {remaining > 0 && (
                <button
                  onClick={() => acknowledgeByDelivery("fullscreen")}
                  className="px-6 py-3 bg-muted hover:bg-muted/80 text-foreground font-semibold rounded-lg transition-colors font-mono text-sm"
                >
                  Clear all ({emergencyAlerts.length})
                </button>
              )}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
