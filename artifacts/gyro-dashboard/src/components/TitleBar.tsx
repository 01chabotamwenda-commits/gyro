import { useEffect, useState } from "react";
import { Minus, Square, X, Maximize2 } from "lucide-react";

declare global {
  interface Window {
    __GYRO_PLATFORM__?: string | null;
    windowBridge?: {
      minimize: () => Promise<void>;
      maximize: () => Promise<void>;
      close: () => Promise<void>;
      isMaximized: () => Promise<boolean>;
      onMaximizeChanged: (cb: (val: boolean) => void) => () => void;
    };
  }
}

const platform =
  typeof window !== "undefined" ? window.__GYRO_PLATFORM__ ?? null : null;

const isMac = platform === "mac";

export default function TitleBar() {
  const [isMaximized, setIsMaximized] = useState(false);

  useEffect(() => {
    if (isMac || !window.windowBridge) return;

    window.windowBridge.isMaximized().then(setIsMaximized);
    const unsub = window.windowBridge.onMaximizeChanged(setIsMaximized);
    return unsub;
  }, []);

  const minimize = () => window.windowBridge?.minimize();
  const maximize = () => window.windowBridge?.maximize();
  const close    = () => window.windowBridge?.close();

  return (
    <div
      className="flex h-9 w-full shrink-0 select-none items-center justify-between bg-background border-b border-border"
      style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
    >
      <span className="pl-3 font-mono text-[10px] font-medium tracking-widest text-muted-foreground">
        The Copperbelt University· MOTORIZED GYROSCOPE PROJECT
      </span>

      {!isMac && (
        <div
          className="flex h-full items-stretch"
          style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
        >
          <button
            onClick={minimize}
            className="flex h-full w-11 items-center justify-center text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus:outline-none"
            aria-label="Minimize"
          >
            <Minus size={13} />
          </button>
          <button
            onClick={maximize}
            className="flex h-full w-11 items-center justify-center text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus:outline-none"
            aria-label={isMaximized ? "Restore" : "Maximize"}
          >
            {isMaximized ? <Square size={11} /> : <Maximize2 size={12} />}
          </button>
          <button
            onClick={close}
            className="flex h-full w-11 items-center justify-center text-muted-foreground transition-colors hover:bg-destructive hover:text-destructive-foreground focus:outline-none"
            aria-label="Close"
          >
            <X size={13} />
          </button>
        </div>
      )}
    </div>
  );
}
