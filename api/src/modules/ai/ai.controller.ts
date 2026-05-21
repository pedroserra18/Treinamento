import { Request, Response } from "express";
import { GenerateWorkoutBody, ParseSplitBody, SaveAIWorkoutBody, SwapExerciseBody } from "./ai.schema";
import { generateWorkout, parseCustomSplitWithAI, saveAIWorkout, swapExercise } from "./ai.service";
import { trackEvent } from "../../shared/services/event-log.service";
import { eventContextFromRequest } from "../../shared/utils/event-context";

export async function generateWorkoutController(req: Request, res: Response): Promise<void> {
  const body = req.body as GenerateWorkoutBody;
  const userId = req.context?.userId;
  const text = await generateWorkout(body, userId);

  // Registra 1 evento de uso por PLANO gerado (só o primeiro dia da geração;
  // regeneração de dia individual envia isFirstDay=false e não conta).
  if (userId && body.isFirstDay) {
    await trackEvent({
      userId,
      category: "WORKOUT",
      action: "ai_plan_generated",
      ...eventContextFromRequest(req),
      metadata: { split: body.split, weekDays: body.weekDays },
    });
  }

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
