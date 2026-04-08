import { Router } from "express";
import { requireAuth } from "../../middlewares/auth.middleware";
import { getDashboardSummaryController } from "./dashboard.controller";
import { requireCompletedOnboarding } from "../../middlewares/onboarding.middleware";

const router = Router();

router.get("/dashboard/summary", requireAuth, requireCompletedOnboarding, (req, res) => {
  getDashboardSummaryController(req, res);
});

export default router;
