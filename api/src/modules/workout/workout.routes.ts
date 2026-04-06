import { Router } from "express";

import {
  completeWorkoutController,
  exploreWorkoutsController,
  getWorkoutRecommendationsController,
  listWorkoutHistoryController,
  startWorkoutController
} from "./workout.controller";
import {
  completeWorkoutBodySchema,
  completeWorkoutParamsSchema,
  exploreWorkoutsQuerySchema,
  listWorkoutHistoryQuerySchema,
  startWorkoutBodySchema
} from "./workout.schema";
import { requireAuth } from "../../middlewares/auth.middleware";
import { requireCompletedOnboarding } from "../../middlewares/onboarding.middleware";
import { validateRequest } from "../../middlewares/validation.middleware";
import { asyncHandler } from "../../shared/utils/async-handler";

const router = Router();

router.get(
  "/workouts/recommendations",
  requireAuth,
  requireCompletedOnboarding,
  asyncHandler(async (req, res) => getWorkoutRecommendationsController(req, res))
);

router.post(
  "/workouts/start",
  requireAuth,
  requireCompletedOnboarding,
  validateRequest({ body: startWorkoutBodySchema }),
  asyncHandler(async (req, res) => startWorkoutController(req, res))
);

router.post(
  "/workouts/:sessionId/complete",
  requireAuth,
  requireCompletedOnboarding,
  validateRequest({ params: completeWorkoutParamsSchema, body: completeWorkoutBodySchema }),
  asyncHandler(async (req, res) => completeWorkoutController(req, res))
);

router.get(
  "/workouts/history",
  requireAuth,
  requireCompletedOnboarding,
  validateRequest({ query: listWorkoutHistoryQuerySchema }),
  asyncHandler(async (req, res) => listWorkoutHistoryController(req, res))
);

router.get(
  "/workouts/explore",
  requireAuth,
  requireCompletedOnboarding,
  validateRequest({ query: exploreWorkoutsQuerySchema }),
  asyncHandler(async (req, res) => exploreWorkoutsController(req, res))
);

export default router;
