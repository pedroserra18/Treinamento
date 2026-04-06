import { Prisma } from "@prisma/client";

import {
  CompleteWorkoutBody,
  CompleteWorkoutParams,
  ExploreWorkoutsQuery,
  ListWorkoutHistoryQuery,
  StartWorkoutBody
} from "./workout.schema";
import { prisma } from "../../config/prisma";
import { AppError } from "../../shared/errors/app-error";
import { trackEvent } from "../../shared/services/event-log.service";
import { getWorkoutRecommendationsForUser } from "../recommendation/recommendation.service";

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
