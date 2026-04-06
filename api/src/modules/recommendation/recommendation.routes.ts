import { Router } from "express";

import { workoutRecommendationsController } from "./recommendation.controller";
import { requireAuth } from "../../middlewares/auth.middleware";
import { requireCompletedOnboarding } from "../../middlewares/onboarding.middleware";
import { asyncHandler } from "../../shared/utils/async-handler";

const router = Router();

router.get(
  "/recommendations/workout",
  requireAuth,
  requireCompletedOnboarding,
  asyncHandler(async (req, res) => workoutRecommendationsController(req, res))
);

export default router;
