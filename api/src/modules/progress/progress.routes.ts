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
  pinnedExerciseBodySchema
} from "./progress.schema";
import {
  addPinnedExerciseController,
  createBodyMeasurementController,
  listBodyMeasurementsController,
  listExerciseProgressController,
  listPinnedExercisesController,
  removeBodyMeasurementController,
  removePinnedExerciseController
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
