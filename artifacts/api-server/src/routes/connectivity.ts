import { Router } from "express";
import {
  getConnectivityStatus,
  getConnectivityConfig,
  updateConnectivityConfig,
  type ConnectivityConfigInput,
} from "../lib/connectivityStore";
import { logger } from "../lib/logger";

const router = Router();

router.get("/connectivity", (_req, res) => {
  return res.json(getConnectivityStatus());
});

router.get("/connectivity/config", (_req, res) => {
  return res.json(getConnectivityConfig());
});

router.put("/connectivity/config", (req, res) => {
  try {
    const input = req.body as ConnectivityConfigInput;
    const updated = updateConnectivityConfig(input);
    logger.info({ mode: updated.mode }, "Connectivity config updated");
    return res.json(updated);
  } catch (err) {
    logger.error({ err }, "Failed to update connectivity config");
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
