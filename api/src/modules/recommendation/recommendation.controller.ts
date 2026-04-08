import { Request, Response } from "express";
import { getWorkoutRecommendationsForUser } from "./recommendation.service";

export async function workoutRecommendationsController(req: Request, res: Response): Promise<void> {
  const userId = req.context.userId as string;
  const result = await getWorkoutRecommendationsForUser(userId);

  res.status(200).json({
    data: result,
    meta: {
      requestId: req.context.requestId
    }
  });
}
