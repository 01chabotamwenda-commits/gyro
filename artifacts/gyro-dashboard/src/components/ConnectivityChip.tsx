import React from "react";
import { Wifi, WifiOff, WifiHigh, WifiLow, WifiZero, Bluetooth, Cable } from "lucide-react";
import {
  useGetConnectivity,
  getGetConnectivityQueryKey,
} from "@workspace/api-client-react";

function wifiIcon(quality: string | null | undefined) {
  switch (quality) {
    case "Excellent":
    case "Good":
      return <Wifi className="w-3.5 h-3.5 text-chart-3" />;
    case "Fair":
      return <WifiHigh className="w-3.5 h-3.5 text-amber-400" />;
    case "Weak":
      return <WifiLow className="w-3.5 h-3.5 text-orange-400" />;
    case "Very Weak":
      return <WifiZero className="w-3.5 h-3.5 text-destructive" />;
    default:
      return <Wifi className="w-3.5 h-3.5 text-muted-foreground" />;
  }
}

function formatUptime(s: number) {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
}

export function ConnectivityChip() {
  const { data } = useGetConnectivity({
    query: { refetchInterval: 3000, queryKey: getGetConnectivityQueryKey() },
  });

  if (!data) return null;

  const {
    mode, connected, ip, ssid, port, rssi, signalQuality,
    apClients, bleDevice, mac, firmwareVersion, uptimeSeconds,
  } = data;

  let icon: React.ReactNode;
  let primary: string;
  let tooltip: string;

  const uptime = formatUptime(uptimeSeconds);

  if (mode === "usb") {
    icon = (
      <Cable
        className={`w-3.5 h-3.5 ${connected ? "text-primary" : "text-muted-foreground"}`}
      />
    );
    primary = connected ? (port ?? "USB") : "USB disconnected";
    tooltip = [
      "Mode: USB Serial",
      `Port: ${port ?? "—"}`,
      `Firmware: ${firmwareVersion ?? "—"}`,
      `Uptime: ${uptime}`,
    ].join("\n");
  } else if (mode === "wifi_sta") {
    icon = wifiIcon(signalQuality);
    primary = ip ?? "connecting...";
    tooltip = [
      "Mode: WiFi Station",
      `SSID: ${ssid ?? "—"}`,
      `IP: ${ip ?? "—"}`,
      `Signal: ${rssi} dBm (${signalQuality})`,
      `MAC: ${mac ?? "—"}`,
      `Firmware: ${firmwareVersion ?? "—"}`,
      `Uptime: ${uptime}`,
    ].join("\n");
  } else if (mode === "wifi_ap") {
    icon = <Wifi className="w-3.5 h-3.5 text-primary" />;
    primary = ip ?? "192.168.4.1";
    tooltip = [
      "Mode: WiFi Hotspot",
      `SSID: ${ssid ?? "—"}`,
      `IP: ${ip ?? "192.168.4.1"}`,
      `Clients: ${apClients ?? 0}`,
      `MAC: ${mac ?? "—"}`,
      `Firmware: ${firmwareVersion ?? "—"}`,
      `Uptime: ${uptime}`,
    ].join("\n");
  } else if (mode === "ble") {
    icon = (
      <Bluetooth
        className={`w-3.5 h-3.5 ${connected ? "text-primary" : "text-muted-foreground"}`}
      />
    );
    primary = connected ? (bleDevice ?? "Paired") : "Not paired";
    tooltip = [
      "Mode: Bluetooth BLE",
      `Status: ${connected ? `Paired — ${bleDevice}` : "Waiting for connection"}`,
      `MAC: ${mac ?? "—"}`,
      `Firmware: ${firmwareVersion ?? "—"}`,
      `Uptime: ${uptime}`,
    ].join("\n");
  } else {
    icon = <WifiOff className="w-3.5 h-3.5 text-muted-foreground" />;
    primary = "No link";
    tooltip = [
      "Mode: None",
      `MAC: ${mac ?? "—"}`,
      `Firmware: ${firmwareVersion ?? "—"}`,
    ].join("\n");
  }

  return (
    <span
      className="hidden sm:flex items-center gap-1.5 text-xs text-muted-foreground cursor-default select-none border border-border/60 rounded px-2 py-0.5"
      title={tooltip}
    >
      {icon}
      <span className="font-mono">{primary}</span>
    </span>
  );
}
