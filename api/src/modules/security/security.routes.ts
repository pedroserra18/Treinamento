import { Router } from "express";
import { getSecurityMetricsController } from "./security.controller";
import { requireAuth } from "../../middlewares/auth.middleware";
import { requireAdminRole } from "../../middlewares/role.middleware";

const router = Router();

router.get("/security/metrics", requireAuth, requireAdminRole, (req, res) => {
  getSecurityMetricsController(req, res);
});

export default router;
