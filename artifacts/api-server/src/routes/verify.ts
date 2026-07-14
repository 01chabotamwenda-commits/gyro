/**
 * verify.ts
 *
 * POST /api/verify/motor-confirm
 *   Records the operator's answer after the motor sweep dialog:
 *   - motorDidSpin: true  → motor is OK; IR sensor is disconnected / faulty
 *   - motorDidSpin: false → motor did not respond; check ESC wiring / power
 */

import { Router } from "express";
import { fireAlert } from "../lib/motor";
import { logger } from "../lib/logger";

const router = Router();

router.post("/verify/motor-confirm", async (req, res) => {
  try {
    const { motorDidSpin, sessionId } = req.body as {
      motorDidSpin: unknown;
      sessionId?: unknown;
    };

    // Require an explicit boolean — do not accept undefined or a truthy string
    if (typeof motorDidSpin !== "boolean") {
      return res.status(400).json({
        ok: false,
        error: "motorDidSpin must be a boolean (true or false)",
      });
    }

    const sid =
      typeof sessionId === "number" && Number.isFinite(sessionId)
        ? sessionId
        : null;

    if (motorDidSpin) {
      await fireAlert(
        sid,
        "warning",
        "[OPERATOR] Motor sweep confirmed: motor DID spin. " +
          "IR speed sensor is not reporting — check its wiring, alignment with rotor disc, " +
          "and power supply (5 V to sensor, signal wire to ESP32 GPIO). " +
          "Motor operation can continue but RPM feedback will be absent.",
      ).catch(() => {});
      logger.info({ sessionId: sid }, "Operator confirmed motor spun — IR sensor issue");
    } else {
      await fireAlert(
        sid,
        "critical",
        "[OPERATOR] Motor sweep confirmed: motor did NOT spin. " +
          "Check ESC power supply (12–24 V), PWM signal wire from ESP32 (GPIO), " +
          "motor phase wiring (A/B/C), and ESC arming sequence. " +
          "Do NOT start the motor until wiring is verified.",
      ).catch(() => {});
      logger.warn({ sessionId: sid }, "Operator confirmed motor did not spin — ESC/motor issue");
    }

    return res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "motor-confirm error");
    return res.status(500).json({ ok: false, error: "Internal server error" });
  }
});

export default router;
