import { Router, Request, Response, NextFunction } from "express";
import { requireAuth } from "../../middlewares/auth.middleware";
import { asyncHandler } from "../../shared/utils/async-handler";
import { validateRequest } from "../../middlewares/validation.middleware";
import { requireCompletedOnboarding } from "../../middlewares/onboarding.middleware";
import { generateWorkoutBodySchema, saveAIWorkoutBodySchema } from "./ai.schema";
import { generateWorkoutController, saveAIWorkoutController } from "./ai.controller";
import { AppError } from "../../shared/errors/app-error";

// Simple in-memory rate limiter: max 10 generate calls per user per hour
const generateCounts = new Map<string, { count: number; resetAt: number }>();
const GENERATE_LIMIT = 50;
const GENERATE_WINDOW_MS = 60 * 60 * 1000;

function aiGenerateRateLimit(req: Request, _res: Response, next: NextFunction): void {
  const userId = req.context?.userId;
  if (!userId) {
    next();
    return;
  }

  const now = Date.now();
  const entry = generateCounts.get(userId);

  if (!entry || now > entry.resetAt) {
    generateCounts.set(userId, { count: 1, resetAt: now + GENERATE_WINDOW_MS });
    next();
    return;
  }

  if (entry.count >= GENERATE_LIMIT) {
    throw new AppError(
      `Limite de ${GENERATE_LIMIT} gerações de treino por hora atingido. Tenta mais tarde.`,
      { statusCode: 429, code: "AI_RATE_LIMIT_EXCEEDED" }
    );
  }

  entry.count++;
  next();
}

const router = Router();

router.post(
  "/ai/generate-workout",
  requireAuth,
  requireCompletedOnboarding,
  aiGenerateRateLimit,
  validateRequest({ body: generateWorkoutBodySchema }),
  asyncHandler((req, res) => generateWorkoutController(req, res))
);

router.post(
  "/ai/save-workout",
  requireAuth,
  requireCompletedOnboarding,
  validateRequest({ body: saveAIWorkoutBodySchema }),
  asyncHandler((req, res) => saveAIWorkoutController(req, res))
);

export default router;
