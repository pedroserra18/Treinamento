import { prisma } from "../config/prisma";
import { AppError } from "./errors/app-error";

// Catálogo das features com limite por plano. Toda parte do backend que
// gate funcionalidade tier-restricted importa daqui pra ter uma fonte
// única de verdade. Atualizar uma constante aqui = atualizar em todos os
// lugares simultaneamente.
//
// ADMINs herdam PRO em runtime via `getEffectivePlan` — não precisa
// duplicar nada na tabela.
//
// Usar Number.POSITIVE_INFINITY em vez de undefined/null pra checks de
// limit ficarem sempre numéricos e o JSON serializável (POSITIVE_INFINITY
// vira null em JSON, que o frontend interpreta como "ilimitado").
export type PlanFeature =
  | "workoutPlans"
  | "aiGenerations"
  | "aiHistoryEntries"
  | "customExercises"
  | "competitionsOwned"
  | "pinnedExercises";

export const PLAN_LIMITS: Record<"FREE" | "PRO", Record<PlanFeature, number>> = {
  FREE: {
    workoutPlans: 4,
    aiGenerations: 3, // LIFETIME (não por semana) — gate via User.aiGenerationsTotal
    aiHistoryEntries: 5, // últimas N gerações preservadas (prune ao gerar)
    customExercises: 5,
    competitionsOwned: 2,
    pinnedExercises: 5
  },
  PRO: {
    workoutPlans: Number.POSITIVE_INFINITY,
    aiGenerations: Number.POSITIVE_INFINITY,
    aiHistoryEntries: 50,
    customExercises: Number.POSITIVE_INFINITY,
    competitionsOwned: Number.POSITIVE_INFINITY,
    pinnedExercises: 20
  }
};

// Plan efetivo = ADMIN herda PRO. Resto bate na coluna User.plan.
// planExpiresAt no futuro: se passou da data, force pra FREE (cron já
// vai cuidar disso e atualizar a coluna). Por ora o helper considera só
// User.plan, mantendo escape simples se algum cron falhar.
export function resolveEffectivePlan(user: {
  plan: "FREE" | "PRO";
  role: "USER" | "COACH" | "ADMIN";
}): "FREE" | "PRO" {
  if (user.role === "ADMIN") return "PRO";
  return user.plan;
}

// Lança PLAN_LIMIT_REACHED (402) quando o user não cabe mais. `currentCount`
// é o N atual da feature (ex.: nº de WorkoutPlans existentes). Frontend
// usa o details no payload pra abrir o dialog certo com texto contextual.
//
// IMPORTANTE: a função carrega o user SEM cache — checks de plano são
// críticos e o overhead (~1ms) compensa não vazar acesso pra quem expirou
// entre requests. Quem chamar em loop precisa carregar o user uma vez
// fora e usar assertWithinLimitForUser direto.
export async function assertWithinLimit(
  userId: string,
  feature: PlanFeature,
  currentCount: number
): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { plan: true, role: true }
  });
  if (!user) {
    throw new AppError("Usuário não encontrado", { statusCode: 404, code: "USER_NOT_FOUND" });
  }
  assertWithinLimitForUser(user, feature, currentCount);
}

export function assertWithinLimitForUser(
  user: { plan: "FREE" | "PRO"; role: "USER" | "COACH" | "ADMIN" },
  feature: PlanFeature,
  currentCount: number
): void {
  const plan = resolveEffectivePlan(user);
  const limit = PLAN_LIMITS[plan][feature];
  if (currentCount >= limit) {
    throw new AppError(`Limite do plano ${plan} atingido pra ${feature}`, {
      statusCode: 402,
      code: "PLAN_LIMIT_REACHED",
      details: {
        feature,
        current: currentCount,
        // POSITIVE_INFINITY vira null no JSON; cliente entende como ilimitado
        // mas como aqui sempre é finito (estamos no caminho de erro), serializa OK.
        limit: Number.isFinite(limit) ? limit : null,
        plan
      }
    });
  }
}

// Helper de leitura do plano + limites pra retornar ao client (ex.: tela
// de Settings → Plano). Estrutura serializável.
export type PlanSummary = {
  plan: "FREE" | "PRO";
  role: "USER" | "COACH" | "ADMIN";
  planExpiresAt: string | null;
  limits: Record<PlanFeature, number | null>;
  usage: Record<PlanFeature, number>;
};

export async function getPlanSummary(userId: string): Promise<PlanSummary> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      plan: true,
      role: true,
      planExpiresAt: true,
      aiGenerationsTotal: true
    }
  });
  if (!user) {
    throw new AppError("Usuário não encontrado", { statusCode: 404, code: "USER_NOT_FOUND" });
  }
  const plan = resolveEffectivePlan(user);
  const limits = PLAN_LIMITS[plan];

  // Computa uso atual em paralelo — todas queries indexadas, baratas.
  const [
    workoutPlansCount,
    aiHistoryCount,
    customExercisesCount,
    competitionsOwnedCount,
    pinnedExercisesCount
  ] = await Promise.all([
    prisma.workoutPlan.count({
      // Alinha com o gate de criação (createWorkoutPlan) e com "Minhas Rotinas"
      // (listUserWorkoutPlans): templates ocultos criados pelo "Criar e enviar
      // rotina" (isTemplate=true) não são rotinas do usuário e não devem entrar
      // na contagem de uso do plano.
      where: { userId, archivedAt: null, status: { in: ["ACTIVE", "DRAFT"] }, isTemplate: false }
    }),
    // Conta DISTINCT generationIds pra refletir "gerações" e não "dias".
    prisma.aIGeneratedPlan
      .groupBy({ by: ["generationId"], where: { userId } })
      .then((rows) => rows.length),
    prisma.exercise.count({
      where: { scope: "PRIVATE", ownerUserId: userId, isActive: true }
    }),
    prisma.competition.count({
      where: { ownerUserId: userId, status: { in: ["LOBBY", "ACTIVE"] } }
    }),
    prisma.pinnedExercise.count({ where: { userId } })
  ]);

  return {
    plan,
    role: user.role,
    planExpiresAt: user.planExpiresAt ? user.planExpiresAt.toISOString() : null,
    limits: {
      workoutPlans: serializeLimit(limits.workoutPlans),
      aiGenerations: serializeLimit(limits.aiGenerations),
      aiHistoryEntries: serializeLimit(limits.aiHistoryEntries),
      customExercises: serializeLimit(limits.customExercises),
      competitionsOwned: serializeLimit(limits.competitionsOwned),
      pinnedExercises: serializeLimit(limits.pinnedExercises)
    },
    usage: {
      workoutPlans: workoutPlansCount,
      aiGenerations: user.aiGenerationsTotal,
      aiHistoryEntries: aiHistoryCount,
      customExercises: customExercisesCount,
      competitionsOwned: competitionsOwnedCount,
      pinnedExercises: pinnedExercisesCount
    }
  };
}

function serializeLimit(value: number): number | null {
  return Number.isFinite(value) ? value : null;
}
