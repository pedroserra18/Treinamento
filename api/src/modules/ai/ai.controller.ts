import { Request, Response } from "express";
import {
  AIHistoryParams,
  GenerateWorkoutBody,
  ParseSplitBody,
  SaveAIHistoryBody,
  SaveAIWorkoutBody,
  SwapExerciseBody
} from "./ai.schema";
import {
  generateWorkout,
  listAIHistory,
  parseCustomSplitWithAI,
  saveAIGenerationHistory,
  saveAIWorkout,
  swapExercise,
  useAIHistoryPlan
} from "./ai.service";
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

// POST /ai/history — chamado pelo frontend logo após gerar (auto), antes
// da tela de RESULT. Persiste o snapshot mesmo se user nunca clicar Salvar.
export async function saveAIHistoryController(req: Request, res: Response): Promise<void> {
  const userId = req.context.userId as string;
  const body = req.body as SaveAIHistoryBody;
  const result = await saveAIGenerationHistory(userId, body);
  res.status(201).json({
    data: result,
    meta: { requestId: req.context.requestId }
  });
}

// GET /ai/history?limit=3 — últimas N gerações agrupadas.
export async function listAIHistoryController(req: Request, res: Response): Promise<void> {
  const userId = req.context.userId as string;
  const rawLimit = typeof req.query.limit === "string" ? parseInt(req.query.limit, 10) : 3;
  const limit = Number.isFinite(rawLimit) ? Math.max(1, Math.min(10, rawLimit)) : 3;
  const generations = await listAIHistory(userId, limit);
  res.status(200).json({
    data: generations,
    meta: { requestId: req.context.requestId }
  });
}

// POST /ai/history/:historyPlanId/use — clona o snapshot pra um WorkoutPlan
// novo (mantém o histórico). Frontend pega o planId retornado e navega
// pro /train.
export async function useAIHistoryPlanController(req: Request, res: Response): Promise<void> {
  const userId = req.context.userId as string;
  const params = req.params as unknown as AIHistoryParams;
  const result = await useAIHistoryPlan(userId, params.historyPlanId);
  res.status(201).json({
    data: result,
    meta: { requestId: req.context.requestId }
  });
}
