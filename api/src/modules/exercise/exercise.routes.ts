import { Router } from "express";
import { requireAuth } from "../../middlewares/auth.middleware";
import { requireAdminRole } from "../../middlewares/role.middleware";
import { asyncHandler } from "../../shared/utils/async-handler";
import { validateRequest } from "../../middlewares/validation.middleware";
import { exerciseParamsSchema, listExercisesQuerySchema, updateExerciseBodySchema } from "./exercise.schema";
import {
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

router.patch(
  "/exercises/:exerciseId",
  requireAuth,
  requireAdminRole,
  validateRequest({ params: exerciseParamsSchema, body: updateExerciseBodySchema }),
  asyncHandler(async (req, res) => updateExerciseController(req, res))
);

export default router;
