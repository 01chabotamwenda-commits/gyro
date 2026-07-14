import { getConnectedAt } from "./hardware-mode";

export type ConnectivityMode = "wifi_sta" | "wifi_ap" | "ble" | "usb" | "none";

export interface ConnectivityStatus {
  mode: ConnectivityMode;
  connected: boolean;
  mac: string | null;
  ip: string | null;
  ssid: string | null;
  port: string | null;
  rssi: number | null;
  signalQuality: string | null;
  apClients: number | null;
  bleDevice: string | null;
  firmwareVersion: string | null;
  uptimeSeconds: number;
}

export interface ConnectivityConfig {
  mode: ConnectivityMode;
  wifiSsid: string;
  wifiPasswordSet: boolean;
  wifiUseStaticIp: boolean;
  wifiStaticIp: string | null;
  wifiSubnet: string | null;
  wifiGateway: string | null;
  apSsid: string;
  apChannel: number;
  apMaxConn: number;
  bleName: string;
}

export interface ConnectivityConfigInput {
  mode?: ConnectivityMode;
  wifiSsid?: string;
  wifiPassword?: string;
  wifiUseStaticIp?: boolean;
  wifiStaticIp?: string;
  wifiSubnet?: string;
  wifiGateway?: string;
  apSsid?: string;
  apPassword?: string;
  apChannel?: number;
  apMaxConn?: number;
  bleName?: string;
}

function rssiToQuality(rssi: number): string {
  if (rssi >= -50) return "Excellent";
  if (rssi >= -60) return "Good";
  if (rssi >= -70) return "Fair";
  if (rssi >= -80) return "Weak";
  return "Very Weak";
}

let config: ConnectivityConfig = {
  mode: "none",
  wifiSsid: "",
  wifiPasswordSet: false,
  wifiUseStaticIp: false,
  wifiStaticIp: null,
  wifiSubnet: null,
  wifiGateway: null,
  apSsid: "GyroMonitor",
  apChannel: 6,
  apMaxConn: 4,
  bleName: "GyroMonitor",
};

let apClients = 0;
let bleDevice: string | null = null;
let baseRssi = -63;

/** Real-time hardware info passed in from the device-info handshake. */
let _deviceInfo: { mac: string | null; ip: string | null; ssid: string | null; firmwareVersion: string | null; port: string | null } | null = null;

export function setHardwareDeviceInfo(info: {
  mac?: string | null;
  ip?: string | null;
  ssid?: string | null;
  firmwareVersion?: string | null;
  port?: string | null;
}): void {
  _deviceInfo = {
    mac: info.mac ?? null,
    ip: info.ip ?? null,
    ssid: info.ssid ?? null,
    firmwareVersion: info.firmwareVersion ?? null,
    port: info.port ?? null,
  };
}

export function clearHardwareDeviceInfo(): void {
  _deviceInfo = null;
}

export function getConnectivityStatus(): ConnectivityStatus {
  // Uptime counts from hardware connection time, not server boot time.
  // Zero when no hardware is connected.
  const connectedAt = getConnectedAt();
  const uptimeSeconds = connectedAt
    ? Math.floor((Date.now() - connectedAt.getTime()) / 1000)
    : 0;
  const rssi = baseRssi;

  // USB mode: when the device is connected via serial, report real hardware info
  if (config.mode === "usb" && _deviceInfo) {
    return {
      mode: "usb",
      connected: true,
      mac: _deviceInfo.mac,
      ip: _deviceInfo.ip,
      ssid: _deviceInfo.ssid,
      port: _deviceInfo.port,
      rssi: null,
      signalQuality: null,
      apClients: null,
      bleDevice: null,
      firmwareVersion: _deviceInfo.firmwareVersion,
      uptimeSeconds,
    };
  }

  // USB mode but no hardware info yet (disconnected)
  if (config.mode === "usb") {
    return {
      mode: "usb",
      connected: false,
      mac: null,
      ip: null,
      ssid: null,
      port: null,
      rssi: null,
      signalQuality: null,
      apClients: null,
      bleDevice: null,
      firmwareVersion: null,
      uptimeSeconds,
    };
  }

  switch (config.mode) {
    case "wifi_sta":
      return {
        mode: "wifi_sta",
        connected: _deviceInfo !== null,
        mac: _deviceInfo?.mac ?? null,
        ip: _deviceInfo?.ip ?? null,
        ssid: config.wifiSsid || null,
        port: null,
        rssi: _deviceInfo !== null ? rssi : null,
        signalQuality: _deviceInfo !== null ? rssiToQuality(rssi) : null,
        apClients: null,
        bleDevice: null,
        firmwareVersion: _deviceInfo?.firmwareVersion ?? null,
        uptimeSeconds,
      };
    case "wifi_ap":
      return {
        mode: "wifi_ap",
        connected: _deviceInfo !== null,
        mac: _deviceInfo?.mac ?? null,
        ip: null,
        ssid: config.apSsid,
        port: null,
        rssi: null,
        signalQuality: null,
        apClients,
        bleDevice: null,
        firmwareVersion: _deviceInfo?.firmwareVersion ?? null,
        uptimeSeconds,
      };
    case "ble":
      return {
        mode: "ble",
        connected: bleDevice !== null,
        mac: _deviceInfo?.mac ?? null,
        ip: null,
        ssid: null,
        port: null,
        rssi: null,
        signalQuality: null,
        apClients: null,
        bleDevice,
        firmwareVersion: _deviceInfo?.firmwareVersion ?? null,
        uptimeSeconds,
      };
    default:
      return {
        mode: "none",
        connected: false,
        mac: null,
        ip: null,
        ssid: null,
        port: null,
        rssi: null,
        signalQuality: null,
        apClients: null,
        bleDevice: null,
        firmwareVersion: null,
        uptimeSeconds,
      };
  }
}

export function setConnectivityMode(mode: ConnectivityMode): void {
  config.mode = mode;
}

export function getConnectivityConfig(): ConnectivityConfig {
  return { ...config };
}

export function updateConnectivityConfig(input: ConnectivityConfigInput): ConnectivityConfig {
  if (input.mode !== undefined) config.mode = input.mode;
  if (input.wifiSsid !== undefined) config.wifiSsid = input.wifiSsid;
  if (input.wifiPassword !== undefined && input.wifiPassword.length > 0) {
    config.wifiPasswordSet = true;
  }
  if (input.wifiUseStaticIp !== undefined) config.wifiUseStaticIp = input.wifiUseStaticIp;
  if (input.wifiStaticIp !== undefined) config.wifiStaticIp = input.wifiStaticIp;
  if (input.wifiSubnet !== undefined) config.wifiSubnet = input.wifiSubnet;
  if (input.wifiGateway !== undefined) config.wifiGateway = input.wifiGateway;
  if (input.apSsid !== undefined) config.apSsid = input.apSsid;
  if (input.apChannel !== undefined) config.apChannel = input.apChannel;
  if (input.apMaxConn !== undefined) config.apMaxConn = input.apMaxConn;
  if (input.bleName !== undefined) config.bleName = input.bleName;
  return { ...config };
}
