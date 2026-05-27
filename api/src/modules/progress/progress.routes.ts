import { Router } from "express";
import { requireAuth } from "../../middlewares/auth.middleware";
import { asyncHandler } from "../../shared/utils/async-handler";
import { validateRequest } from "../../middlewares/validation.middleware";
import { requireCompletedOnboarding } from "../../middlewares/onboarding.middleware";
import {
  bodyMeasurementParamsSchema,
  createBodyMeasurementBodySchema,
  exerciseParamsSchema,
  listBodyMeasurementsQuerySchema,
  pinnedExerciseBodySchema,
  progressSummaryQuerySchema,
  reorderPinnedExercisesBodySchema
} from "./progress.schema";
import {
  addPinnedExerciseController,
  createBodyMeasurementController,
  getProgressSummaryController,
  listBodyMeasurementsController,
  listExerciseProgressController,
  listPinnedExercisesController,
  removeBodyMeasurementController,
  removePinnedExerciseController,
  reorderPinnedExercisesController
} from "./progress.controller";

const router = Router();

router.get(
  "/progress/pinned-exercises",
  requireAuth,
  requireCompletedOnboarding,
  asyncHandler(async (req, res) => listPinnedExercisesController(req, res))
);

router.post(
  "/progress/pinned-exercises",
  requireAuth,
  requireCompletedOnboarding,
  validateRequest({ body: pinnedExerciseBodySchema }),
  asyncHandler(async (req, res) => addPinnedExerciseController(req, res))
);

router.patch(
  "/progress/pinned-exercises/reorder",
  requireAuth,
  requireCompletedOnboarding,
  validateRequest({ body: reorderPinnedExercisesBodySchema }),
  asyncHandler(async (req, res) => reorderPinnedExercisesController(req, res))
);

router.delete(
  "/progress/pinned-exercises/:exerciseId",
  requireAuth,
  requireCompletedOnboarding,
  validateRequest({ params: exerciseParamsSchema }),
  asyncHandler(async (req, res) => removePinnedExerciseController(req, res))
);

router.get(
  "/progress/exercises",
  requireAuth,
  requireCompletedOnboarding,
  asyncHandler(async (req, res) => listExerciseProgressController(req, res))
);

router.get(
  "/progress/summary",
  requireAuth,
  requireCompletedOnboarding,
  validateRequest({ query: progressSummaryQuerySchema }),
  asyncHandler(async (req, res) => getProgressSummaryController(req, res))
);

router.get(
  "/progress/body-measurements",
  requireAuth,
  requireCompletedOnboarding,
  validateRequest({ query: listBodyMeasurementsQuerySchema }),
  asyncHandler(async (req, res) => listBodyMeasurementsController(req, res))
);

router.post(
  "/progress/body-measurements",
  requireAuth,
  requireCompletedOnboarding,
  validateRequest({ body: createBodyMeasurementBodySchema }),
  asyncHandler(async (req, res) => createBodyMeasurementController(req, res))
);

router.delete(
  "/progress/body-measurements/:measurementId",
  requireAuth,
  requireCompletedOnboarding,
  validateRequest({ params: bodyMeasurementParamsSchema }),
  asyncHandler(async (req, res) => removeBodyMeasurementController(req, res))
);

export default router;
