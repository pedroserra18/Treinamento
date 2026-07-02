import { Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { AppError } from "../../shared/errors/app-error";
import { assertWithinLimit } from "../../shared/plan-limits";
import { trackEvent } from "../../shared/services/event-log.service";
import { resolveExerciseSearchTerm } from "../exercise/exercise-search-vocabulary";
import { getWorkoutRecommendationsForUser } from "../recommendation/recommendation.service";
import {
  AddPlanCardioBody,
  AddPlanExerciseBody,
  AddPlanExercisesBatchBody,
  CreateWorkoutPlanBody,
  CreateWorkoutPlanWithExercisesBody,
  UpdateWorkoutPlanWithExercisesBody,
  DeletePlanExercisesBatchBody,
  PlanCardioParams,
  PlanExerciseParams,
  RecommendationTemplateQuery,
  ReorderPlanExercisesBody,
  SearchExercisesQuery,
  UpdateWorkoutPlanBody,
  UpdatePlanExerciseBody,
  WorkoutPlanParams
} from "./workout.schema";

import { assertOwnedPlan } from "./workout-helpers";

import { EventContext } from "../../shared/utils/event-context";

type TemplateOption = {
  key: string;
  title: string;
  structure: string[];
};

const TEMPLATE_RECOMMENDATIONS: Record<string, { male: TemplateOption[]; female: TemplateOption[] }> = {
  "1-3": {
    male: [
      { key: "PPL", title: "Push Pull Legs", structure: ["Push", "Pull", "Legs"] },
      { key: "FB", title: "Full Body", structure: ["Full Body A", "Full Body B", "Full Body C"] }
    ],
    female: [
      { key: "PPL", title: "Push Pull Legs", structure: ["Push", "Pull", "Legs"] },
      { key: "FB", title: "Full Body", structure: ["Full Body A", "Full Body B", "Full Body C"] }
    ]
  },
  "4": {
    male: [
      { key: "UL2X", title: "Upper/Lower 2x", structure: ["Upper", "Lower", "Upper", "Lower"] },
      {
        key: "TL2X",
        title: "Torso/Limbs 2x",
        structure: ["Torso", "Limbs", "Torso", "Limbs"]
      }
    ],
    female: [
      { key: "UL2X", title: "Upper/Lower 2x", structure: ["Upper", "Lower", "Upper", "Lower"] },
      {
        key: "TL2X",
        title: "Torso/Limbs 2x",
        structure: ["Torso", "Limbs", "Torso", "Limbs"]
      }
    ]
  },
  "5": {
    male: [
      {
        key: "PPL_UL",
        title: "PPL/UL",
        structure: ["Push", "Pull", "Legs", "Upper", "Lower"]
      },
      {
        key: "UL_UL_U",
        title: "UL/UL/U",
        structure: ["Upper", "Lower", "Upper", "Lower", "Upper"]
      }
    ],
    female: [
      {
        key: "PPL_UL",
        title: "PPL/UL",
        structure: ["Push", "Pull", "Legs", "Upper", "Lower"]
      },
      {
        key: "LU_LU_L",
        title: "LU/LU/L",
        structure: ["Lower", "Upper", "Lower", "Upper", "Lower"]
      }
    ]
  },
  "6": {
    male: [
      {
        key: "PPL_PPL",
        title: "PPL/PPL",
        structure: ["Push", "Pull", "Legs", "Push", "Pull", "Legs"]
      },
      {
        key: "UL_UL_UL",
        title: "UL/UL/UL",
        structure: ["Upper", "Lower", "Upper", "Lower", "Upper", "Lower"]
      }
    ],
    female: [
      {
        key: "PPL_PPL",
        title: "PPL/PPL",
        structure: ["Push", "Pull", "Legs", "Push", "Pull", "Legs"]
      },
      {
        key: "UL_UL_UL",
        title: "UL/UL/UL",
        structure: ["Upper", "Lower", "Upper", "Lower", "Upper", "Lower"]
      }
    ]
  },
  "7": {
    male: [
      {
        key: "BRO_UL",
        title: "Bro Split/UL",
        structure: ["Chest", "Back", "Legs", "Shoulders", "Arms", "Upper", "Lower"]
      },
      {
        key: "BRO_TL",
        title: "Bro Split/Torso Limbs",
        structure: ["Chest", "Back", "Legs", "Shoulders", "Arms", "Torso", "Limbs"]
      }
    ],
    female: [
      {
        key: "BRO_UL",
        title: "Bro Split/UL",
        structure: ["Chest", "Back", "Legs", "Shoulders", "Arms", "Upper", "Lower"]
      },
      {
        key: "BRO_TL",
        title: "Bro Split/Torso Limbs",
        structure: ["Chest", "Back", "Legs", "Shoulders", "Arms", "Torso", "Limbs"]
      }
    ]
  }
};

async function assertExerciseAvailableToUser(exerciseId: string, userId: string): Promise<void> {
  const exercise = await prisma.exercise.findFirst({
    where: {
      id: exerciseId,
      isActive: true,
      OR: [{ scope: "GLOBAL" }, { scope: "PRIVATE", ownerUserId: userId }]
    },
    select: { id: true }
  });

  if (!exercise) {
    throw new AppError("Exercise not found", {
      statusCode: 404,
      code: "EXERCISE_NOT_FOUND"
    });
  }
}

async function getOwnedPlanWithExercises(planId: string, userId: string) {
  const plan = await prisma.workoutPlan.findFirst({
    where: {
      id: planId,
      userId,
      status: {
        in: ["ACTIVE", "DRAFT"]
      }
    },
    include: {
      exercises: {
        orderBy: [{ orderIndex: "asc" }, { createdAt: "asc" }]
      }
    }
  });

  if (!plan) {
    throw new AppError("Workout plan not found", {
      statusCode: 404,
      code: "WORKOUT_PLAN_NOT_FOUND"
    });
  }

  return plan;
}

function templateKeyByDays(daysPerWeek: number): string {
  if (daysPerWeek <= 3) {
    return "1-3";
  }

  return String(daysPerWeek);
}

export async function listUserWorkoutPlans(userId: string) {
  const plans = await prisma.workoutPlan.findMany({
    where: {
      userId,
      status: {
        in: ["ACTIVE", "DRAFT"]
      },
      archivedAt: null,
      // Templates ocultos (ex.: rotinas criadas via "Criar e enviar") existem
      // só pra servir o link compartilhado — não entram nas rotinas do criador.
      isTemplate: false
    },
    orderBy: [{ createdAt: "desc" }],
    include: {
      exercises: {
        orderBy: [{ orderIndex: "asc" }, { createdAt: "asc" }],
        include: {
          exercise: {
            select: {
              id: true,
              name: true,
              primaryMuscleGroup: true,
              difficulty: true,
              equipment: true,
              isBodyweight: true,
              allowsExtraLoad: true,
              trackingType: true,
              thumbnailUrl: true,
              videoUrl: true
            }
          }
        }
      },
      cardio: {
        orderBy: [{ orderIndex: "asc" }, { createdAt: "asc" }],
        select: { id: true, orderIndex: true, type: true, durationSec: true, distanceMeters: true, notes: true }
      }
    }
  });

  return plans;
}

// Últimas N "gerações de IA" do usuário, agrupadas pelo aiGenerationId.
// Cada generation traz a lista de planos-dia que nasceram juntos +
// metadados (label legível, timestamp da geração). Usada pelo botão
// "Ver treinos gerados" do AIWorkoutPage. Filtra ACTIVE+não-archived
// pra alinhar com listUserWorkoutPlans (não mostra plano que o user
// apagou manualmente em /workouts).
export type RecentAIGeneration = {
  aiGenerationId: string;
  aiGenerationLabel: string | null;
  generatedAt: string; // ISO — createdAt do plano mais antigo da geração
  plans: Array<{
    id: string;
    name: string;
    exerciseCount: number;
  }>;
};

export async function listRecentAIGenerations(
  userId: string,
  limit: number
): Promise<RecentAIGeneration[]> {
  // Estratégia: buscar TODOS planos com aiGenerationId not null do user
  // (ACTIVE+não-archived), agrupar em memória pelo id, ordenar gerações
  // por max(createdAt) desc, take limit. Volume real é pequeno (~50 planos
  // por user no extremo), agrupar em SQL com Prisma raw seria mais código
  // sem ganho mensurável.
  const plans = await prisma.workoutPlan.findMany({
    where: {
      userId,
      aiGenerationId: { not: null },
      status: { in: ["ACTIVE", "DRAFT"] },
      archivedAt: null
    },
    orderBy: [{ createdAt: "desc" }],
    select: {
      id: true,
      name: true,
      createdAt: true,
      aiGenerationId: true,
      aiGenerationLabel: true,
      _count: { select: { exercises: true } }
    }
  });

  type Bucket = {
    aiGenerationId: string;
    aiGenerationLabel: string | null;
    generatedAt: Date;
    plans: Array<{ id: string; name: string; exerciseCount: number }>;
  };
  const byGen = new Map<string, Bucket>();
  for (const p of plans) {
    const gid = p.aiGenerationId!;
    let bucket = byGen.get(gid);
    if (!bucket) {
      bucket = {
        aiGenerationId: gid,
        aiGenerationLabel: p.aiGenerationLabel,
        generatedAt: p.createdAt,
        plans: []
      };
      byGen.set(gid, bucket);
    }
    // Mantém o createdAt mais ANTIGO como "generatedAt" (representa o
    // momento que a geração começou). createdAt mais recente também
    // serve, mas o antigo evita drift quando saves vão um após outro.
    if (p.createdAt < bucket.generatedAt) bucket.generatedAt = p.createdAt;
    // Label idealmente é igual em todos os planos do mesmo id; usamos
    // o primeiro não-null como fallback se algum row vier sem.
    if (!bucket.aiGenerationLabel && p.aiGenerationLabel) {
      bucket.aiGenerationLabel = p.aiGenerationLabel;
    }
    bucket.plans.push({
      id: p.id,
      name: p.name,
      exerciseCount: p._count.exercises
    });
  }

  // Ordena gerações por mais recente primeiro (baseado no mais NOVO de
  // cada bucket, pra "última geração" subir).
  const generations = Array.from(byGen.values());
  generations.sort((a, b) => {
    const aLatest = Math.max(...a.plans.map((_) => 0), a.generatedAt.getTime());
    const bLatest = Math.max(...b.plans.map((_) => 0), b.generatedAt.getTime());
    return bLatest - aLatest;
  });

  // Re-ordena planos dentro de cada bucket por createdAt asc (Plan A,
  // Plan B, Plan C…). Prisma já trouxe desc; ordenamos local.
  for (const bucket of generations) {
    bucket.plans.sort((a, b) => a.id.localeCompare(b.id));
  }

  return generations.slice(0, limit).map((b) => ({
    aiGenerationId: b.aiGenerationId,
    aiGenerationLabel: b.aiGenerationLabel,
    generatedAt: b.generatedAt.toISOString(),
    plans: b.plans
  }));
}

export async function createWorkoutPlan(userId: string, payload: CreateWorkoutPlanBody) {
  // Tier gate: conta rotinas ATIVAS+não-archived do user. Archived/deleted
  // não contam (libera slot). PRO bypassa via assertWithinLimit.
  const currentCount = await prisma.workoutPlan.count({
    where: { userId, archivedAt: null, status: { in: ["ACTIVE", "DRAFT"] }, isTemplate: false }
  });
  await assertWithinLimit(userId, "workoutPlans", currentCount);

  return prisma.workoutPlan.create({
    data: {
      userId,
      name: payload.name,
      description:
        payload.source === "RECOMMENDATION"
          ? `${payload.description ?? ""} [Template: ${payload.templateKey ?? "custom"}; Dias: ${payload.daysPerWeek ?? "n/a"}]`.trim()
          : payload.description,
      status: "ACTIVE"
    }
  });
}

// Cria o plan E adiciona os exercícios numa única transação atômica.
// Substitui o fluxo "createWorkoutPlan() + addExercisesToPlanBatch()" que
// fazia 2 round-trips do client. Tudo numa transação garante: se o batch
// falhar, o plan é revertido (sem rotina vazia órfã).
export async function createWorkoutPlanWithExercises(
  userId: string,
  payload: CreateWorkoutPlanWithExercisesBody
) {
  const currentCount = await prisma.workoutPlan.count({
    where: { userId, archivedAt: null, status: { in: ["ACTIVE", "DRAFT"] }, isTemplate: false }
  });
  await assertWithinLimit(userId, "workoutPlans", currentCount);

  const incomingIds = payload.exercises.map((item) => item.exerciseId);

  // Dedup dentro do lote.
  if (new Set(incomingIds).size !== incomingIds.length) {
    throw new AppError("Exercicio duplicado no lote", {
      statusCode: 400,
      code: "PLAN_EXERCISE_BATCH_DUPLICATE"
    });
  }

  // Availability check single-query (GLOBAL ou PRIVATE do user).
  if (incomingIds.length > 0) {
    const availableCount = await prisma.exercise.count({
      where: {
        id: { in: incomingIds },
        isActive: true,
        OR: [{ scope: "GLOBAL" }, { scope: "PRIVATE", ownerUserId: userId }]
      }
    });
    if (availableCount !== incomingIds.length) {
      throw new AppError("Exercise not found", {
        statusCode: 404,
        code: "EXERCISE_NOT_FOUND"
      });
    }
  }

  const planId = await prisma.$transaction(async (tx) => {
    const plan = await tx.workoutPlan.create({
      data: {
        userId,
        name: payload.name,
        description:
          payload.source === "RECOMMENDATION"
            ? `${payload.description ?? ""} [Template: ${payload.templateKey ?? "custom"}; Dias: ${payload.daysPerWeek ?? "n/a"}]`.trim()
            : payload.description,
        status: "ACTIVE"
      }
    });

    if (payload.exercises.length > 0) {
      await tx.workoutPlanExercise.createMany({
        data: payload.exercises.map((item, i) => ({
          workoutPlanId: plan.id,
          exerciseId: item.exerciseId,
          orderIndex: i + 1,
          sets: item.sets,
          repsMin: item.repsMin,
          repsMax: item.repsMax,
          durationSec: item.durationSec,
          restSec: item.restSec,
          notes: item.notes
        }))
      });
    }

    return plan.id;
  });

  // Devolve o plan completo (mesma shape do listUserWorkoutPlans) pro
  // cliente atualizar a lista local sem refetch — economiza mais 1 round-trip.
  const full = await prisma.workoutPlan.findFirstOrThrow({
    where: { id: planId, userId },
    include: {
      exercises: {
        orderBy: [{ orderIndex: "asc" }, { createdAt: "asc" }],
        include: {
          exercise: {
            select: {
              id: true,
              name: true,
              primaryMuscleGroup: true,
              difficulty: true,
              equipment: true,
              isBodyweight: true,
              allowsExtraLoad: true,
              trackingType: true,
              thumbnailUrl: true,
              videoUrl: true
            }
          }
        }
      },
      cardio: {
        orderBy: [{ orderIndex: "asc" }, { createdAt: "asc" }],
        select: { id: true, orderIndex: true, type: true, durationSec: true, distanceMeters: true, notes: true }
      }
    }
  });

  return full;
}

// Update combinado pra tela "Editar rotina": atualiza o nome e SUBSTITUI
// todos os exercícios numa única transação (delete-all + createMany). Atômico
// — sem janela de "rotina sem exercícios" se algo falhar no meio.
export async function updateWorkoutPlanWithExercises(
  userId: string,
  params: WorkoutPlanParams,
  payload: UpdateWorkoutPlanWithExercisesBody
) {
  await assertOwnedPlan(params.planId, userId);

  const incomingIds = payload.exercises.map((item) => item.exerciseId);
  if (new Set(incomingIds).size !== incomingIds.length) {
    throw new AppError("Exercicio duplicado no lote", {
      statusCode: 400,
      code: "PLAN_EXERCISE_BATCH_DUPLICATE"
    });
  }
  if (incomingIds.length > 0) {
    const availableCount = await prisma.exercise.count({
      where: {
        id: { in: incomingIds },
        isActive: true,
        OR: [{ scope: "GLOBAL" }, { scope: "PRIVATE", ownerUserId: userId }]
      }
    });
    if (availableCount !== incomingIds.length) {
      throw new AppError("Exercise not found", { statusCode: 404, code: "EXERCISE_NOT_FOUND" });
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.workoutPlan.update({
      where: { id: params.planId },
      data: {
        name: payload.name,
        ...(payload.description !== undefined ? { description: payload.description } : {})
      }
    });
    await tx.workoutPlanExercise.deleteMany({ where: { workoutPlanId: params.planId } });
    if (payload.exercises.length > 0) {
      await tx.workoutPlanExercise.createMany({
        data: payload.exercises.map((item, i) => ({
          workoutPlanId: params.planId,
          exerciseId: item.exerciseId,
          orderIndex: i + 1,
          sets: item.sets,
          repsMin: item.repsMin,
          repsMax: item.repsMax,
          durationSec: item.durationSec,
          restSec: item.restSec,
          notes: item.notes
        }))
      });
    }
  });

  const full = await prisma.workoutPlan.findFirstOrThrow({
    where: { id: params.planId, userId },
    include: {
      exercises: {
        orderBy: [{ orderIndex: "asc" }, { createdAt: "asc" }],
        include: {
          exercise: {
            select: {
              id: true,
              name: true,
              primaryMuscleGroup: true,
              difficulty: true,
              equipment: true,
              isBodyweight: true,
              allowsExtraLoad: true,
              trackingType: true,
              thumbnailUrl: true,
              videoUrl: true
            }
          }
        }
      },
      cardio: {
        orderBy: [{ orderIndex: "asc" }, { createdAt: "asc" }],
        select: { id: true, orderIndex: true, type: true, durationSec: true, distanceMeters: true, notes: true }
      }
    }
  });

  return full;
}

export async function deleteWorkoutPlan(userId: string, params: WorkoutPlanParams) {
  await assertOwnedPlan(params.planId, userId);

  await prisma.workoutPlan.delete({
    where: { id: params.planId }
  });

  return {
    success: true
  };
}

export async function updateWorkoutPlan(
  userId: string,
  params: WorkoutPlanParams,
  payload: UpdateWorkoutPlanBody
) {
  await assertOwnedPlan(params.planId, userId);

  return prisma.workoutPlan.update({
    where: { id: params.planId },
    data: {
      ...(payload.name !== undefined ? { name: payload.name } : {}),
      ...(payload.description !== undefined ? { description: payload.description } : {})
    }
  });
}

export async function addExerciseToPlan(
  userId: string,
  params: WorkoutPlanParams,
  payload: AddPlanExerciseBody
) {
  const plan = await getOwnedPlanWithExercises(params.planId, userId);
  await assertExerciseAvailableToUser(payload.exerciseId, userId);

  const duplicated = plan.exercises.some((entry) => entry.exerciseId === payload.exerciseId);
  if (duplicated) {
    throw new AppError("Este exercicio ja existe neste treino", {
      statusCode: 409,
      code: "PLAN_EXERCISE_DUPLICATE"
    });
  }

  const nextIndex = (plan.exercises[plan.exercises.length - 1]?.orderIndex ?? 0) + 1;
  const targetIndex = payload.insertAt ? Math.min(payload.insertAt, nextIndex) : nextIndex;

  const created = await prisma.$transaction(async (tx) => {
    if (targetIndex < nextIndex) {
      await tx.workoutPlanExercise.updateMany({
        where: {
          workoutPlanId: params.planId,
          orderIndex: {
            gte: targetIndex
          }
        },
        data: {
          orderIndex: {
            increment: 1
          }
        }
      });
    }

    return tx.workoutPlanExercise.create({
      data: {
        workoutPlanId: params.planId,
        exerciseId: payload.exerciseId,
        orderIndex: targetIndex,
        sets: payload.sets,
        repsMin: payload.repsMin,
        repsMax: payload.repsMax,
        durationSec: payload.durationSec,
        restSec: payload.restSec,
        notes: payload.notes
      },
      include: {
        exercise: {
          select: {
            id: true,
            name: true,
            primaryMuscleGroup: true,
            difficulty: true,
            equipment: true,
            isBodyweight: true,
            allowsExtraLoad: true,
            trackingType: true
          }
        }
      }
    });
  });

  return created;
}

export async function updatePlanExercise(
  userId: string,
  params: PlanExerciseParams,
  payload: UpdatePlanExerciseBody
) {
  await getOwnedPlanWithExercises(params.planId, userId);

  const existing = await prisma.workoutPlanExercise.findFirst({
    where: {
      id: params.planExerciseId,
      workoutPlanId: params.planId
    },
    select: {
      id: true,
      orderIndex: true,
      exerciseId: true
    }
  });

  if (!existing) {
    throw new AppError("Plan exercise not found", {
      statusCode: 404,
      code: "PLAN_EXERCISE_NOT_FOUND"
    });
  }

  if (payload.exerciseId) {
    await assertExerciseAvailableToUser(payload.exerciseId, userId);

    if (payload.exerciseId !== existing.exerciseId) {
      const duplicated = await prisma.workoutPlanExercise.findFirst({
        where: {
          workoutPlanId: params.planId,
          exerciseId: payload.exerciseId,
          id: {
            not: params.planExerciseId
          }
        },
        select: {
          id: true
        }
      });

      if (duplicated) {
        throw new AppError("Este exercicio ja existe neste treino", {
          statusCode: 409,
          code: "PLAN_EXERCISE_DUPLICATE"
        });
      }
    }
  }

  if (payload.orderIndex && payload.orderIndex !== existing.orderIndex) {
    const fullPlan = await getOwnedPlanWithExercises(params.planId, userId);
    const targetIndex = Math.max(1, Math.min(payload.orderIndex, fullPlan.exercises.length));
    const currentIds = fullPlan.exercises.map((item) => item.id);
    const fromIndex = currentIds.findIndex((id) => id === params.planExerciseId);
    const toIndex = targetIndex - 1;

    if (fromIndex >= 0 && fromIndex !== toIndex) {
      const orderedIds = [...currentIds];
      const [movedId] = orderedIds.splice(fromIndex, 1);
      orderedIds.splice(toIndex, 0, movedId);

      await prisma.$transaction(async (tx) => {
        const tempOffset = orderedIds.length + 100;

        await tx.workoutPlanExercise.updateMany({
          where: {
            workoutPlanId: params.planId,
            id: {
              in: orderedIds
            }
          },
          data: {
            orderIndex: {
              increment: tempOffset
            }
          }
        });

        for (let index = 0; index < orderedIds.length; index += 1) {
          await tx.workoutPlanExercise.update({
            where: { id: orderedIds[index] },
            data: {
              orderIndex: index + 1
            }
          });
        }
      });
    }
  }

  return prisma.workoutPlanExercise.update({
    where: { id: params.planExerciseId },
    data: {
      exerciseId: payload.exerciseId,
      customName: payload.customName === null ? null : payload.customName,
      sets: payload.sets === null ? null : payload.sets,
      repsMin: payload.repsMin === null ? null : payload.repsMin,
      repsMax: payload.repsMax === null ? null : payload.repsMax,
      durationSec: payload.durationSec === null ? null : payload.durationSec,
      restSec: payload.restSec === null ? null : payload.restSec,
      notes: payload.notes === null ? null : payload.notes
    },
    include: {
      exercise: {
        select: {
          id: true,
          name: true,
          primaryMuscleGroup: true,
          difficulty: true,
          equipment: true,
          isBodyweight: true,
          allowsExtraLoad: true,
          trackingType: true
        }
      }
    }
  });
}

export async function deletePlanExercise(userId: string, params: PlanExerciseParams) {
  await getOwnedPlanWithExercises(params.planId, userId);

  const existing = await prisma.workoutPlanExercise.findFirst({
    where: {
      id: params.planExerciseId,
      workoutPlanId: params.planId
    },
    select: {
      id: true,
      orderIndex: true
    }
  });

  if (!existing) {
    throw new AppError("Plan exercise not found", {
      statusCode: 404,
      code: "PLAN_EXERCISE_NOT_FOUND"
    });
  }

  await prisma.$transaction(async (tx) => {
    await tx.workoutPlanExercise.delete({
      where: {
        id: params.planExerciseId
      }
    });

    await tx.workoutPlanExercise.updateMany({
      where: {
        workoutPlanId: params.planId,
        orderIndex: {
          gt: existing.orderIndex
        }
      },
      data: {
        orderIndex: {
          decrement: 1
        }
      }
    });
  });

  return {
    success: true
  };
}

// ── Batch add/delete de exercícios ───────────────────────────────────────────
// Endpoints atômicos pra adicionar/remover N exercícios de uma vez. O cliente
// chamava /exercises N vezes em loop (sequencial pra evitar race no
// @@unique([workoutPlanId, orderIndex])), o que tornava criar/editar rotinas
// lento. Aqui resolvemos numa única transação: orderIndex calculado uma vez,
// inserts sequenciais dentro de tx (sem race) e re-normalização do índice
// depois do delete preserva a sequência 1..N do plan.

export async function addExercisesToPlanBatch(
  userId: string,
  params: WorkoutPlanParams,
  payload: AddPlanExercisesBatchBody
) {
  const plan = await getOwnedPlanWithExercises(params.planId, userId);
  const incomingIds = payload.exercises.map((item) => item.exerciseId);

  // Duplicado DENTRO do batch?
  const seenInBatch = new Set<string>();
  for (const id of incomingIds) {
    if (seenInBatch.has(id)) {
      throw new AppError("Exercicio duplicado no lote", {
        statusCode: 400,
        code: "PLAN_EXERCISE_BATCH_DUPLICATE"
      });
    }
    seenInBatch.add(id);
  }

  // Já existe no plan?
  const existingIds = new Set(plan.exercises.map((entry) => entry.exerciseId));
  const collision = incomingIds.find((id) => existingIds.has(id));
  if (collision) {
    throw new AppError("Este exercicio ja existe neste treino", {
      statusCode: 409,
      code: "PLAN_EXERCISE_DUPLICATE"
    });
  }

  // Disponibilidade: 1 query agregada em vez de N (scope GLOBAL OU owner).
  const availableCount = await prisma.exercise.count({
    where: {
      id: { in: incomingIds },
      isActive: true,
      OR: [{ scope: "GLOBAL" }, { scope: "PRIVATE", ownerUserId: userId }]
    }
  });
  if (availableCount !== incomingIds.length) {
    throw new AppError("Exercise not found", {
      statusCode: 404,
      code: "EXERCISE_NOT_FOUND"
    });
  }

  const baseIndex = (plan.exercises[plan.exercises.length - 1]?.orderIndex ?? 0) + 1;

  // createMany numa única query em vez de N inserts dentro da transação.
  // O cliente não usa os rows criados (chama listUserWorkoutPlans depois ou
  // confia no cache invalidate), então só retornamos `count`.
  const result = await prisma.workoutPlanExercise.createMany({
    data: payload.exercises.map((item, i) => ({
      workoutPlanId: params.planId,
      exerciseId: item.exerciseId,
      orderIndex: baseIndex + i,
      sets: item.sets,
      repsMin: item.repsMin,
      repsMax: item.repsMax,
      durationSec: item.durationSec,
      restSec: item.restSec,
      notes: item.notes
    }))
  });

  return { success: true, count: result.count };
}

export async function deletePlanExercisesBatch(
  userId: string,
  params: WorkoutPlanParams,
  payload: DeletePlanExercisesBatchBody
) {
  const plan = await getOwnedPlanWithExercises(params.planId, userId);
  const requestedIds = payload.planExerciseIds;
  const requestedSet = new Set(requestedIds);

  // Todos os ids devem pertencer ao plano (e ser únicos na requisição).
  if (new Set(requestedIds).size !== requestedIds.length) {
    throw new AppError("Lista de planExerciseIds tem duplicatas", {
      statusCode: 400,
      code: "INVALID_INPUT"
    });
  }
  const planIdsSet = new Set(plan.exercises.map((entry) => entry.id));
  const stranger = requestedIds.find((id) => !planIdsSet.has(id));
  if (stranger) {
    throw new AppError("Plan exercise not found", {
      statusCode: 404,
      code: "PLAN_EXERCISE_NOT_FOUND"
    });
  }

  // Ordem final dos que sobram, preservando a sequência atual.
  const remainingIds = plan.exercises
    .filter((entry) => !requestedSet.has(entry.id))
    .map((entry) => entry.id);

  await prisma.$transaction(async (tx) => {
    await tx.workoutPlanExercise.deleteMany({
      where: {
        id: { in: requestedIds },
        workoutPlanId: params.planId
      }
    });

    if (remainingIds.length === 0) return;

    // Re-normaliza orderIndex pra 1..N. Igual ao reorder, faz two-pass com
    // offset temporário pra contornar o @@unique([workoutPlanId, orderIndex]).
    const tempOffset = remainingIds.length + 100;
    await tx.workoutPlanExercise.updateMany({
      where: {
        workoutPlanId: params.planId,
        id: { in: remainingIds }
      },
      data: {
        orderIndex: { increment: tempOffset }
      }
    });
    for (let i = 0; i < remainingIds.length; i += 1) {
      await tx.workoutPlanExercise.update({
        where: { id: remainingIds[i] },
        data: { orderIndex: i + 1 }
      });
    }
  });

  return { success: true };
}

// ── Cardio do template da rotina ───────────────────────────────────────────
// Cada rotina pode ter N entradas de cardio (aquecimento/finalizador) que são
// pré-carregadas na sessão ativa ao iniciar a rotina.

export async function addPlanCardio(
  userId: string,
  params: WorkoutPlanParams,
  payload: AddPlanCardioBody
) {
  await assertOwnedPlan(params.planId, userId);

  const last = await prisma.workoutPlanCardio.findFirst({
    where: { workoutPlanId: params.planId },
    orderBy: { orderIndex: "desc" },
    select: { orderIndex: true }
  });
  const nextIndex = (last?.orderIndex ?? -1) + 1;

  return prisma.workoutPlanCardio.create({
    data: {
      workoutPlanId: params.planId,
      orderIndex: nextIndex,
      type: payload.type,
      durationSec: payload.durationSec,
      distanceMeters: payload.distanceMeters,
      notes: payload.notes
    },
    select: { id: true, orderIndex: true, type: true, durationSec: true, distanceMeters: true, notes: true }
  });
}

export async function deletePlanCardio(userId: string, params: PlanCardioParams) {
  await assertOwnedPlan(params.planId, userId);

  const existing = await prisma.workoutPlanCardio.findFirst({
    where: { id: params.planCardioId, workoutPlanId: params.planId },
    select: { id: true, orderIndex: true }
  });

  if (!existing) {
    throw new AppError("Plan cardio not found", {
      statusCode: 404,
      code: "PLAN_CARDIO_NOT_FOUND"
    });
  }

  await prisma.$transaction(async (tx) => {
    await tx.workoutPlanCardio.delete({ where: { id: params.planCardioId } });
    await tx.workoutPlanCardio.updateMany({
      where: { workoutPlanId: params.planId, orderIndex: { gt: existing.orderIndex } },
      data: { orderIndex: { decrement: 1 } }
    });
  });

  return { success: true };
}

export async function reorderPlanExercises(
  userId: string,
  params: WorkoutPlanParams,
  payload: ReorderPlanExercisesBody
) {
  const plan = await getOwnedPlanWithExercises(params.planId, userId);
  const currentIds = plan.exercises.map((item) => item.id);
  const inputIds = payload.orderedExerciseIds;

  if (currentIds.length !== inputIds.length) {
    throw new AppError("Ordered exercise list size mismatch", {
      statusCode: 400,
      code: "INVALID_REORDER_INPUT"
    });
  }

  const currentSet = new Set(currentIds);
  const hasMismatch = inputIds.some((id) => !currentSet.has(id));
  if (hasMismatch) {
    throw new AppError("Ordered exercise list contains invalid ids", {
      statusCode: 400,
      code: "INVALID_REORDER_INPUT"
    });
  }

  await prisma.$transaction(async (tx) => {
    const tempOffset = inputIds.length + 100;

    // Move all target rows out of the unique orderIndex range first.
    await tx.workoutPlanExercise.updateMany({
      where: {
        workoutPlanId: params.planId,
        id: {
          in: inputIds
        }
      },
      data: {
        orderIndex: {
          increment: tempOffset
        }
      }
    });

    // Then assign the final contiguous order safely.
    for (let index = 0; index < inputIds.length; index += 1) {
      await tx.workoutPlanExercise.update({
        where: { id: inputIds[index] },
        data: {
          orderIndex: index + 1
        }
      });
    }
  });

  return getOwnedPlanWithExercises(params.planId, userId);
}

export async function searchExercisesForPlan(userId: string, query: SearchExercisesQuery) {
  // Busca expandida estilo apps profissionais (Hevy/Strong/Fitbod):
  // textual em name+slug+equipment + grupo muscular quando o termo é
  // apelido PT-BR ('biceps' → BICEPS, 'peito' → CHEST, 'perna' → LEGS+
  // QUADS+HAMSTRINGS+CALVES). Vocabulário centralizado em
  // exercise-search-vocabulary pra manter um único lugar de manutenção.
  const searchOr: Prisma.ExerciseWhereInput[] = [];
  if (query.q) {
    const { normalizedText, muscleGroups } = resolveExerciseSearchTerm(query.q);
    searchOr.push(
      { name: { contains: query.q, mode: "insensitive" } },
      { slug: { contains: query.q, mode: "insensitive" } },
      { equipment: { contains: query.q, mode: "insensitive" } }
    );
    if (normalizedText && normalizedText !== query.q.toLowerCase()) {
      searchOr.push(
        { name: { contains: normalizedText, mode: "insensitive" } },
        { slug: { contains: normalizedText, mode: "insensitive" } }
      );
    }
    if (muscleGroups.length > 0) {
      searchOr.push(
        { primaryMuscleGroup: { in: muscleGroups } },
        { secondaryMuscleGroup: { in: muscleGroups } }
      );
    }
  }

  return prisma.exercise.findMany({
    where: {
      isActive: true,
      OR: [{ scope: "GLOBAL" }, { scope: "PRIVATE", ownerUserId: userId }],
      ...(query.primaryMuscleGroup ? { primaryMuscleGroup: query.primaryMuscleGroup } : {}),
      ...(searchOr.length > 0 ? { AND: [{ OR: searchOr }] } : {})
    },
    orderBy: [{ name: "asc" }],
    take: query.limit,
    select: {
      id: true,
      name: true,
      primaryMuscleGroup: true,
      difficulty: true,
      equipment: true,
      isBodyweight: true,
      allowsExtraLoad: true,
      trackingType: true,
      thumbnailUrl: true,
      videoUrl: true,
      // scope vai pro client pra ele separar exercícios "Personalizados"
      // (PRIVATE = criados pelo próprio usuário) de "Globais" no picker.
      scope: true
    }
  });
}

export function getRecommendationTemplates(query: RecommendationTemplateQuery) {
  const key = templateKeyByDays(query.daysPerWeek);
  const bySex = query.sex === "FEMALE" ? "female" : "male";
  const templates = TEMPLATE_RECOMMENDATIONS[key][bySex];
  const warning =
    query.daysPerWeek === 1 || query.daysPerWeek === 2
      ? "1 e 2 dias por semana sao menos recomendados por baixa frequencia de estimulo."
      : query.daysPerWeek === 7
        ? "7 dias por semana e menos recomendado por risco de recuperacao insuficiente."
        : null;

  return {
    daysPerWeek: query.daysPerWeek,
    sex: query.sex,
    warning,
    templates
  };
}

export async function fetchWorkoutRecommendations(userId: string, context: EventContext) {
  const data = await getWorkoutRecommendationsForUser(userId);

  await trackEvent({
    userId,
    category: "WORKOUT",
    action: "recommendations_fetched",
    resourceType: "workout_recommendation",
    requestId: context.requestId,
    ipAddress: context.ipAddress,
    userAgent: context.userAgent,
    metadata: {
      availableDaysPerWeek: data.inputs.availableDaysPerWeek,
      recommendationCount: data.recommendations.length
    }
  });

  return data;
}


// Sessões/histórico de treino vivem em workout-session.service.ts.
// Reexportadas aqui para manter a superfície de import do controller estável.
export * from "./workout-session.service";
