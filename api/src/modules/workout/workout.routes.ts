import { Router } from "express";
import { requireAuth } from "../../middlewares/auth.middleware";
import { asyncHandler } from "../../shared/utils/async-handler";
import { validateRequest } from "../../middlewares/validation.middleware";
import { requireCompletedOnboarding } from "../../middlewares/onboarding.middleware";
import {
  addPlanExerciseBodySchema,
  completeWorkoutBodySchema,
  completeWorkoutParamsSchema,
  createManualHistoryBodySchema,
  createWorkoutPlanBodySchema,
  exploreWorkoutsQuerySchema,
  historySessionParamsSchema,
  listWorkoutHistoryQuerySchema,
  planExerciseParamsSchema,
  recommendationTemplateQuerySchema,
  reorderPlanExercisesBodySchema,
  searchExercisesQuerySchema,
  startWorkoutBodySchema
  ,
  updateWorkoutPlanBodySchema,
  updatePlanExerciseBodySchema,
  updateWorkoutDurationBodySchema,
  workoutPlanParamsSchema
} from "./workout.schema";
import {
  addPlanExerciseController,
  completeWorkoutController,
  createManualHistoryController,
  createWorkoutPlanController,
  deletePlanExerciseController,
  deleteWorkoutPlanController,
  exploreWorkoutsController,
  getWorkoutRecommendationsController,
  listWorkoutHistoryController,
  listWorkoutPlansController,
  recommendationTemplatesController,
  reorderPlanExercisesController,
  searchExercisesController,
  startWorkoutController
  ,
  updateWorkoutPlanController,
  updatePlanExerciseController,
  updateWorkoutHistoryDurationController
} from "./workout.controller";

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

router.get(
  "/workouts/plans",
  requireAuth,
  requireCompletedOnboarding,
  asyncHandler(async (req, res) => listWorkoutPlansController(req, res))
);

router.post(
  "/workouts/plans",
  requireAuth,
  requireCompletedOnboarding,
  validateRequest({ body: createWorkoutPlanBodySchema }),
  asyncHandler(async (req, res) => createWorkoutPlanController(req, res))
);

router.delete(
  "/workouts/plans/:planId",
  requireAuth,
  requireCompletedOnboarding,
  validateRequest({ params: workoutPlanParamsSchema }),
  asyncHandler(async (req, res) => deleteWorkoutPlanController(req, res))
);

router.patch(
  "/workouts/plans/:planId",
  requireAuth,
  requireCompletedOnboarding,
  validateRequest({ params: workoutPlanParamsSchema, body: updateWorkoutPlanBodySchema }),
  asyncHandler(async (req, res) => updateWorkoutPlanController(req, res))
);

router.post(
  "/workouts/plans/:planId/exercises",
  requireAuth,
  requireCompletedOnboarding,
  validateRequest({ params: workoutPlanParamsSchema, body: addPlanExerciseBodySchema }),
  asyncHandler(async (req, res) => addPlanExerciseController(req, res))
);

router.patch(
  "/workouts/plans/:planId/exercises/reorder",
  requireAuth,
  requireCompletedOnboarding,
  validateRequest({ params: workoutPlanParamsSchema, body: reorderPlanExercisesBodySchema }),
  asyncHandler(async (req, res) => reorderPlanExercisesController(req, res))
);

router.patch(
  "/workouts/plans/:planId/exercises/:planExerciseId",
  requireAuth,
  requireCompletedOnboarding,
  validateRequest({ params: planExerciseParamsSchema, body: updatePlanExerciseBodySchema }),
  asyncHandler(async (req, res) => updatePlanExerciseController(req, res))
);

router.delete(
  "/workouts/plans/:planId/exercises/:planExerciseId",
  requireAuth,
  requireCompletedOnboarding,
  validateRequest({ params: planExerciseParamsSchema }),
  asyncHandler(async (req, res) => deletePlanExerciseController(req, res))
);

router.get(
  "/workouts/exercises/search",
  requireAuth,
  requireCompletedOnboarding,
  validateRequest({ query: searchExercisesQuerySchema }),
  asyncHandler(async (req, res) => searchExercisesController(req, res))
);

router.get(
  "/workouts/recommendation-templates",
  requireAuth,
  requireCompletedOnboarding,
  validateRequest({ query: recommendationTemplateQuerySchema }),
  asyncHandler(async (req, res) => recommendationTemplatesController(req, res))
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

router.patch(
  "/workouts/history/:sessionId/duration",
  requireAuth,
  requireCompletedOnboarding,
  validateRequest({ params: historySessionParamsSchema, body: updateWorkoutDurationBodySchema }),
  asyncHandler(async (req, res) => updateWorkoutHistoryDurationController(req, res))
);

router.post(
  "/workouts/history/manual",
  requireAuth,
  requireCompletedOnboarding,
  validateRequest({ body: createManualHistoryBodySchema }),
  asyncHandler(async (req, res) => createManualHistoryController(req, res))
);

router.get(
  "/workouts/explore",
  requireAuth,
  requireCompletedOnboarding,
  validateRequest({ query: exploreWorkoutsQuerySchema }),
  asyncHandler(async (req, res) => exploreWorkoutsController(req, res))
);

export default router;
