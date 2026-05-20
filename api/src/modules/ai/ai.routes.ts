import { Router } from "express";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import { RedisStore } from "rate-limit-redis";
import { requireAuth } from "../../middlewares/auth.middleware";
import { asyncHandler } from "../../shared/utils/async-handler";
import { validateRequest } from "../../middlewares/validation.middleware";
import { requireCompletedOnboarding } from "../../middlewares/onboarding.middleware";
import { generateWorkoutBodySchema, parseSplitBodySchema, saveAIWorkoutBodySchema, swapExerciseBodySchema } from "./ai.schema";
import { generateWorkoutController, parseSplitController, saveAIWorkoutController, swapExerciseController } from "./ai.controller";
import { redisClient } from "../../config/redis";

// Rate limit das gerações de treino IA. Migrado de Map em memória para o
// padrão do resto da API (express-rate-limit + Redis): persiste entre
// reinícios, é consistente entre instâncias, e cai para um store em memória
// graciosamente quando o Redis não está disponível em dev.
const GENERATE_LIMIT = 50;
const GENERATE_WINDOW_MS = 60 * 60 * 1000;

function createAiRedisStore(): RedisStore | undefined {
  const client = redisClient;
  if (!client) return undefined;
  return new RedisStore({
    prefix: "rl:ai:generate:",
    sendCommand: (...args: string[]) =>
      client.call(args[0], ...args.slice(1)) as unknown as Promise<string | number>,
  });
}

const aiGenerateRateLimit = rateLimit({
  windowMs: GENERATE_WINDOW_MS,
  max: GENERATE_LIMIT,
  store: createAiRedisStore(),
  // Chave = userId quando autenticado (limite por conta) com fallback p/ IP
  // — requireAuth roda antes deste middleware, então userId quase sempre existe.
  keyGenerator: (req) =>
    req.context?.userId ?? ipKeyGenerator(req.ip ?? req.socket.remoteAddress ?? "unknown"),
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: {
      code: "AI_RATE_LIMIT_EXCEEDED",
      message: `Limite de ${GENERATE_LIMIT} gerações de treino por hora atingido. Tenta mais tarde.`,
    },
  },
});

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

// Interpreta divisão em linguagem natural ("Outro"). Compartilha o mesmo
// rate limit das gerações (chama a OpenAI também).
router.post(
  "/ai/parse-split",
  requireAuth,
  requireCompletedOnboarding,
  aiGenerateRateLimit,
  validateRequest({ body: parseSplitBodySchema }),
  asyncHandler((req, res) => parseSplitController(req, res))
);

// Troca de exercício individual — sem IA (query no banco), sem rate limit.
router.post(
  "/ai/swap-exercise",
  requireAuth,
  requireCompletedOnboarding,
  validateRequest({ body: swapExerciseBodySchema }),
  asyncHandler((req, res) => swapExerciseController(req, res))
);

export default router;
