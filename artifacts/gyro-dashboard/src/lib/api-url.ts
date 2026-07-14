/**
 * api-url.ts — resolves relative "/api/..." paths against the Electron
 * desktop app's API base URL when running packaged.
 *
 * The desktop app loads the frontend via `loadFile()` (a `file://` origin),
 * not `http://`. Relative fetch("/api/...") calls resolve against that
 * file:// origin and always fail there — only absolute URLs work. In a
 * normal browser (or the Replit dev/preview proxy), there's no
 * __GYRO_API_BASE__ and relative paths work fine as-is.
 *
 * The Electron preload script injects window.__GYRO_API_BASE__ (e.g.
 * "http://127.0.0.1:8050") via contextBridge — see desktop/src/preload.js.
 */
const API_BASE =
  (typeof window !== "undefined" &&
    (window as unknown as { __GYRO_API_BASE__?: string }).__GYRO_API_BASE__) ||
  "";

export function apiUrl(path: string): string {
  return API_BASE ? `${API_BASE}${path}` : path;
}
