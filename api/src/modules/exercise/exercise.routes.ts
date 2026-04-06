import { Router } from "express";

import { getExerciseByIdController, listExercisesController } from "./exercise.controller";
import { exerciseParamsSchema, listExercisesQuerySchema } from "./exercise.schema";
import { validateRequest } from "../../middlewares/validation.middleware";
import { asyncHandler } from "../../shared/utils/async-handler";

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

export default router;
