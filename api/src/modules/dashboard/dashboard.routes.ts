import { Router } from "express";

import { getDashboardSummaryController } from "./dashboard.controller";
import { requireAuth } from "../../middlewares/auth.middleware";
import { requireCompletedOnboarding } from "../../middlewares/onboarding.middleware";

const router = Router();

router.get("/dashboard/summary", requireAuth, requireCompletedOnboarding, (req, res) => {
  getDashboardSummaryController(req, res);
});

export default router;
