import { Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { AppError } from "../../shared/errors/app-error";
import { PLAN_LIMITS, resolveEffectivePlan } from "../../shared/plan-limits";
import { SaveAIHistoryBody, SaveAIWorkoutBody } from "./ai.schema";

type SavedExercise = {
  name: string;
  found: boolean;
  exerciseId?: string;
};

export async function saveAIWorkout(
  userId: string,
  payload: SaveAIWorkoutBody
): Promise<{ planId: string; planName: string; savedExercises: SavedExercise[] }> {
  const plan = await prisma.workoutPlan.create({
    data: {
      userId,
      name: payload.planName,
      description: "Gerado por IA",
      status: "ACTIVE",
      // Tag de agrupamento — quando o cliente envia o mesmo aiGenerationId
      // em múltiplos saves, os planos passam a ser listáveis como UMA
      // geração no endpoint /workouts/plans/ai/recent.
      aiGenerationId: payload.aiGenerationId ?? null,
      aiGenerationLabel: payload.aiGenerationLabel ?? null,
    },
  });

  const savedExercises: SavedExercise[] = [];
  let orderIndex = 1;

  for (const exerciseInput of payload.exercises) {
    const found = await prisma.exercise.findFirst({
      where: {
        isActive: true,
        OR: [{ scope: "GLOBAL" }, { scope: "PRIVATE", ownerUserId: userId }],
        name: { equals: exerciseInput.name, mode: "insensitive" },
      },
      select: { id: true, name: true },
    });

    if (!found) {
      const fallback = await prisma.exercise.findFirst({
        where: {
          isActive: true,
          OR: [{ scope: "GLOBAL" }, { scope: "PRIVATE", ownerUserId: userId }],
          name: { contains: exerciseInput.name, mode: "insensitive" },
        },
        select: { id: true, name: true },
      });

      savedExercises.push({ name: exerciseInput.name, found: !!fallback, exerciseId: fallback?.id });

      if (fallback) {
        await prisma.workoutPlanExercise.create({
          data: {
            workoutPlanId: plan.id,
            exerciseId: fallback.id,
            orderIndex: orderIndex++,
            sets: exerciseInput.sets ?? 3,
            repsMin: exerciseInput.repsMin ?? null,
            repsMax: exerciseInput.repsMax ?? null,
            restSec: exerciseInput.restSec ?? null,
            notes: exerciseInput.notes ?? null,
          },
        });
      }
    } else {
      const alreadyAdded = savedExercises.some((s) => s.exerciseId === found.id);
      savedExercises.push({ name: exerciseInput.name, found: true, exerciseId: found.id });

      if (!alreadyAdded) {
        await prisma.workoutPlanExercise.create({
          data: {
            workoutPlanId: plan.id,
            exerciseId: found.id,
            orderIndex: orderIndex++,
            sets: exerciseInput.sets ?? 3,
            repsMin: exerciseInput.repsMin ?? null,
            repsMax: exerciseInput.repsMax ?? null,
            restSec: exerciseInput.restSec ?? null,
            notes: exerciseInput.notes ?? null,
          },
        });
      }
    }
  }

  return { planId: plan.id, planName: plan.name, savedExercises };
}

// ─── AI History (independente de WorkoutPlan) ───────────────────────────
//
// Persiste o snapshot completo do plano gerado pela IA SEMPRE, sem precisar
// que o user clique "Salvar". Permite browsing posterior em "Ver treinos
// gerados" mesmo se /workouts estiver vazio. Quando o user quiser usar
// um treino antigo, useAIHistoryPlan clona o snapshot pra um WorkoutPlan
// novo (mantendo o histórico intacto).

export async function saveAIGenerationHistory(
  userId: string,
  body: SaveAIHistoryBody
): Promise<{ saved: number }> {
  // Atômico: insert das rows do history + increment do counter lifetime
  // do user (pra o gate de 3 gerações FREE). Sem essa transação, um crash
  // entre os dois deixaria histórico salvo mas counter desincronizado.
  const user = await prisma.$transaction(async (tx) => {
    await tx.aIGeneratedPlan.createMany({
      data: body.days.map((d) => ({
        userId,
        generationId: body.generationId,
        generationLabel: body.generationLabel,
        dayLabel: d.dayLabel,
        dayIndex: d.dayIndex,
        planName: d.planName,
        planSnapshot: {
          planName: d.planName,
          exercises: d.exercises
        } as unknown as Prisma.InputJsonValue
      }))
    });

    return tx.user.update({
      where: { id: userId },
      data: { aiGenerationsTotal: { increment: 1 } },
      select: { plan: true, role: true }
    });
  });

  // Prune: mantém só as últimas N gerações de acordo com o tier do user.
  // FREE: 5 | PRO: 50 (vide PLAN_LIMITS.aiHistoryEntries).
  const effectivePlan = resolveEffectivePlan(user);
  const limit = PLAN_LIMITS[effectivePlan].aiHistoryEntries;
  if (Number.isFinite(limit)) {
    await pruneOldAIHistory(userId, limit as number);
  }

  return { saved: body.days.length };
}

async function pruneOldAIHistory(userId: string, maxGenerations: number): Promise<void> {
  // Lista todas as gerações do user com min(generatedAt) (representa
  // quando a geração foi criada). groupBy retorna gerações distintas.
  const generations = await prisma.aIGeneratedPlan.groupBy({
    by: ["generationId"],
    where: { userId },
    _min: { generatedAt: true }
  });
  if (generations.length <= maxGenerations) return;

  // Ordena por mais antigo primeiro e apaga as gerações em excesso.
  generations.sort((a, b) => {
    const aMs = a._min.generatedAt?.getTime() ?? 0;
    const bMs = b._min.generatedAt?.getTime() ?? 0;
    return aMs - bMs;
  });
  const toDelete = generations
    .slice(0, generations.length - maxGenerations)
    .map((g) => g.generationId);
  if (toDelete.length === 0) return;

  await prisma.aIGeneratedPlan.deleteMany({
    where: { userId, generationId: { in: toDelete } }
  });
}

// Preview do exercício no histórico — extraído do planSnapshot e devolvido
// no listAIHistory pra UI poder mostrar o conteúdo do treino antes de
// clonar pra /workouts. Campos opcionais porque a IA pode omitir sets/reps
// quando o user escolheu "IA decide".
export type AIHistoryExercisePreview = {
  name: string;
  sets?: number;
  repsMin?: number;
  repsMax?: number;
  restSec?: number;
  notes?: string;
  muscleGroup?: string;
};

export type AIHistoryGeneration = {
  generationId: string;
  generationLabel: string;
  generatedAt: string;
  plans: Array<{
    id: string;
    dayLabel: string;
    dayIndex: number;
    planName: string;
    exerciseCount: number;
    // Exercícios extraídos do planSnapshot pra preview no front. Sem
    // round-trip extra — o snapshot já tá em memória aqui. Volume real:
    // ~20 exercícios × 140 rows = ~2800 itens no pior caso, ainda
    // dentro de ~50KB JSON.
    exercises: AIHistoryExercisePreview[];
  }>;
};

export async function listAIHistory(
  userId: string,
  limit: number
): Promise<AIHistoryGeneration[]> {
  // Pega todas as rows do user, ordenadas por mais recente. Agrupa em
  // memória pelo generationId. Volume é pequeno (cap 20 gerações × até
  // 7 dias = 140 rows no máximo), agrupar em SQL não vale a complexidade.
  const rows = await prisma.aIGeneratedPlan.findMany({
    where: { userId },
    orderBy: { generatedAt: "desc" },
    select: {
      id: true,
      generationId: true,
      generationLabel: true,
      generatedAt: true,
      dayLabel: true,
      dayIndex: true,
      planName: true,
      planSnapshot: true
    }
  });

  type Bucket = {
    generationId: string;
    generationLabel: string;
    generatedAt: Date;
    plans: AIHistoryGeneration["plans"];
  };
  const byGen = new Map<string, Bucket>();
  for (const r of rows) {
    let bucket = byGen.get(r.generationId);
    if (!bucket) {
      bucket = {
        generationId: r.generationId,
        generationLabel: r.generationLabel,
        generatedAt: r.generatedAt,
        plans: []
      };
      byGen.set(r.generationId, bucket);
    }
    // generatedAt do bucket = mais antigo entre os dias (quando a geração
    // efetivamente começou).
    if (r.generatedAt < bucket.generatedAt) bucket.generatedAt = r.generatedAt;
    // Extrai exercícios do snapshot pra preview no front (sem round-trip
    // extra). Tipa defensivamente — JSONB do Postgres pode vir em formato
    // inesperado se uma versão antiga gravou diferente.
    const snapshot = r.planSnapshot as { exercises?: Array<Record<string, unknown>> } | null;
    const exercises: AIHistoryExercisePreview[] = Array.isArray(snapshot?.exercises)
      ? snapshot.exercises.map((ex) => ({
          name: typeof ex.name === "string" ? ex.name : "",
          sets: typeof ex.sets === "number" ? ex.sets : undefined,
          repsMin: typeof ex.repsMin === "number" ? ex.repsMin : undefined,
          repsMax: typeof ex.repsMax === "number" ? ex.repsMax : undefined,
          restSec: typeof ex.restSec === "number" ? ex.restSec : undefined,
          notes: typeof ex.notes === "string" ? ex.notes : undefined,
          muscleGroup: typeof ex.muscleGroup === "string" ? ex.muscleGroup : undefined
        }))
      : [];
    bucket.plans.push({
      id: r.id,
      dayLabel: r.dayLabel,
      dayIndex: r.dayIndex,
      planName: r.planName,
      exerciseCount: exercises.length,
      exercises
    });
  }

  // Ordena planos dentro de cada bucket por dayIndex pra exibir em
  // ordem natural (Dia 1, Dia 2, Dia 3).
  for (const bucket of byGen.values()) {
    bucket.plans.sort((a, b) => a.dayIndex - b.dayIndex);
  }

  // Ordena gerações pelas mais recentes primeiro.
  const generations = Array.from(byGen.values());
  generations.sort((a, b) => b.generatedAt.getTime() - a.generatedAt.getTime());

  return generations.slice(0, limit).map((b) => ({
    generationId: b.generationId,
    generationLabel: b.generationLabel,
    generatedAt: b.generatedAt.toISOString(),
    plans: b.plans
  }));
}

// "Usar este treino" — clona o snapshot da AIGeneratedPlan pra um
// WorkoutPlan novo (mantém histórico intacto). Tenta resolver os
// nomes dos exercícios no catálogo pra criar WorkoutPlanExercise com
// FK válido; nomes que não casam no catálogo são pulados (registrados
// no campo `notFoundExercises` do retorno).
export async function useAIHistoryPlan(
  userId: string,
  historyPlanId: string
): Promise<{ planId: string; planName: string; notFoundExercises: string[] }> {
  const row = await prisma.aIGeneratedPlan.findUnique({
    where: { id: historyPlanId },
    select: {
      userId: true,
      planName: true,
      planSnapshot: true
    }
  });

  if (!row || row.userId !== userId) {
    throw new AppError("Plano não encontrado", {
      statusCode: 404,
      code: "AI_HISTORY_PLAN_NOT_FOUND"
    });
  }

  const snapshot = row.planSnapshot as {
    planName?: string;
    exercises?: Array<{
      name: string;
      sets?: number;
      repsMin?: number;
      repsMax?: number;
      restSec?: number;
      notes?: string;
    }>;
  } | null;
  const exercises = Array.isArray(snapshot?.exercises) ? snapshot.exercises : [];

  const plan = await prisma.workoutPlan.create({
    data: {
      userId,
      name: row.planName,
      description: "Gerado por IA",
      status: "ACTIVE"
    }
  });

  const notFound: string[] = [];
  let orderIndex = 1;

  for (const ex of exercises) {
    // Mesma estratégia do saveAIWorkout: busca exata, depois contém.
    const found =
      (await prisma.exercise.findFirst({
        where: {
          isActive: true,
          OR: [{ scope: "GLOBAL" }, { scope: "PRIVATE", ownerUserId: userId }],
          name: { equals: ex.name, mode: "insensitive" }
        },
        select: { id: true }
      })) ??
      (await prisma.exercise.findFirst({
        where: {
          isActive: true,
          OR: [{ scope: "GLOBAL" }, { scope: "PRIVATE", ownerUserId: userId }],
          name: { contains: ex.name, mode: "insensitive" }
        },
        select: { id: true }
      }));

    if (!found) {
      notFound.push(ex.name);
      continue;
    }

    await prisma.workoutPlanExercise.create({
      data: {
        workoutPlanId: plan.id,
        exerciseId: found.id,
        orderIndex: orderIndex++,
        sets: ex.sets ?? 3,
        repsMin: ex.repsMin ?? null,
        repsMax: ex.repsMax ?? null,
        restSec: ex.restSec ?? null,
        notes: ex.notes ?? null
      }
    });
  }

  return { planId: plan.id, planName: plan.name, notFoundExercises: notFound };
}
