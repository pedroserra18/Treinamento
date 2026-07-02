import { Prisma } from "@prisma/client";
import { logger } from "../../config/logger";
import { prisma } from "../../config/prisma";
import { AppError } from "../../shared/errors/app-error";
import { trackEvent } from "../../shared/services/event-log.service";
import { EventContext } from "../../shared/utils/event-context";
import { assertOwnedPlan, DIVISION_BY_DAYS } from "./workout-helpers";
import {
  CompleteWorkoutBody,
  CompleteWorkoutParams,
  CreateManualHistoryBody,
  ExploreWorkoutsQuery,
  HistorySessionParams,
  ListWorkoutHistoryQuery,
  StartWorkoutBody,
  UpdateWorkoutDurationBody
} from "./workout.schema";

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
  const cardio = payload.cardio ?? [];

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
        data: exercises.map((entry, index) => ({
          userId,
          workoutSessionId: params.sessionId,
          exerciseId: entry.exerciseId,
          executionOrder: index + 1,
          setNumber: entry.setNumber,
          reps: entry.reps,
          weightKg: entry.weightKg,
          durationSec: entry.durationSec,
          distanceMeters: entry.distanceMeters,
          perceivedExertion: entry.perceivedExertion,
          notes: entry.notes,
          // Keep per-set execution order stable for history rendering.
          completedAt: new Date(endedAt.getTime() + index)
        }))
      });
    }

    if (cardio.length > 0) {
      await tx.cardioEntry.createMany({
        data: cardio.map((entry) => ({
          userId,
          workoutSessionId: params.sessionId,
          type: entry.type,
          durationSec: entry.durationSec,
          distanceMeters: entry.distanceMeters,
          calories: entry.calories,
          notes: entry.notes
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
            name: true,
            exercises: {
              orderBy: [{ orderIndex: "asc" }],
              select: {
                exerciseId: true,
                orderIndex: true
              }
            }
          }
        },
        history: {
          // Use explicit execution order to avoid ambiguity from timestamps.
          orderBy: [{ executionOrder: "asc" }, { id: "asc" }],
          include: {
            exercise: {
              select: {
                id: true,
                name: true,
                primaryMuscleGroup: true
              }
            }
          }
        },
        cardioEntries: {
          orderBy: { createdAt: "asc" },
          select: { id: true, type: true, durationSec: true, distanceMeters: true, calories: true, notes: true }
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

// GET /workouts/history/:sessionId — returns a single completed session
// in the same shape that listWorkoutHistory produces (so the frontend can
// reuse all the existing rendering). Returns 404 if the session belongs to
// another user, since we never want to leak existence of a session id.
export async function getWorkoutSessionById(userId: string, sessionId: string) {
  const session = await prisma.workoutSession.findFirst({
    where: { id: sessionId, userId, status: "COMPLETED" },
    include: {
      workoutPlan: {
        select: {
          id: true,
          name: true,
          exercises: {
            orderBy: [{ orderIndex: "asc" }],
            select: { exerciseId: true, orderIndex: true }
          }
        }
      },
      history: {
        orderBy: [{ executionOrder: "asc" }, { id: "asc" }],
        include: {
          exercise: {
            select: { id: true, name: true, primaryMuscleGroup: true }
          }
        }
      },
      cardioEntries: {
        orderBy: { createdAt: "asc" },
        select: { id: true, type: true, durationSec: true, distanceMeters: true, calories: true, notes: true }
      }
    }
  });

  if (!session) {
    throw new AppError("Workout session not found", {
      statusCode: 404,
      code: "WORKOUT_SESSION_NOT_FOUND"
    });
  }

  return { ...session, historyEntriesCount: session.history.length };
}

function extractRirFromNotes(notes: string | null): number | null {
  if (!notes) {
    return null;
  }

  const match = notes.match(/RIR\s*:\s*(\d+)/i);
  if (!match) {
    return null;
  }

  const parsed = Number(match[1]);
  return Number.isFinite(parsed) ? parsed : null;
}

// Per-exercise all-time personal records. Returns the max weight ever
// lifted for each requested exercise — the active workout screen calls
// this once when entering the session to celebrate when the user beats
// it. groupBy keeps this an indexed aggregate at DB level so it stays
// cheap even with thousands of history rows per exercise.
export async function listExercisePersonalRecords(userId: string, exerciseIds: string[]) {
  const normalizedIds = Array.from(new Set(exerciseIds));
  if (normalizedIds.length === 0) {
    return { items: [] };
  }

  const rows = await prisma.workoutHistory.groupBy({
    by: ["exerciseId"],
    where: {
      userId,
      exerciseId: { in: normalizedIds },
      workoutSession: {
        userId,
        status: "COMPLETED"
      }
    },
    _max: {
      weightKg: true,
      reps: true
    }
  });

  const byExerciseId = new Map<string, { maxLoadKg: number | null; maxReps: number | null }>();
  for (const r of rows) {
    byExerciseId.set(r.exerciseId, {
      maxLoadKg: r._max.weightKg,
      maxReps: r._max.reps
    });
  }

  return {
    items: normalizedIds.map((exerciseId) => ({
      exerciseId,
      maxLoadKg: byExerciseId.get(exerciseId)?.maxLoadKg ?? null,
      maxReps: byExerciseId.get(exerciseId)?.maxReps ?? null
    }))
  };
}

export async function listLatestExerciseHistory(userId: string, exerciseIds: string[]) {
  const normalizedIds = Array.from(new Set(exerciseIds));

  const latestEntries = await prisma.workoutHistory.findMany({
    where: {
      exerciseId: {
        in: normalizedIds
      },
      workoutSession: {
        userId,
        status: "COMPLETED"
      }
    },
    orderBy: [{ completedAt: "desc" }, { setNumber: "asc" }],
    select: {
      exerciseId: true,
      workoutSessionId: true,
      completedAt: true,
      setNumber: true,
      reps: true,
      weightKg: true,
      durationSec: true,
      distanceMeters: true,
      perceivedExertion: true,
      notes: true
    }
  });

  const latestSessionByExercise = new Map<string, { workoutSessionId: string; completedAt: Date }>();

  for (const entry of latestEntries) {
    if (!latestSessionByExercise.has(entry.exerciseId)) {
      latestSessionByExercise.set(entry.exerciseId, {
        workoutSessionId: entry.workoutSessionId,
        completedAt: entry.completedAt
      });
    }
  }

  const latestByExercise = normalizedIds
    .map((exerciseId) => {
      const latest = latestSessionByExercise.get(exerciseId);
      if (!latest) {
        return null;
      }

      const sets = latestEntries
        .filter(
          (entry) =>
            entry.exerciseId === exerciseId && entry.workoutSessionId === latest.workoutSessionId
        )
        .map((entry) => ({
          setNumber: entry.setNumber,
          reps: entry.reps,
          weightKg: entry.weightKg,
          durationSec: entry.durationSec,
          distanceMeters: entry.distanceMeters,
          perceivedExertion: entry.perceivedExertion,
          rir: extractRirFromNotes(entry.notes)
        }))
        .sort((a, b) => a.setNumber - b.setNumber);

      return {
        exerciseId,
        workoutSessionId: latest.workoutSessionId,
        completedAt: latest.completedAt,
        sets
      };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item));

  return {
    items: latestByExercise
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

// Resumo + recordes de uma sessão concluída, para a imagem de compartilhamento
// (estilo Strava). Calcula volume/duração/séries e detecta PRs reais comparando
// o melhor set de cada exercício na sessão com o histórico anterior do usuário.
export async function getSessionHighlights(userId: string, params: HistorySessionParams) {
  const session = await prisma.workoutSession.findFirst({
    where: { id: params.sessionId, userId },
    select: { id: true, durationSec: true, endedAt: true, scheduledAt: true, status: true },
  });

  if (!session) {
    throw new AppError("Workout session not found", {
      statusCode: 404,
      code: "WORKOUT_SESSION_NOT_FOUND",
    });
  }

  const entries = await prisma.workoutHistory.findMany({
    where: { workoutSessionId: params.sessionId, userId },
    select: {
      exerciseId: true,
      weightKg: true,
      reps: true,
      exercise: { select: { name: true } },
    },
  });

  let volumeKg = 0;
  let totalSeries = 0;
  // Melhor set (maior carga) de cada exercício NESTA sessão.
  const sessionBest = new Map<string, { name: string; weightKg: number; reps: number }>();
  for (const e of entries) {
    totalSeries += 1;
    const w = e.weightKg ?? 0;
    const r = e.reps ?? 0;
    volumeKg += w * r;
    if (w > 0) {
      const cur = sessionBest.get(e.exerciseId);
      if (!cur || w > cur.weightKg) {
        sessionBest.set(e.exerciseId, { name: e.exercise.name, weightKg: w, reps: r });
      }
    }
  }

  // Máximo histórico anterior (excluindo esta sessão) por exercício — 1 query.
  const exerciseIds = Array.from(sessionBest.keys());
  const priorMaxByExercise = new Map<string, number>();
  if (exerciseIds.length > 0) {
    const grouped = await prisma.workoutHistory.groupBy({
      by: ["exerciseId"],
      where: {
        userId,
        exerciseId: { in: exerciseIds },
        workoutSessionId: { not: params.sessionId },
        weightKg: { not: null },
      },
      _max: { weightKg: true },
    });
    for (const g of grouped) {
      priorMaxByExercise.set(g.exerciseId, g._max.weightKg ?? 0);
    }
  }

  // PR = melhor set da sessão > máximo histórico anterior.
  const records: Array<{ exerciseName: string; weightKg: number; reps: number }> = [];
  for (const [exerciseId, best] of sessionBest.entries()) {
    const priorMax = priorMaxByExercise.get(exerciseId) ?? 0;
    if (best.weightKg > priorMax) {
      records.push({ exerciseName: best.name, weightKg: best.weightKg, reps: best.reps });
    }
  }
  records.sort((a, b) => b.weightKg - a.weightKg);

  // Destaque: maior carga da sessão (mesmo que não seja PR).
  let topSet: { exerciseName: string; weightKg: number; reps: number } | null = null;
  for (const best of sessionBest.values()) {
    if (!topSet || best.weightKg > topSet.weightKg) {
      topSet = { exerciseName: best.name, weightKg: best.weightKg, reps: best.reps };
    }
  }

  // Cardio da sessão — para os chips de cardio do share editor.
  const cardio = await prisma.cardioEntry.findMany({
    where: { workoutSessionId: params.sessionId, userId },
    orderBy: { createdAt: "asc" },
    select: { type: true, durationSec: true, distanceMeters: true, calories: true },
  });

  return {
    sessionId: session.id,
    volumeKg: Number(volumeKg.toFixed(1)),
    durationSec: session.durationSec ?? null,
    totalSeries,
    records,
    topSet,
    cardio,
  };
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
      OR: [
        { name: { contains: query.search, mode: "insensitive" } },
        { slug: { contains: query.search, mode: "insensitive" } }
      ]
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
