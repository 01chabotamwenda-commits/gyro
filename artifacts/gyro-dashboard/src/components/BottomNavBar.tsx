/**
 * BottomNavBar — auto-hide quick-action strip.
 *
 * Behaviour:
 * - Hidden entirely when no session is active.
 * - Starts pinned (expanded) when a session becomes active so the user
 *   notices the available quick actions.
 * - After the user has used ≥ 2 global keyboard shortcuts the bar auto-
 *   collapses: the keyboard is faster and they clearly know about it.
 * - Hovering near the bottom peek-reveals the bar; mouse-leave with a short
 *   debounce hides it again.
 * - Clicking the pull-tab toggles pin (stay-open) state permanently.
 * - Fully keyboard-accessible: the pull-tab gets focus-visible styling and
 *   responds to Enter / Space; all action buttons are focusable.
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import { ChevronsUp } from "lucide-react";
import { sendTerminalCommand } from "@/lib/terminal-bus";
import { subscribeThrottle } from "@/lib/throttle-bus";

/** Button that fires its command immediately on press and repeats every 150 ms
 *  while the pointer or touch is held down.  Works for mouse and touch. */
function SpeedHoldButton({
  command,
  children,
  className,
  title,
  tabIndex,
}: {
  command: string;
  children: React.ReactNode;
  className?: string;
  title?: string;
  tabIndex?: number;
}) {
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const start = useCallback(() => {
    if (intervalRef.current) return; // already holding
    sendTerminalCommand(command);
    intervalRef.current = setInterval(() => sendTerminalCommand(command), 150);
  }, [command]);

  const stop = useCallback(() => {
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
  }, []);

  // Safety: clear interval if component unmounts while held
  useEffect(() => stop, [stop]);

  return (
    <button
      className={className}
      title={title}
      tabIndex={tabIndex}
      onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); start(); }}
      onPointerUp={stop}
      onPointerLeave={stop}
      onPointerCancel={stop}
      // keyboard: hold Enter fires key-repeat natively, Space fires once
      onKeyDown={(e) => { if (e.key === "Enter" && !e.repeat) start(); }}
      onKeyUp={(e) => { if (e.key === "Enter") stop(); }}
      // Stop if the button loses focus while Enter is held (e.g. Tab away)
      onBlur={stop}
      onClick={() => {/* handled by pointer events */}}
    >
      {children}
    </button>
  );
}

interface BottomNavBarProps {
  sessionActive: boolean;
  onResetSession: () => void;
  resetPending: boolean;
  keyboardShortcutUses: number;
  /** Ref that the parent can call to toggle pin from outside (e.g. Space key) */
  togglePinRef?: React.MutableRefObject<(() => void) | null>;
}

export function BottomNavBar({
  sessionActive,
  onResetSession,
  resetPending,
  keyboardShortcutUses,
  togglePinRef,
}: BottomNavBarProps) {
  // pinned = user explicitly wants it open; hovered = mouse reveal
  const [pinned, setPinned] = useState(true);
  const [hovered, setHovered] = useState(false);
  const [throttleUs, setThrottleUs] = useState(1100);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // prevent auto-collapse from undoing a manual pin
  const userPinnedRef = useRef(false);

  // Subscribe to throttle bus
  useEffect(() => subscribeThrottle(setThrottleUs), []);

  // Auto-collapse after 2+ keyboard shortcut uses (user prefers keyboard)
  useEffect(() => {
    if (keyboardShortcutUses >= 2 && !userPinnedRef.current) {
      setPinned(false);
    }
  }, [keyboardShortcutUses]);

  // Re-pin + reset user-pin flag when a new session starts
  useEffect(() => {
    if (sessionActive) {
      setPinned(true);
      userPinnedRef.current = false;
    }
  }, [sessionActive]);

  // togglePin and its ref registration MUST live before any conditional return
  // so the Space-key handler in dashboard.tsx always has a valid ref — even
  // before a session is started.
  const togglePin = useCallback(() => {
    setPinned((prev) => {
      const next = !prev;
      userPinnedRef.current = next;
      return next;
    });
  }, []);

  useEffect(() => {
    if (togglePinRef) togglePinRef.current = togglePin;
    return () => {
      if (togglePinRef) togglePinRef.current = null;
    };
  }, [togglePinRef, togglePin]);

  const expanded = pinned || hovered;

  const onMouseEnter = () => {
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
    setHovered(true);
  };
  const onMouseLeave = () => {
    hoverTimer.current = setTimeout(() => setHovered(false), 4000);
  };

  return (
    <div
      className={`shrink-0 transition-[height] duration-500 ease-in-out overflow-hidden ${
        expanded ? "h-[52px]" : "h-6"
      }`}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {/* ── Action buttons row (slides in as height grows) ── */}
      <div
        className={`h-[40px] flex items-stretch border-t border-border/70 bg-card/95 backdrop-blur-sm transition-opacity duration-150 ${
          expanded ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
        aria-hidden={!expanded}
      >
        {/* Reset Angles */}
        <button
          onClick={() => sendTerminalCommand("z")}
          title="Reset Angles (keyboard: z)"
          tabIndex={expanded ? 0 : -1}
          className="flex-1 flex flex-row items-center justify-center gap-1.5 hover:bg-cyan-500/10 active:bg-cyan-500/20 transition-colors border-r border-border/40 group focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-cyan-400/60 focus-visible:ring-inset"
        >
          <span className="text-[10px] font-sans font-extrabold uppercase tracking-wide text-cyan-500/80 group-hover:text-cyan-300 transition-colors leading-none">
            Reset Angles
          </span>
        </button>

        {/* Speed Down */}
        <SpeedHoldButton
          command="l"
          title="Speed Down −5µs (keyboard: l · hold to repeat)"
          tabIndex={expanded ? 0 : -1}
          className="flex-1 flex flex-row items-center justify-center gap-1.5 hover:bg-amber-500/10 active:bg-amber-500/20 transition-colors border-r border-border/40 group focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-amber-400/60 focus-visible:ring-inset select-none"
        >
          <span className="text-[10px] font-sans font-extrabold uppercase tracking-wide text-amber-500/80 group-hover:text-amber-300 transition-colors leading-none">
            Decrease Speed
          </span>
          <span className="text-[8px] font-sans font-bold text-neutral-700 dark:text-neutral-300 transition-colors leading-none tabular-nums">
            {throttleUs}µs
          </span>
        </SpeedHoldButton>

        {/* Speed Up */}
        <SpeedHoldButton
          command="h"
          title="Speed Up +5µs (keyboard: h · hold to repeat)"
          tabIndex={expanded ? 0 : -1}
          className="flex-1 flex flex-row items-center justify-center gap-1.5 hover:bg-green-500/10 active:bg-green-500/20 transition-colors border-r border-border/40 group focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-green-400/60 focus-visible:ring-inset select-none"
        >
          <span className="text-[10px] font-sans font-extrabold uppercase tracking-wide text-green-500/80 group-hover:text-green-300 transition-colors leading-none">
            Increase Speed
          </span>
          <span className="text-[8px] font-sans font-bold text-neutral-700 dark:text-neutral-300 transition-colors leading-none tabular-nums">
            {throttleUs}µs
          </span>
        </SpeedHoldButton>

        {/* Reset Session */}
        <button
          onClick={onResetSession}
          disabled={resetPending}
          title="Reset Session — clears history & timer, motor untouched"
          tabIndex={expanded ? 0 : -1}
          className="flex-1 flex flex-row items-center justify-center gap-1.5 hover:bg-violet-500/10 active:bg-violet-500/20 transition-colors disabled:opacity-35 disabled:pointer-events-none group focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-violet-400/60 focus-visible:ring-inset"
        >
          <span className="text-[10px] font-sans font-extrabold uppercase tracking-wide text-violet-500/80 group-hover:text-violet-300 transition-colors leading-none">
            {resetPending ? "Resetting…" : "Reset Session"}
          </span>
        </button>
      </div>
      {/* ── Pull-tab strip — always visible ── */}
      <div className="h-6 flex items-center justify-center border-t border-border/25 bg-card/50 backdrop-blur-sm">
        <button
          onClick={togglePin}
          aria-expanded={expanded}
          aria-label={pinned ? "Collapse quick actions bar" : "Expand quick actions bar"}
          className="flex items-center gap-1.5 px-3 h-full text-muted-foreground/35 hover:text-muted-foreground/70 transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/40 rounded"
        >
          <ChevronsUp
            className={`w-2.5 h-2.5 transition-transform duration-200 ${
              expanded ? "rotate-180" : ""
            }`}
          />
          <span className="text-[7.5px] font-mono uppercase tracking-[0.18em]">
            Quick Actions
          </span>
          {!pinned && !hovered && (
            <span className="ml-0.5 text-[6.5px] font-mono text-muted-foreground/25 uppercase tracking-wider hidden sm:inline">
              hover or click
            </span>
          )}
        </button>
      </div>
    </div>
  );
}
