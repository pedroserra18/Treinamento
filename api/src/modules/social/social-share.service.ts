import { prisma } from "../../config/prisma";
import { AppError } from "../../shared/errors/app-error";

export async function sharePlan(userId: string, planId: string) {
  const plan = await prisma.workoutPlan.findFirst({
    where: { id: planId, userId },
    select: { id: true, name: true },
  });
  if (!plan) throw new AppError("Rotina não encontrada", { statusCode: 404, code: "PLAN_NOT_FOUND" });

  const shared = await prisma.sharedPlan.create({
    data: { planId, creatorId: userId },
    select: { token: true },
  });

  return { token: shared.token };
}

// "Criar e enviar rotina": cria a rotina como TEMPLATE OCULTO (isTemplate=true)
// + o shared link, numa transação. O template não aparece nas rotinas do
// criador nem conta no limite do tier (listUserWorkoutPlans e o contador de
// limite filtram isTemplate=false). Ele existe só pra servir o link — quem
// abre o link salva uma cópia normal na própria conta.
export async function createAndSharePlan(
  userId: string,
  data: {
    name: string;
    exercises: Array<{
      exerciseId: string;
      sets: number;
      repsMin?: number;
      repsMax?: number;
      restSec?: number;
      notes?: string;
    }>;
  },
) {
  return prisma.$transaction(async (tx) => {
    const plan = await tx.workoutPlan.create({
      data: { userId, name: data.name, status: "ACTIVE", isTemplate: true },
      select: { id: true },
    });

    await tx.workoutPlanExercise.createMany({
      data: data.exercises.map((ex, i) => ({
        workoutPlanId: plan.id,
        exerciseId: ex.exerciseId,
        orderIndex: i,
        sets: ex.sets,
        repsMin: ex.repsMin,
        repsMax: ex.repsMax,
        restSec: ex.restSec,
        notes: ex.notes,
      })),
    });

    const shared = await tx.sharedPlan.create({
      data: { planId: plan.id, creatorId: userId },
      select: { token: true },
    });

    return { token: shared.token };
  });
}

export async function getSharedPlan(token: string) {
  const shared = await prisma.sharedPlan.findUnique({
    where: { token },
    select: {
      plan: {
        select: {
          id: true,
          name: true,
          description: true,
          exercises: {
            orderBy: { orderIndex: "asc" },
            select: {
              orderIndex: true,
              sets: true,
              repsMin: true,
              repsMax: true,
              restSec: true,
              notes: true,
              exercise: { select: { id: true, name: true, primaryMuscleGroup: true, equipment: true, thumbnailUrl: true } },
            },
          },
        },
      },
      creator: { select: { id: true, name: true, avatarUrl: true } },
      createdAt: true,
    },
  });

  if (!shared) throw new AppError("Link inválido ou expirado", { statusCode: 404, code: "SHARED_PLAN_NOT_FOUND" });

  return shared;
}

export async function saveSharedPlan(userId: string, token: string) {
  const shared = await getSharedPlan(token);

  const newPlan = await prisma.workoutPlan.create({
    data: {
      userId,
      name: shared.plan.name,
      description: shared.plan.description ?? undefined,
      status: "ACTIVE",
    },
  });

  for (const ex of shared.plan.exercises) {
    await prisma.workoutPlanExercise.create({
      data: {
        workoutPlanId: newPlan.id,
        exerciseId: ex.exercise.id,
        orderIndex: ex.orderIndex,
        sets: ex.sets ?? undefined,
        repsMin: ex.repsMin ?? undefined,
        repsMax: ex.repsMax ?? undefined,
        restSec: ex.restSec ?? undefined,
        notes: ex.notes ?? undefined,
      },
    });
  }

  return { planId: newPlan.id, planName: newPlan.name };
}
