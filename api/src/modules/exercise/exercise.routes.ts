import { Router } from "express";

import { listExercisesController } from "./exercise.controller";
import { listExercisesQuerySchema } from "./exercise.schema";
import { validateRequest } from "../../middlewares/validation.middleware";
import { asyncHandler } from "../../shared/utils/async-handler";

const router = Router();

router.get(
  "/exercises",
  validateRequest({ query: listExercisesQuerySchema }),
  asyncHandler(async (req, res) => listExercisesController(req, res))
);

export default router;
