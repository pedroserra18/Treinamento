import { Request, Response } from "express";
import { GenerateWorkoutBody, ParseSplitBody, SaveAIWorkoutBody, SwapExerciseBody } from "./ai.schema";
import { generateWorkout, parseCustomSplitWithAI, saveAIWorkout, swapExercise } from "./ai.service";

export async function generateWorkoutController(req: Request, res: Response): Promise<void> {
  const body = req.body as GenerateWorkoutBody;
  const userId = req.context?.userId;
  const text = await generateWorkout(body, userId);
  res.json({ text });
}

export async function parseSplitController(req: Request, res: Response): Promise<void> {
  const body = req.body as ParseSplitBody;
  const days = await parseCustomSplitWithAI(body.description, body.daysPerWeek ?? 4);
  res.json({ days });
}

export async function swapExerciseController(req: Request, res: Response): Promise<void> {
  const body = req.body as SwapExerciseBody;
  const userId = req.context?.userId;
  const exercise = await swapExercise(userId, body);
  res.json({ exercise });
}

export async function saveAIWorkoutController(req: Request, res: Response): Promise<void> {
  const userId = req.context.userId ?? "";
  const body = req.body as SaveAIWorkoutBody;
  const result = await saveAIWorkout(userId, body);
  res.status(201).json(result);
}
