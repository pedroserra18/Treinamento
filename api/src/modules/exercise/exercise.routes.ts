import { Router } from "express";
import { requireAuth } from "../../middlewares/auth.middleware";
import { requireAdminRole } from "../../middlewares/role.middleware";
import { asyncHandler } from "../../shared/utils/async-handler";
import { validateRequest } from "../../middlewares/validation.middleware";
import {
  createExerciseBodySchema,
  exerciseParamsSchema,
  listExercisesQuerySchema,
  updateExerciseBodySchema
} from "./exercise.schema";
import {
  createExerciseController,
  getExerciseByIdController,
  listExercisesController,
  updateExerciseController
} from "./exercise.controller";

const router = Router();

router.get(
  "/exercises",
  validateRequest({ query: listExercisesQuerySchema }),
  asyncHandler(async (req, res) => listExercisesController(req, res))
);

router.get(
  "/exercises/:exerciseId",
  validateRequest({ params: exerciseParamsSchema }),
  asyncHandler(async (req, res) => getExerciseByIdController(req, res))
);

// Users can create their own PRIVATE exercises. scope + ownerUserId are
// forced by the service so the client can't spoof either.
router.post(
  "/exercises",
  requireAuth,
  validateRequest({ body: createExerciseBodySchema }),
  asyncHandler(async (req, res) => createExerciseController(req, res))
);

router.patch(
  "/exercises/:exerciseId",
  requireAuth,
  requireAdminRole,
  validateRequest({ params: exerciseParamsSchema, body: updateExerciseBodySchema }),
  asyncHandler(async (req, res) => updateExerciseController(req, res))
);

export default router;
