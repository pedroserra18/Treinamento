import { Router } from "express";
import { requireAuth } from "../../middlewares/auth.middleware";
import { asyncHandler } from "../../shared/utils/async-handler";
import { validateRequest } from "../../middlewares/validation.middleware";
import { requireCompletedOnboarding } from "../../middlewares/onboarding.middleware";
import {
  addPlanCardioBodySchema,
  addPlanExerciseBodySchema,
  addPlanExercisesBatchBodySchema,
  completeWorkoutBodySchema,
  completeWorkoutParamsSchema,
  createManualHistoryBodySchema,
  createWorkoutPlanBodySchema,
  deletePlanExercisesBatchBodySchema,
  exploreWorkoutsQuerySchema,
  historySessionParamsSchema,
  latestExerciseHistoryBodySchema,
  listWorkoutHistoryQuerySchema,
  personalRecordsBodySchema,
  planCardioParamsSchema,
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
  addPlanCardioController,
  addPlanExerciseController,
  addPlanExercisesBatchController,
  deletePlanExercisesBatchController,
  completeWorkoutController,
  createManualHistoryController,
  createWorkoutPlanController,
  deletePlanCardioController,
  deletePlanExerciseController,
  deleteWorkoutPlanController,
  exploreWorkoutsController,
  getWorkoutRecommendationsController,
  getWorkoutSessionController,
  getSessionHighlightsController,
  listWorkoutHistoryController,
  latestExerciseHistoryController,
  listRecentAIGenerationsController,
  listWorkoutPlansController,
  personalRecordsController,
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

// Últimas N gerações de IA agrupadas (1 row = 1 generation, com N planos
// dentro). Vem antes da rota dinâmica /:planId pra não casar com o param.
router.get(
  "/workouts/plans/ai/recent",
  requireAuth,
  requireCompletedOnboarding,
  asyncHandler(async (req, res) => listRecentAIGenerationsController(req, res))
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

router.post(
  "/workouts/plans/:planId/exercises/batch",
  requireAuth,
  requireCompletedOnboarding,
  validateRequest({ params: workoutPlanParamsSchema, body: addPlanExercisesBatchBodySchema }),
  asyncHandler(async (req, res) => addPlanExercisesBatchController(req, res))
);

router.post(
  "/workouts/plans/:planId/exercises/batch-delete",
  requireAuth,
  requireCompletedOnboarding,
  validateRequest({ params: workoutPlanParamsSchema, body: deletePlanExercisesBatchBodySchema }),
  asyncHandler(async (req, res) => deletePlanExercisesBatchController(req, res))
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

router.post(
  "/workouts/plans/:planId/cardio",
  requireAuth,
  requireCompletedOnboarding,
  validateRequest({ params: workoutPlanParamsSchema, body: addPlanCardioBodySchema }),
  asyncHandler(async (req, res) => addPlanCardioController(req, res))
);

router.delete(
  "/workouts/plans/:planId/cardio/:planCardioId",
  requireAuth,
  requireCompletedOnboarding,
  validateRequest({ params: planCardioParamsSchema }),
  asyncHandler(async (req, res) => deletePlanCardioController(req, res))
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

router.get(
  "/workouts/history/:sessionId",
  requireAuth,
  requireCompletedOnboarding,
  validateRequest({ params: historySessionParamsSchema }),
  asyncHandler(async (req, res) => getWorkoutSessionController(req, res))
);

router.get(
  "/workouts/history/:sessionId/highlights",
  requireAuth,
  requireCompletedOnboarding,
  validateRequest({ params: historySessionParamsSchema }),
  asyncHandler(async (req, res) => getSessionHighlightsController(req, res))
);

router.post(
  "/workouts/history/latest-exercises",
  requireAuth,
  requireCompletedOnboarding,
  validateRequest({ body: latestExerciseHistoryBodySchema }),
  asyncHandler(async (req, res) => latestExerciseHistoryController(req, res))
);

router.post(
  "/workouts/exercises/personal-records",
  requireAuth,
  requireCompletedOnboarding,
  validateRequest({ body: personalRecordsBodySchema }),
  asyncHandler(async (req, res) => personalRecordsController(req, res))
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
