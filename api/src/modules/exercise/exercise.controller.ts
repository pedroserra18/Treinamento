import { Request, Response } from "express";

import { ListExercisesQuery } from "./exercise.schema";
import { listExercises } from "./exercise.service";

export async function listExercisesController(req: Request, res: Response): Promise<void> {
  const exercises = await listExercises(req.query as ListExercisesQuery, {
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
