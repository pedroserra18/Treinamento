import { Router } from "express";

const router = Router();

router.get("/health", (_req, res) => {
  res.status(200).json({ status: "ok", service: "acad-api", timestamp: new Date().toISOString() });
});

export default router;
