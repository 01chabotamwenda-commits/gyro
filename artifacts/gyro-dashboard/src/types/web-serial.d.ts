/**
 * Web Serial API type declarations (not included in standard lib.dom yet).
 *
 * These types are supported in Chrome/Edge 89+ and Firefox with polyfill.
 */

interface SerialPortInfo {
  usbVendorId?: number;
  usbProductId?: number;
}

interface SerialPortRequestOptions {
  filters?: Array<{ usbVendorId?: number; usbProductId?: number }>;
}

interface SerialPort extends EventTarget {
  readable: ReadableStream<Uint8Array>;
  writable: WritableStream<Uint8Array>;
  getInfo(): SerialPortInfo;
  open(options: { baudRate: number; dataBits?: number; stopBits?: number; parity?: "none" | "even" | "odd"; bufferSize?: number; flowControl?: "none" | "hardware" }): Promise<void>;
  close(): Promise<void>;
  setSignals(signals: { dataTerminalReady?: boolean; requestToSend?: boolean; break?: boolean }): Promise<void>;
  getSignals(): Promise<{ dataCarrierDetect: boolean; clearToSend: boolean; ringIndicator: boolean; dataSetReady: boolean }>;
}

interface Serial extends EventTarget {
  getPorts(): Promise<SerialPort[]>;
  requestPort(options?: SerialPortRequestOptions): Promise<SerialPort>;
  addEventListener(type: string, listener: EventListenerOrEventListenerObject, options?: boolean | AddEventListenerOptions): void;
  removeEventListener(type: string, listener: EventListenerOrEventListenerObject, options?: boolean | EventListenerOptions): void;
}

interface Navigator {
  serial?: Serial;
}
