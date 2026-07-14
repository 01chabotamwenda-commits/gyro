import { Router } from "express";

const router = Router();

// Data mode endpoint is deprecated — no demo/simulator exists.
// Always returns "real".
router.get("/data-mode", (_req, res) => {
  return res.json({ mode: "real" });
});

router.post("/data-mode", (_req, res) => {
  return res.json({ mode: "real" });
});

export default router;
