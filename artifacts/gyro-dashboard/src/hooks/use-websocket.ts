import { useEffect, useRef, useState } from 'react';
import type { SensorReading, Alert, DeviceInfo } from "@workspace/api-client-react";

export interface IrCommandEvent {
  line: string;
  timestamp: string;
}

export interface MotorSweepConfirmPayload {
  sessionId: number;
  sweepRpm: number;
  durationSec: number;
  message: string;
}

/** SensorReading plus extra live-only fields the firmware sends but that
 *  aren't persisted to the DB (see ingest.ts). */
export type ExtendedSensorReading = SensorReading & {
  mode?: 'auto' | 'manual';
  pidOutput?: number;
  pidTilt?: number;
};

export interface AngleRefEvent {
  refX: number;
  refY: number;
}

type WsMessage =
  | { type: 'reading'; data: ExtendedSensorReading }
  | { type: 'alert'; data: Alert }
  | { type: 'hardware_connected'; data: { port: string; connectedAt: string; deviceInfo: DeviceInfo | null } }
  | { type: 'hardware_disconnected'; data: { timestamp: string } }
  | { type: 'hardware_grace'; data: { timestamp: string; graceMs: number } }
  | { type: 'hardware_reconnected'; data: { timestamp: string } }
  | { type: 'session_update'; data: { id: string; status: string; stoppedAt: string | null; motorState: string } }
  | { type: 'ir_command'; data: IrCommandEvent }
  | { type: 'motor_sweep_confirm'; data: MotorSweepConfirmPayload }
  | { type: 'ref_reset'; data: AngleRefEvent }
  | { type: 'session_reset'; data: { id: string } };

/** Resolve the WebSocket URL.
 *  - In Electron: the preload injects __GYRO_WS_URL__ (e.g. "ws://127.0.0.1:8050/api/ws").
 *  - In a browser: derive from window.location so it works behind any proxy.
 */
function resolveWsUrl(): string {
  const w = window as unknown as { __GYRO_WS_URL__?: string };
  if (w.__GYRO_WS_URL__) return w.__GYRO_WS_URL__;
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}/api/ws`;
}

export interface HardwareConnectedEvent {
  port: string;
  connectedAt: string;
  deviceInfo: DeviceInfo | null;
}

export interface SessionUpdateEvent {
  id: string;
  status: string;
  stoppedAt: string | null;
  motorState: string;
}

export function useDashboardWebSocket(
  onHardwareConnected?: (event: HardwareConnectedEvent) => void,
  onSessionUpdate?: (event: SessionUpdateEvent) => void,
  onSessionReset?: (event: { id: string }) => void,
) {
  const [latestReading, setLatestReading] = useState<ExtendedSensorReading | null>(null);
  const [latestAlert, setLatestAlert] = useState<Alert | null>(null);
  const [latestIrCommand, setLatestIrCommand] = useState<IrCommandEvent | null>(null);
  const [motorSweepConfirm, setMotorSweepConfirm] = useState<MotorSweepConfirmPayload | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [hardwareConnectedAt, setHardwareConnectedAt] = useState<string | null>(null);
  const [connectedDeviceInfo, setConnectedDeviceInfo] = useState<DeviceInfo | null>(null);
  const [lastReadingAt, setLastReadingAt] = useState<Date | null>(null);
  // True while the server is inside its post-disconnect grace window (item 1)
  // — the link dropped but the session hasn't been closed yet, awaiting
  // reconnect. Distinct from a hard "hardware_disconnected", which means the
  // grace window elapsed and the session was actually torn down.
  const [hardwareGrace, setHardwareGrace] = useState(false);
  const [angleRef, setAngleRef] = useState<AngleRefEvent>({ refX: 0, refY: 0 });
  const wsRef = useRef<WebSocket | null>(null);
  const callbackRef = useRef(onHardwareConnected);
  const sessionCallbackRef = useRef(onSessionUpdate);
  const sessionResetCallbackRef = useRef(onSessionReset);
  useEffect(() => { callbackRef.current = onHardwareConnected; }, [onHardwareConnected]);
  useEffect(() => { sessionCallbackRef.current = onSessionUpdate; }, [onSessionUpdate]);
  useEffect(() => { sessionResetCallbackRef.current = onSessionReset; }, [onSessionReset]);

  useEffect(() => {
    let reconnectTimeout: ReturnType<typeof setTimeout>;

    function connect() {
      const wsUrl = resolveWsUrl();
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => setIsConnected(true);

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data) as WsMessage;
          console.debug(`[ws] received ${msg.type}`, msg);

          if (msg.type === 'reading') {
            setLatestReading(msg.data);
            setLastReadingAt(new Date());
          } else if (msg.type === 'alert') {
            setLatestAlert(msg.data);
          } else if (msg.type === 'ir_command') {
            setLatestIrCommand(msg.data);
          } else if (msg.type === 'hardware_connected') {
            setHardwareConnectedAt(msg.data.connectedAt);
            setConnectedDeviceInfo(msg.data.deviceInfo);
            console.info(`[ws] hardware connected at ${msg.data.connectedAt}`);
            callbackRef.current?.(msg.data);
          } else if (msg.type === 'hardware_disconnected') {
            setHardwareConnectedAt(null);
            setConnectedDeviceInfo(null);
            setHardwareGrace(false);
          } else if (msg.type === 'hardware_grace') {
            setHardwareGrace(true);
          } else if (msg.type === 'hardware_reconnected') {
            setHardwareGrace(false);
          } else if (msg.type === 'session_update') {
            console.info(`[ws] session_update: status=${msg.data.status}`);
            sessionCallbackRef.current?.(msg.data);
          } else if (msg.type === 'motor_sweep_confirm') {
            console.info(`[ws] motor_sweep_confirm for session ${msg.data.sessionId}`);
            setMotorSweepConfirm(msg.data);
          } else if (msg.type === 'ref_reset') {
            console.info(`[ws] ref_reset: refX=${msg.data.refX}, refY=${msg.data.refY}`);
            setAngleRef(msg.data);
          } else if (msg.type === 'session_reset') {
            console.info(`[ws] session_reset for session ${msg.data.id}`);
            sessionResetCallbackRef.current?.(msg.data);
          }
        } catch (err) {
          console.error(`[ws] parse error`, err);
        }
      };

      ws.onclose = () => {
        setIsConnected(false);
        reconnectTimeout = setTimeout(connect, 2000);
      };

      ws.onerror = () => ws.close();
    }

    connect();

    return () => {
      clearTimeout(reconnectTimeout);
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.close();
      }
    };
  }, []);

  return { latestReading, latestAlert, latestIrCommand, motorSweepConfirm, setMotorSweepConfirm, isConnected, hardwareConnectedAt, connectedDeviceInfo, lastReadingAt, angleRef, setAngleRef, hardwareGrace };
}
