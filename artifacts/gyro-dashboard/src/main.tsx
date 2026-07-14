import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { setBaseUrl } from "@workspace/api-client-react";
import "@/lib/web-serial-bridge";

// When running inside Electron, the preload script injects __GYRO_API_BASE__
// (e.g. "http://127.0.0.1:8050") via contextBridge.
// In a normal browser the value is undefined and we keep using relative URLs,
// which are handled by the Replit / Vite reverse proxy.
const w = window as unknown as { __GYRO_API_BASE__?: string };
if (w.__GYRO_API_BASE__) {
  setBaseUrl(w.__GYRO_API_BASE__);
}

createRoot(document.getElementById("root")!).render(<App />);
