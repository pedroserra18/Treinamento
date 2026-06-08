import { Request, Response } from "express";
import {
  createExercise,
  deletePrivateExercise,
  getExerciseById,
  getMyExerciseStats,
  listExercises,
  updateExercise
} from "./exercise.service";
import { CreateExerciseBody, ExerciseParams, ListExercisesQuery, UpdateExerciseBody } from "./exercise.schema";

export async function listExercisesController(req: Request, res: Response): Promise<void> {
  const exercises = await listExercises(req.query as unknown as ListExercisesQuery, {
    userId: req.context.userId,
    userRole: req.context.userRole
  });

  res.status(200).json({
    data: exercises,
    meta: {
      count: exercises.length,
      requestId: req.context.requestId
    }
  });
}

export async function getExerciseByIdController(req: Request, res: Response): Promise<void> {
  const params = req.params as unknown as ExerciseParams;

  const exercise = await getExerciseById(params.exerciseId, {
    userId: req.context.userId,
    userRole: req.context.userRole
  });

  res.status(200).json({
    data: exercise,
    meta: {
      requestId: req.context.requestId
    }
  });
}

export async function createExerciseController(req: Request, res: Response): Promise<void> {
  const body = req.body as CreateExerciseBody;

  const exercise = await createExercise(body, {
    userId: req.context.userId,
    userRole: req.context.userRole
  });

  res.status(201).json({
    data: exercise,
    meta: {
      requestId: req.context.requestId
    }
  });
}

export async function deleteExerciseController(req: Request, res: Response): Promise<void> {
  const params = req.params as unknown as ExerciseParams;

  await deletePrivateExercise(params.exerciseId, {
    userId: req.context.userId,
    userRole: req.context.userRole
  });

  res.status(204).end();
}

export async function getMyExerciseStatsController(req: Request, res: Response): Promise<void> {
  const stats = await getMyExerciseStats({
    userId: req.context.userId,
    userRole: req.context.userRole
  });

  res.status(200).json({
    data: stats,
    meta: {
      requestId: req.context.requestId
    }
  });
}

export async function updateExerciseController(req: Request, res: Response): Promise<void> {
  const params = req.params as unknown as ExerciseParams;
  const body = req.body as UpdateExerciseBody;

  const exercise = await updateExercise(params.exerciseId, body);

  res.status(200).json({
    data: exercise,
    meta: {
      requestId: req.context.requestId
    }
  });
}
