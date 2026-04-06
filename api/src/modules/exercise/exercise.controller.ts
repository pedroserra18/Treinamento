import { Request, Response } from "express";

import { ExerciseParams, ListExercisesQuery } from "./exercise.schema";
import { getExerciseById, listExercises } from "./exercise.service";

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
