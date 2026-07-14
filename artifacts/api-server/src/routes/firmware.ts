import express, { Router } from "express";
import { getConnectivityStatus } from "../lib/connectivityStore.js";

const router = Router();

router.post(
  "/firmware/upload",
  express.raw({ type: "application/octet-stream", limit: "16mb" }),
  async (req, res) => {
    const filename =
      (req.headers["x-firmware-filename"] as string) || "firmware.bin";
    const body = req.body as Buffer;

    if (!Buffer.isBuffer(body) || body.length === 0) {
      res
        .status(400)
        .json({ success: false, message: "No firmware binary received" });
      return;
    }

    req.log.info({ filename, sizeBytes: body.length }, "Firmware OTA upload received");

    const status = getConnectivityStatus();
    const esp32Ip = status.ip;

    if (!esp32Ip) {
      res.status(503).json({
        success: false,
        message:
          "No ESP32 IP address known — connect the device via WiFi first (the IP is reported in the device-info handshake).",
      });
      return;
    }

    // ESP32 firmware uses Arduino WebServer's multipart upload handler
    // (httpServer.on("/update", HTTP_POST, handleOtaFinish, handleOtaUpload))
    // which calls httpServer.upload() — it requires multipart/form-data,
    // NOT application/octet-stream.
    try {
      const blob = new Blob([new Uint8Array(body as unknown as ArrayBuffer)], { type: "application/octet-stream" });
      const formData = new FormData();
      formData.append("update", blob, filename);

      const esp32Res = await fetch(`http://${esp32Ip}/update`, {
        method: "POST",
        body: formData,
        // @ts-ignore — Node fetch signal for timeout
        signal: AbortSignal.timeout(60_000),
      });

      if (!esp32Res.ok) {
        const text = await esp32Res.text().catch(() => "");
        req.log.error(
          { status: esp32Res.status, body: text },
          "ESP32 OTA rejected the binary"
        );
        res.status(502).json({
          success: false,
          message: `ESP32 rejected firmware (HTTP ${esp32Res.status})${text ? ": " + text : ""}. Make sure the device is running the latest firmware with the /update handler enabled.`,
        });
        return;
      }

      const sizeKb = (body.length / 1024).toFixed(1);
      req.log.info({ filename, sizeKb, esp32Ip }, "OTA flash successful — ESP32 rebooting");

      res.json({
        success: true,
        message: `Firmware flashed — ${sizeKb} KB written to ESP32 at ${esp32Ip}. Device is rebooting…`,
        filename,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      req.log.error({ err: msg, esp32Ip }, "OTA upload to ESP32 failed");
      res.status(502).json({
        success: false,
        message: `Could not reach ESP32 at ${esp32Ip}: ${msg}. Check that the device is on the same network and WiFi is active.`,
      });
    }
  }
);

export default router;
