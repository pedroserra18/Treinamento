import { Router } from "express";
import { requireAuth } from "../../middlewares/auth.middleware";
import { asyncHandler } from "../../shared/utils/async-handler";
import { workoutRecommendationsController } from "./recommendation.controller";
import { requireCompletedOnboarding } from "../../middlewares/onboarding.middleware";

const router = Router();

router.get(
  "/recommendations/workout",
  requireAuth,
  requireCompletedOnboarding,
  asyncHandler(async (req, res) => workoutRecommendationsController(req, res))
);

export default router;
