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
  deleteExerciseController,
  getExerciseByIdController,
  getMyExerciseStatsController,
  listExercisesController,
  updateExerciseController
} from "./exercise.controller";

const router = Router();

router.get(
  "/exercises",
  validateRequest({ query: listExercisesQuerySchema }),
  asyncHandler(async (req, res) => listExercisesController(req, res))
);

// Estatísticas dos exercícios PRIVATE do próprio usuário — usado pelo
// CreateExerciseModal pra renderizar o contador "X/5 criados". Vem antes
// de /:exerciseId pra não casar com a rota dinâmica.
router.get(
  "/exercises/me/stats",
  requireAuth,
  asyncHandler(async (req, res) => getMyExerciseStatsController(req, res))
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

// Soft-delete de exercício PRIVATE — o service valida owner + scope, então
// chamadas em exercícios GLOBAL ou de outro usuário retornam 403/404.
router.delete(
  "/exercises/:exerciseId",
  requireAuth,
  validateRequest({ params: exerciseParamsSchema }),
  asyncHandler(async (req, res) => deleteExerciseController(req, res))
);

export default router;
