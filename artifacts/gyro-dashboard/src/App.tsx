import { Switch, Route, Router as WouterRouter } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Component, useState, useCallback } from "react";
import type { ErrorInfo, ReactNode } from "react";
import { Toaster as SonnerToaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import Dashboard from "@/pages/dashboard";
import Settings from "@/pages/settings";
import Sessions from "@/pages/sessions";
import Predictions from "@/pages/predictions";
import Guide from "@/pages/guide";
import { ThemeContext, type Theme, getInitialTheme, applyTheme } from "@/hooks/use-theme";
import TitleBar from "@/components/TitleBar";
import DataModeDialog, { useDataModeDialog } from "@/components/DataModeDialog";
import { useDocumentTitle } from "@/hooks/use-document-title";
import { AlertProvider } from "@/contexts/alert-context";
import { AlertCriticalDialog } from "@/components/AlertCriticalDialog";
import { AlertEmergencyOverlay } from "@/components/AlertEmergencyOverlay";

// ── Error boundary ─────────────────────────────────────────────────────────────
// Without this, ANY unhandled render error silently blanks the entire screen.
// The boundary catches the throw, shows the error message, and lets the user
// copy it to report the bug.
class ErrorBoundary extends Component<
  { children: ReactNode },
  { error: Error | null }
> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Log to console so DevTools / Electron log files capture the stack.
    console.error("[ErrorBoundary] Caught render error:", error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (error) {
      return (
        <div className="min-h-screen bg-background text-foreground flex flex-col items-center justify-center gap-4 p-6 font-mono">
          <div className="w-full max-w-2xl border border-destructive/60 rounded-lg bg-destructive/10 p-5 space-y-3">
            <h1 className="text-destructive font-bold text-base tracking-wide uppercase">
              ⚠ Application Error
            </h1>
            <p className="text-sm text-muted-foreground">
              A component crashed. Copy the message below and share it so the bug can be fixed.
            </p>
            <pre className="text-xs bg-muted/40 rounded p-3 overflow-auto max-h-64 whitespace-pre-wrap break-all border border-border/60">
              {error.message}
              {error.stack ? "\n\n" + error.stack : ""}
            </pre>
            <button
              className="px-4 py-2 rounded bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-opacity"
              onClick={() => {
                this.setState({ error: null });
                window.location.reload();
              }}
            >
              Reload app
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

const queryClient = new QueryClient();

// Detect Electron: the preload exposes __GYRO_API_BASE__ via contextBridge
const isElectron =
  typeof window !== "undefined" &&
  !!(window as unknown as { __GYRO_API_BASE__?: string }).__GYRO_API_BASE__;

// Apply the saved theme immediately (before first render) to avoid flash
const initialTheme = getInitialTheme();
applyTheme(initialTheme);

function Router() {
  return (
    <Switch>
      <Route path="/" component={Dashboard} />
      <Route path="/settings" component={Settings} />
      <Route path="/sessions" component={Sessions} />
      <Route path="/predictions" component={Predictions} />
      <Route path="/guide" component={Guide} />
      <Route>
        <div className="flex min-h-screen items-center justify-center font-mono text-xl text-primary">
          404 - SYSTEM NOT FOUND
        </div>
      </Route>
    </Switch>
  );
}

function AppShell() {
  useDocumentTitle();
  const { open, setOpen } = useDataModeDialog();

  return (
    <>
      {isElectron ? (
        <WouterRouter hook={useHashLocation}>
          <div className="flex h-screen flex-col overflow-hidden bg-background text-foreground">
            <TitleBar />
            <div className="min-h-0 flex-1 overflow-auto">
              <Router />
            </div>
          </div>
          <DataModeDialog open={open} onClose={() => setOpen(false)} />
        </WouterRouter>
      ) : (
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <div className="h-screen overflow-hidden bg-background text-foreground">
            <Router />
          </div>
          <DataModeDialog open={open} onClose={() => setOpen(false)} />
        </WouterRouter>
      )}
      <SonnerToaster />
      <AlertCriticalDialog />
      <AlertEmergencyOverlay />
    </>
  );
}

function App() {
  const [theme, setThemeState] = useState<Theme>(initialTheme);

  const setTheme = useCallback((t: Theme) => {
    setThemeState(t);
    applyTheme(t);
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme(theme === "dark" ? "light" : "dark");
  }, [theme, setTheme]);

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggleTheme }}>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <AlertProvider>
            <AppShell />
          </AlertProvider>
        </TooltipProvider>
      </QueryClientProvider>
    </ThemeContext.Provider>
  );
}

export default App;
