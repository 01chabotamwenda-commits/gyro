interface Window {
  serialBridge?: {
    writeRaw: (text: string) => Promise<{ ok: boolean; error?: string }>;
  };
}
