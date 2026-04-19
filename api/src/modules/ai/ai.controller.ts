import { Request, Response } from "express";
import { GenerateWorkoutBody, SaveAIWorkoutBody } from "./ai.schema";
import { generateWorkout, saveAIWorkout } from "./ai.service";

export async function generateWorkoutController(req: Request, res: Response): Promise<void> {
  const body = req.body as GenerateWorkoutBody;
  const userId = req.context?.userId;
  const text = await generateWorkout(body, userId);
  res.json({ text });
}

export async function saveAIWorkoutController(req: Request, res: Response): Promise<void> {
  const userId = req.context.userId ?? "";
  const body = req.body as SaveAIWorkoutBody;
  const result = await saveAIWorkout(userId, body);
  res.status(201).json(result);
}
