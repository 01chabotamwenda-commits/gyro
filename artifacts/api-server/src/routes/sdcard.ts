import { Router } from "express";
import { getSdCardState, syncSdCard, toggleSdCardConnection } from "../lib/sdCardStore";
import { logger } from "../lib/logger";

const router = Router();

router.get("/sdcard", (_req, res) => {
  return res.json(getSdCardState());
});

router.post("/sdcard/sync", (_req, res) => {
  try {
    const state = getSdCardState();
    if (!state.connected) {
      return res.json({
        ok: false, recordsSynced: 0,
        message: "SD card is not connected",
        lastSyncAt: state.lastSyncAt ?? new Date().toISOString(),
      });
    }
    const result = syncSdCard();
    logger.info({ recordsSynced: result.recordsSynced }, "SD card synced");
    return res.json({
      ok: true, recordsSynced: result.recordsSynced,
      message: `Synced ${result.recordsSynced} records from SD card`,
      lastSyncAt: result.lastSyncAt,
    });
  } catch (err) {
    logger.error({ err }, "Failed to sync SD card");
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/sdcard/toggle", (_req, res) => {
  const newState = toggleSdCardConnection();
  logger.info({ connected: newState.connected }, "SD card connection toggled");
  return res.json(newState);
});

export default router;
