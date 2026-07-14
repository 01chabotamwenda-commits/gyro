import React, { useEffect, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Upload,
  CheckCircle2,
  XCircle,
  Cpu,
  FileCode2,
  TriangleAlert,
  Wifi,
  WifiOff,
  RefreshCw,
} from "lucide-react";
import { useGetConnectivity } from "@workspace/api-client-react";
import { apiUrl } from "@/lib/api-url";

type UploadState = "idle" | "uploading" | "flashing" | "rebooting" | "success" | "error";

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function FirmwarePanel() {
  const inputRef = useRef<HTMLInputElement>(null);
  const xhrRef = useRef<XMLHttpRequest | null>(null);
  const rebootPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [file, setFile] = useState<File | null>(null);
  const [state, setState] = useState<UploadState>("idle");
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState("");

  // Live connectivity — poll every 3 s so user sees when ESP32 connects/disconnects
  const { data: connectivity, refetch: refetchConn } = useGetConnectivity({
    query: { refetchInterval: 3000, queryKey: ["connectivity"] },
  });

  const esp32Connected = connectivity?.connected === true;
  const esp32Ip = connectivity?.ip ?? null;

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    setFile(f);
    setState("idle");
    setProgress(0);
    setMessage("");
  }

  function handleUpload() {
    if (!file || !esp32Connected) return;

    setState("uploading");
    setProgress(0);
    setMessage("");

    const xhr = new XMLHttpRequest();
    xhrRef.current = xhr;

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        // Upload phase = 0–50 %
        setProgress(Math.round((e.loaded / e.total) * 50));
      }
    };

    xhr.upload.onload = () => {
      // File reached server — entering flash phase
      setState("flashing");
      setProgress(52);
    };

    xhr.onload = () => {
      if (xhr.status === 200) {
        try {
          const data = JSON.parse(xhr.responseText) as {
            success: boolean;
            message: string;
          };
          if (data.success) {
            setState("rebooting");
            setProgress(95);
            setMessage(data.message);
            startRebootPolling();
          } else {
            setState("error");
            setMessage(data.message || "Flash failed");
          }
        } catch {
          setState("error");
          setMessage("Unexpected server response");
        }
      } else {
        let errMsg = `Server error ${xhr.status}`;
        try {
          const d = JSON.parse(xhr.responseText);
          if (d.message) errMsg = d.message;
        } catch {}
        setState("error");
        setMessage(errMsg);
      }
    };

    xhr.onerror = () => {
      setState("error");
      setMessage("Network error — check server connection");
    };

    xhr.open("POST", apiUrl("/api/firmware/upload"));
    xhr.setRequestHeader("Content-Type", "application/octet-stream");
    xhr.setRequestHeader("X-Firmware-Filename", file.name);
    xhr.send(file);
  }

  /**
   * After the ESP32 confirms flash, it reboots (~3–8 s).
   * Poll connectivity until it comes back online, then mark success.
   */
  function startRebootPolling() {
    let attempts = 0;
    const MAX_ATTEMPTS = 30; // 30 × 2 s = 60 s max wait

    rebootPollRef.current = setInterval(async () => {
      attempts++;
      try {
        const res = await fetch(apiUrl("/api/connectivity"));
        if (res.ok) {
          const data = (await res.json()) as { connected: boolean };
          if (data.connected) {
            clearInterval(rebootPollRef.current!);
            rebootPollRef.current = null;
            setState("success");
            setProgress(100);
            refetchConn();
            return;
          }
        }
      } catch {
        // device still rebooting — keep polling
      }

      if (attempts >= MAX_ATTEMPTS) {
        clearInterval(rebootPollRef.current!);
        rebootPollRef.current = null;
        // Flash succeeded but device didn't reconnect in time — still a soft success
        setState("success");
        setProgress(100);
        setMessage((prev) => prev + " (device may still be rebooting)");
      }
    }, 2000);
  }

  // Clean up interval on unmount
  useEffect(() => {
    return () => {
      if (rebootPollRef.current) clearInterval(rebootPollRef.current);
    };
  }, []);

  function handleCancel() {
    xhrRef.current?.abort();
    if (rebootPollRef.current) {
      clearInterval(rebootPollRef.current);
      rebootPollRef.current = null;
    }
    setState("idle");
    setProgress(0);
    setMessage("");
    setFile(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  // Animate flashing progress 52 % → 92 % while server flashes
  useEffect(() => {
    if (state !== "flashing") return;
    const interval = setInterval(() => {
      setProgress((prev) => {
        const next = prev + Math.random() * 3.5 + 0.5;
        return Math.min(next, 92);
      });
    }, 140);
    return () => clearInterval(interval);
  }, [state]);

  const isRunning = state === "uploading" || state === "flashing" || state === "rebooting";

  const stateColor =
    state === "success"
      ? "text-chart-3"
      : state === "error"
        ? "text-destructive"
        : "text-muted-foreground";

  const stateLabel =
    state === "uploading"
      ? "Uploading to server…"
      : state === "flashing"
        ? "Flashing ESP32 via OTA…"
        : state === "rebooting"
          ? "Waiting for ESP32 to reboot…"
          : state === "success"
            ? "Flash complete"
            : state === "error"
              ? "Flash failed"
              : "";

  return (
    <Card className="bg-card border-border/70 shadow-sm">
      <CardHeader className="py-3 px-4 border-b border-border/70 bg-muted/30">
        <CardTitle className="text-xs font-bold tracking-wider text-muted-foreground uppercase flex items-center gap-2">
          <Cpu className="w-3.5 h-3.5" />
          Firmware Update (OTA)
        </CardTitle>
        <p className="text-[11px] text-muted-foreground mt-0.5">
          Upload a compiled <span className="font-mono">.bin</span> file to
          flash the ESP32 over-the-air.
        </p>
      </CardHeader>

      <CardContent className="p-4 space-y-4">

        {/* Connectivity status */}
        <div className={`flex items-center gap-2 rounded px-3 py-2 border text-[11px] font-medium ${
          esp32Connected
            ? "bg-chart-3/10 border-chart-3/30 text-chart-3"
            : "bg-muted/20 border-border/50 text-muted-foreground"
        }`}>
          {esp32Connected ? (
            <Wifi className="w-3.5 h-3.5 shrink-0" />
          ) : (
            <WifiOff className="w-3.5 h-3.5 shrink-0" />
          )}
          {esp32Connected ? (
            <span>
              ESP32 connected{esp32Ip ? <> — <span className="font-mono">{esp32Ip}</span></> : ""}
            </span>
          ) : (
            <span>ESP32 not connected — connect via WiFi before flashing</span>
          )}
        </div>

        {/* File picker */}
        <div>
          <p className="text-xs font-semibold text-foreground mb-2">
            Firmware binary
          </p>

          <div
            className={`flex items-center gap-3 border rounded px-3 py-2 cursor-pointer transition-colors ${
              file
                ? "border-border bg-muted/20"
                : "border-dashed border-border/60 bg-muted/10 hover:border-border"
            } ${isRunning ? "cursor-not-allowed opacity-60" : ""}`}
            onClick={() => !isRunning && inputRef.current?.click()}
          >
            <FileCode2 className="w-4 h-4 text-muted-foreground shrink-0" />
            {file ? (
              <div className="flex-1 min-w-0">
                <p className="text-xs font-mono text-foreground truncate">
                  {file.name}
                </p>
                <p className="text-[10px] text-muted-foreground">
                  {formatBytes(file.size)}
                </p>
              </div>
            ) : (
              <span className="text-xs text-muted-foreground">
                Click to select <span className="font-mono">.bin</span> file…
              </span>
            )}
          </div>

          <input
            ref={inputRef}
            type="file"
            accept=".bin"
            className="hidden"
            onChange={handleFileChange}
            disabled={isRunning}
          />
        </div>

        {/* Progress bar — visible when running or done */}
        {(isRunning || state === "success" || state === "error") && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className={`text-[11px] font-medium flex items-center gap-1.5 ${stateColor}`}>
                {state === "rebooting" && (
                  <RefreshCw className="w-3 h-3 animate-spin" />
                )}
                {stateLabel}
              </span>
              <span className="text-[11px] font-mono text-muted-foreground">
                {Math.round(progress)}%
              </span>
            </div>

            <div className="h-1.5 w-full bg-muted/40 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-150 ${
                  state === "success"
                    ? "bg-chart-3"
                    : state === "error"
                      ? "bg-destructive"
                      : state === "rebooting"
                        ? "bg-chart-2"
                        : state === "flashing"
                          ? "bg-chart-4"
                          : "bg-primary"
                }`}
                style={{ width: `${progress}%` }}
              />
            </div>

            {/* Phase labels */}
            <div className="flex justify-between text-[9px] text-muted-foreground">
              <span>Upload</span>
              <span>Flash</span>
              <span>Verify</span>
              <span>Boot</span>
            </div>
          </div>
        )}

        {/* Result message */}
        {state === "success" && message && (
          <div className="flex items-start gap-2 bg-chart-3/10 border border-chart-3/30 rounded px-3 py-2">
            <CheckCircle2 className="w-3.5 h-3.5 text-chart-3 shrink-0 mt-0.5" />
            <div>
              <p className="text-xs text-chart-3 font-semibold">
                OTA flash successful
              </p>
              <p className="text-[10px] text-chart-3/80 mt-0.5">{message}</p>
            </div>
          </div>
        )}

        {state === "error" && message && (
          <div className="flex items-start gap-2 bg-destructive/10 border border-destructive/30 rounded px-3 py-2">
            <XCircle className="w-3.5 h-3.5 text-destructive shrink-0 mt-0.5" />
            <div>
              <p className="text-xs text-destructive font-semibold">
                Flash failed
              </p>
              <p className="text-[10px] text-destructive/80 mt-0.5">
                {message}
              </p>
            </div>
          </div>
        )}

        {/* Notice */}
        <div className="flex items-start gap-2 bg-muted/20 border border-border/50 rounded px-3 py-2">
          <TriangleAlert className="w-3 h-3 text-muted-foreground shrink-0 mt-0.5" />
          <p className="text-[10px] text-muted-foreground leading-relaxed">
            The ESP32 must be connected via WiFi and running firmware with the{" "}
            <span className="font-mono">/update</span> HTTP handler (included in
            v3.0+). The gyroscope will stop and reboot automatically after flashing.
          </p>
        </div>

        {/* Action buttons */}
        <div className="flex gap-2 justify-end pt-1">
          {isRunning ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={handleCancel}
              className="text-muted-foreground border-border"
            >
              Cancel
            </Button>
          ) : (
            <>
              {(state === "success" || state === "error") && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={handleCancel}
                  className="text-muted-foreground border-border"
                >
                  Reset
                </Button>
              )}
              <Button
                type="button"
                size="sm"
                onClick={handleUpload}
                disabled={!file || !esp32Connected}
                title={!esp32Connected ? "Connect ESP32 via WiFi first" : undefined}
                className="bg-primary hover:bg-primary/90 text-primary-foreground font-bold px-5 disabled:opacity-50"
              >
                <Upload className="w-3.5 h-3.5 mr-2" />
                Flash firmware
              </Button>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
