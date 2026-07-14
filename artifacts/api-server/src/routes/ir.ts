/**
 * ir.ts — IR remote command ingest
 *
 * POST /api/ir/command  — called by the serial bridge when the ESP32 sends
 *                         a CMD: or PID_* line originating from the IR remote.
 *                         Broadcasts an `ir_command` WebSocket event so the
 *                         dashboard can display a live command feed.
 */

import { Router } from "express";
import { logger } from "../lib/logger";
import { broadcastToClients } from "../lib/hardware-mode";

const router = Router();

router.post("/ir/command", (req, res) => {
  const { line } = req.body as { line?: string };
  if (!line || typeof line !== "string") {
    res.status(400).json({ error: "line required" });
    return;
  }

  const trimmed = line.trim();
  if (!trimmed) {
    res.status(400).json({ error: "empty line" });
    return;
  }

  logger.debug({ line: trimmed }, "ir_command received");

  broadcastToClients({
    type: "ir_command",
    data: { line: trimmed, timestamp: new Date().toISOString() },
  });

  res.json({ ok: true });
});

export default router;
