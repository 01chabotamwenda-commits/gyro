/**
 * terminal-bus.ts — lets any component "type into" the System Terminal
 * without duplicating its command logic.
 *
 * The terminal (SystemTerminal.tsx) registers its own submit function here on
 * mount. Anything else that wants to fire a command exactly as if the user
 * had typed it into the terminal's input and pressed Enter — a global
 * keyboard shortcut, a bottom-nav button — calls `sendTerminalCommand(text)`.
 * That means the same command map, same logging into the terminal's visible
 * log, and same guard/override behavior everywhere.
 *
 * A second channel, `logTerminalEvent`, injects a display-only line (no serial
 * send, no command parsing) — used to surface IR remote actions in the terminal
 * without routing them through the full command pipeline.
 */

type TerminalSubmit = (text: string) => void;
type TerminalLogger = (level: "info" | "warning" | "critical" | "rx" | "local", text: string) => void;

let submitHandler: TerminalSubmit | null = null;
let loggerHandler: TerminalLogger | null = null;

export function registerTerminalHandler(handler: TerminalSubmit): () => void {
  submitHandler = handler;
  return () => {
    if (submitHandler === handler) submitHandler = null;
  };
}

/** Register a display-only log handler (called by SystemTerminal on mount). */
export function registerTerminalLogger(handler: TerminalLogger): () => void {
  loggerHandler = handler;
  return () => {
    if (loggerHandler === handler) loggerHandler = null;
  };
}

/** Send a command exactly as if it were typed into the terminal input and submitted. */
export function sendTerminalCommand(text: string): void {
  if (!submitHandler) {
    console.warn(`[terminal-bus] no terminal mounted yet — dropped command "${text}"`);
    return;
  }
  submitHandler(text);
}

/**
 * Inject a display-only line into the terminal log — no serial send, no
 * command parsing. Use this to surface IR remote actions and other system
 * events that should appear in the terminal without triggering a command.
 */
export function logTerminalEvent(
  level: "info" | "warning" | "critical" | "rx" | "local",
  text: string,
): void {
  if (!loggerHandler) return; // terminal not mounted yet — silently drop
  loggerHandler(level, text);
}
