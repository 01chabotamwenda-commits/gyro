/**
 * MotorSweepDialog
 *
 * Shown when the server broadcasts a `motor_sweep_confirm` WS event after the
 * startup motor sweep detected no RPM feedback from the IR speed sensor.
 *
 * The operator answers whether the motor physically spun during the test so the
 * system can distinguish between two fault scenarios:
 *   - Motor OK but IR sensor disconnected / misaligned
 *   - Motor itself did not respond (ESC / wiring fault)
 */

import React, { useState } from "react";
import { apiUrl } from "@/lib/api-url";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { useQueryClient } from "@tanstack/react-query";
import { getGetAlertsQueryKey } from "@workspace/api-client-react";
import { Loader2, Volume2, VolumeX } from "lucide-react";

export interface MotorSweepConfirmPayload {
  sessionId: number;
  sweepRpm: number;
  durationSec: number;
  message: string;
}

interface MotorSweepDialogProps {
  payload: MotorSweepConfirmPayload | null;
  onClose: () => void;
}

export function MotorSweepDialog({ payload, onClose }: MotorSweepDialogProps) {
  const queryClient = useQueryClient();
  const [pending, setPending] = useState(false);

  async function respond(motorDidSpin: boolean) {
    setPending(true);
    try {
      const res = await fetch(apiUrl("/api/verify/motor-confirm"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          motorDidSpin,
          sessionId: payload?.sessionId ?? null,
        }),
      });
      if (!res.ok) {
        // Keep the dialog open so the operator can try again
        console.error("[motor-sweep-dialog] confirm failed:", res.status);
        return;
      }
      queryClient.invalidateQueries({ queryKey: getGetAlertsQueryKey() });
      onClose();
    } catch {
      // Network error — keep dialog open so operator can retry
      console.error("[motor-sweep-dialog] network error sending confirmation");
    } finally {
      setPending(false);
    }
  }

  return (
    <AlertDialog open={!!payload} onOpenChange={(open) => { if (!open) onClose(); }}>
      <AlertDialogContent className="bg-card border-border max-w-[420px]">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-foreground text-sm">
            Startup Motor Sweep — Operator Confirmation
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3 text-muted-foreground text-xs leading-relaxed">
              <p>
                The system ran a low-speed sweep at{" "}
                <span className="font-mono font-semibold text-foreground">
                  {payload?.sweepRpm?.toLocaleString() ?? "—"} RPM
                </span>{" "}
                for {payload?.durationSec ?? 4} seconds as part of hardware verification.
                The IR speed sensor did not report any RPM readings during the test.
              </p>

              <p className="font-medium text-foreground text-[11px]">
                Did you hear or observe the motor physically spinning?
              </p>

              {/* Explanation of each answer */}
              <div className="rounded-md border border-border bg-muted/40 p-2.5 space-y-2 text-[10px] font-mono">
                <div className="flex gap-2 items-start">
                  <Volume2 className="w-3 h-3 mt-0.5 shrink-0 text-amber-400" />
                  <div>
                    <span className="text-amber-400 font-bold">Yes — motor spun:</span>{" "}
                    <span className="text-muted-foreground font-sans">
                      Motor is working. The IR speed sensor is likely disconnected, misaligned,
                      or faulty. Check sensor wiring and gap to rotor disc.
                    </span>
                  </div>
                </div>
                <div className="flex gap-2 items-start">
                  <VolumeX className="w-3 h-3 mt-0.5 shrink-0 text-destructive" />
                  <div>
                    <span className="text-destructive font-bold">No — motor was silent:</span>{" "}
                    <span className="text-muted-foreground font-sans">
                      Motor did not respond. Check ESC wiring, power supply (12–24 V),
                      and PWM signal from ESP32. Do not run session until resolved.
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>

        <AlertDialogFooter className="flex gap-2 sm:gap-2">
          <Button
            variant="outline"
            className="flex-1 h-8 text-[10px] font-bold border-destructive/50 text-destructive hover:bg-destructive/10 hover:text-destructive"
            disabled={pending}
            onClick={() => respond(false)}
          >
            {pending ? <Loader2 className="w-3 h-3 animate-spin" /> : (
              <><VolumeX className="w-3 h-3 mr-1.5" />No — motor was silent</>
            )}
          </Button>
          <Button
            className="flex-1 h-8 text-[10px] font-bold bg-amber-500/15 hover:bg-amber-500/25 text-amber-400 border border-amber-500/40"
            disabled={pending}
            onClick={() => respond(true)}
          >
            {pending ? <Loader2 className="w-3 h-3 animate-spin" /> : (
              <><Volume2 className="w-3 h-3 mr-1.5" />Yes — motor spun</>
            )}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
