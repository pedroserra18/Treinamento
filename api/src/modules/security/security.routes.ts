import { Router } from "express";

import { getSecurityMetricsController } from "./security.controller";

const router = Router();

router.get("/security/metrics", (req, res) => {
  getSecurityMetricsController(req, res);
});

export default router;
