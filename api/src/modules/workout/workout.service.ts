import { Prisma } from "@prisma/client";
import { logger } from "../../config/logger";
import { prisma } from "../../config/prisma";
import { AppError } from "../../shared/errors/app-error";
import { trackEvent } from "../../shared/services/event-log.service";
import { getWorkoutRecommendationsForUser } from "../recommendation/recommendation.service";
import {
  AddPlanExerciseBody,
  CreateManualHistoryBody,
  CreateWorkoutPlanBody,
  CompleteWorkoutBody,
  CompleteWorkoutParams,
  ExploreWorkoutsQuery,
  HistorySessionParams,
  ListWorkoutHistoryQuery,
  PlanExerciseParams,
  RecommendationTemplateQuery,
  ReorderPlanExercisesBody,
  SearchExercisesQuery,
  StartWorkoutBody
  ,
  UpdateWorkoutPlanBody,
  UpdatePlanExerciseBody,
  UpdateWorkoutDurationBody,
  WorkoutPlanParams
} from "./workout.schema";

const DIVISION_BY_DAYS: Record<number, string[]> = {
  1: ["Full Body", "Upper Lower"],
  2: ["Full Body", "Upper Lower"],
  3: ["Push Pull Legs", "Full Body"],
  4: ["Upper Lower 2x", "Torso Legs"],
  5: ["Bro Split", "Push Pull Legs"],
  6: ["Push Pull Legs 2x", "Upper Lower 2x"],
  7: ["Push Pull Legs 2x", "Bro Split"]
};

type EventContext = {
  requestId?: string;
  ipAddress?: string;
  userAgent?: string;
};

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

async function assertOwnedPlan(planId: string, userId: string): Promise<void> {
  const plan = await prisma.workoutPlan.findFirst({
    where: {
      id: planId,
      userId,
      status: {
        in: ["ACTIVE", "DRAFT"]
      }
    },
    select: { id: true }
  });

  if (!plan) {
    throw new AppError("Workout plan not found for this user", {
      statusCode: 404,
      code: "WORKOUT_PLAN_NOT_FOUND"
    });
  }
}

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
      archivedAt: null
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
                isBodyweight: true,
                allowsExtraLoad: true
            }
          }
        }
      }
    }
  });

  return plans;
}

export async function createWorkoutPlan(userId: string, payload: CreateWorkoutPlanBody) {
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
            isBodyweight: true,
            allowsExtraLoad: true
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
          isBodyweight: true,
          allowsExtraLoad: true
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
  return prisma.exercise.findMany({
    where: {
      isActive: true,
      OR: [{ scope: "GLOBAL" }, { scope: "PRIVATE", ownerUserId: userId }],
      ...(query.primaryMuscleGroup ? { primaryMuscleGroup: query.primaryMuscleGroup } : {}),
      ...(query.q
        ? {
            name: {
              contains: query.q
            }
          }
        : {})
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
      allowsExtraLoad: true
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

export async function startWorkoutSession(
  userId: string,
  payload: StartWorkoutBody,
  context: EventContext
) {
  if (payload.workoutPlanId) {
    await assertOwnedPlan(payload.workoutPlanId, userId);
  }

  const scheduledAt = payload.scheduledAt ?? new Date();
  const startedAt = new Date();

  const session = await prisma.workoutSession.create({
    data: {
      userId,
      workoutPlanId: payload.workoutPlanId,
      status: "IN_PROGRESS",
      scheduledAt,
      startedAt,
      notes: payload.notes
    }
  });

  await trackEvent({
    userId,
    category: "WORKOUT",
    action: "workout_started",
    resourceType: "workout_session",
    resourceId: session.id,
    requestId: context.requestId,
    ipAddress: context.ipAddress,
    userAgent: context.userAgent,
    metadata: {
      workoutPlanId: payload.workoutPlanId ?? null,
      scheduledAt: scheduledAt.toISOString()
    }
  });

  logger.info("workout_started", {
    requestId: context.requestId,
    userId,
    workoutSessionId: session.id,
    workoutPlanId: payload.workoutPlanId ?? null,
    startedAt: startedAt.toISOString(),
    ipAddress: context.ipAddress,
    userAgent: context.userAgent
  });

  return session;
}

export async function completeWorkoutSession(
  userId: string,
  params: CompleteWorkoutParams,
  payload: CompleteWorkoutBody,
  context: EventContext
) {
  const session = await prisma.workoutSession.findFirst({
    where: {
      id: params.sessionId,
      userId
    },
    select: {
      id: true,
      status: true,
      startedAt: true
    }
  });

  if (!session) {
    throw new AppError("Workout session not found", {
      statusCode: 404,
      code: "WORKOUT_SESSION_NOT_FOUND"
    });
  }

  if (session.status === "COMPLETED") {
    throw new AppError("Workout session already completed", {
      statusCode: 409,
      code: "WORKOUT_ALREADY_COMPLETED"
    });
  }

  if (session.status === "CANCELED") {
    throw new AppError("Canceled session cannot be completed", {
      statusCode: 409,
      code: "WORKOUT_SESSION_CANCELED"
    });
  }

  const endedAt = new Date();
  const durationSec =
    payload.durationSec ??
    (session.startedAt
      ? Math.max(Math.floor((endedAt.getTime() - session.startedAt.getTime()) / 1000), 60)
      : undefined);

  const exercises = payload.exercises ?? [];

  const completed = await prisma.$transaction(async (tx) => {
    if (exercises.length > 0) {
      const exerciseIds = Array.from(new Set(exercises.map((entry) => entry.exerciseId)));
      const existing = await tx.exercise.findMany({
        where: {
          id: {
            in: exerciseIds
          },
          isActive: true
        },
        select: { id: true }
      });

      const existingIds = new Set(existing.map((exercise) => exercise.id));
      const missing = exerciseIds.filter((id) => !existingIds.has(id));
      if (missing.length > 0) {
        throw new AppError("One or more exercises were not found", {
          statusCode: 400,
          code: "EXERCISE_NOT_FOUND",
          details: {
            missingExerciseIds: missing
          }
        });
      }
    }

    const updatedSession = await tx.workoutSession.update({
      where: { id: params.sessionId },
      data: {
        status: "COMPLETED",
        endedAt,
        durationSec,
        caloriesBurned: payload.caloriesBurned,
        notes: payload.notes
      }
    });

    if (exercises.length > 0) {
      await tx.workoutHistory.createMany({
        data: exercises.map((entry) => ({
          userId,
          workoutSessionId: params.sessionId,
          exerciseId: entry.exerciseId,
          setNumber: entry.setNumber,
          reps: entry.reps,
          weightKg: entry.weightKg,
          durationSec: entry.durationSec,
          distanceMeters: entry.distanceMeters,
          perceivedExertion: entry.perceivedExertion,
          notes: entry.notes,
          completedAt: endedAt
        }))
      });
    }

    return updatedSession;
  });

  await trackEvent({
    userId,
    category: "WORKOUT",
    action: "workout_completed",
    resourceType: "workout_session",
    resourceId: completed.id,
    requestId: context.requestId,
    ipAddress: context.ipAddress,
    userAgent: context.userAgent,
    metadata: {
      durationSec: completed.durationSec,
      caloriesBurned: completed.caloriesBurned,
      loggedSets: exercises.length
    }
  });

  logger.info("workout_completed", {
    requestId: context.requestId,
    userId,
    workoutSessionId: completed.id,
    durationSec: completed.durationSec,
    caloriesBurned: completed.caloriesBurned,
    loggedSets: exercises.length,
    ipAddress: context.ipAddress,
    userAgent: context.userAgent
  });

  logger.info("usage_time_recorded", {
    requestId: context.requestId,
    userId,
    source: "workout_completion",
    durationSec: completed.durationSec,
    workoutSessionId: completed.id
  });

  return completed;
}

export async function listWorkoutHistory(userId: string, query: ListWorkoutHistoryQuery) {
  const skip = (query.page - 1) * query.pageSize;

  const where: Prisma.WorkoutSessionWhereInput = {
    userId,
    status: "COMPLETED"
  };

  const [total, sessions] = await Promise.all([
    prisma.workoutSession.count({ where }),
    prisma.workoutSession.findMany({
      where,
      orderBy: [{ endedAt: "desc" }, { createdAt: "desc" }],
      skip,
      take: query.pageSize,
      include: {
        workoutPlan: {
          select: {
            id: true,
            name: true
          }
        },
        history: {
          orderBy: [{ completedAt: "desc" }, { setNumber: "asc" }],
          include: {
            exercise: {
              select: {
                id: true,
                name: true,
                primaryMuscleGroup: true
              }
            }
          }
        }
      }
    })
  ]);

  return {
    page: query.page,
    pageSize: query.pageSize,
    total,
    items: sessions.map((session) => ({
      ...session,
      historyEntriesCount: session.history.length
    }))
  };
}

export async function updateCompletedWorkoutDuration(
  userId: string,
  params: HistorySessionParams,
  payload: UpdateWorkoutDurationBody
) {
  const session = await prisma.workoutSession.findFirst({
    where: {
      id: params.sessionId,
      userId,
      status: "COMPLETED"
    },
    select: {
      id: true,
      durationSec: true
    }
  });

  if (!session) {
    throw new AppError("Workout history entry not found", {
      statusCode: 404,
      code: "WORKOUT_HISTORY_NOT_FOUND"
    });
  }

  const updated = await prisma.workoutSession.update({
    where: { id: params.sessionId },
    data: {
      durationSec: payload.durationSec
    }
  });

  logger.info("usage_time_recorded", {
    userId,
    source: "workout_duration_update",
    workoutSessionId: updated.id,
    previousDurationSec: session.durationSec,
    durationSec: updated.durationSec
  });

  return updated;
}

export async function createManualWorkoutHistory(userId: string, payload: CreateManualHistoryBody) {
  if (payload.workoutPlanId) {
    await assertOwnedPlan(payload.workoutPlanId, userId);
  }

  const endedAt = payload.performedAt ?? new Date();
  const startedAt = new Date(endedAt.getTime() - payload.durationSec * 1000);

  return prisma.workoutSession.create({
    data: {
      userId,
      workoutPlanId: payload.workoutPlanId,
      status: "COMPLETED",
      scheduledAt: endedAt,
      startedAt,
      endedAt,
      durationSec: payload.durationSec,
      notes: payload.title ? `${payload.title} | ${payload.notes ?? ""}`.trim() : payload.notes
    }
  });
}

export async function exploreWorkouts(userId: string, query: ExploreWorkoutsQuery) {
  const skip = (query.page - 1) * query.pageSize;

  const andClauses: Prisma.ExerciseWhereInput[] = [
    { isActive: true },
    { OR: [{ scope: "GLOBAL" }, { scope: "PRIVATE", ownerUserId: userId }] }
  ];

  if (query.primaryMuscleGroup) {
    andClauses.push({ primaryMuscleGroup: query.primaryMuscleGroup });
  }

  if (query.difficulty) {
    andClauses.push({ difficulty: query.difficulty });
  }

  if (query.search) {
    andClauses.push({
      OR: [{ name: { contains: query.search } }, { slug: { contains: query.search } }]
    });
  }

  const where: Prisma.ExerciseWhereInput = { AND: andClauses };

  try {
    const [totalExercises, exercises, planCount] = await Promise.all([
      prisma.exercise.count({ where }),
      prisma.exercise.findMany({
        where,
        orderBy: [{ scope: "asc" }, { name: "asc" }],
        skip,
        take: query.pageSize
      }),
      prisma.workoutPlan.count({
        where: {
          userId,
          status: {
            in: ["ACTIVE", "DRAFT"]
          }
        }
      })
    ]);

    return {
      divisionsByDays: DIVISION_BY_DAYS,
      activePlansCount: planCount,
      catalog: {
        page: query.page,
        pageSize: query.pageSize,
        total: totalExercises,
        items: exercises
      }
    };
  } catch (error) {
    throw new AppError("Failed to explore workouts", {
      statusCode: 500,
      code: "WORKOUT_EXPLORE_FAILED",
      details: error instanceof Error ? error.message : "unknown_error"
    });
  }
}
