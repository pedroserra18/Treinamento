import { prisma } from "../../config/prisma";
import { AppError } from "../../shared/errors/app-error";
import {
  CreateBodyMeasurementBody,
  ExerciseParams,
  ListBodyMeasurementsQuery,
  PinnedExerciseBody
} from "./progress.schema";

const PINNED_EXERCISE_LIMIT = 5;

type ProgressDelegate = {
  pinnedExercise: {
    findMany: (args: unknown) => Promise<Array<Record<string, unknown>>>;
    findUnique: (args: unknown) => Promise<Record<string, unknown> | null>;
    count: (args: unknown) => Promise<number>;
    create: (args: unknown) => Promise<Record<string, unknown>>;
    deleteMany: (args: unknown) => Promise<{ count: number }>;
  };
  bodyMeasurement: {
    create: (args: unknown) => Promise<Record<string, unknown>>;
    count: (args: unknown) => Promise<number>;
    findMany: (args: unknown) => Promise<Array<Record<string, unknown>>>;
  };
};

const progressPrisma = prisma as typeof prisma & ProgressDelegate;

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

export async function listPinnedExercises(userId: string) {
  return progressPrisma.pinnedExercise.findMany({
    where: { userId },
    orderBy: [{ createdAt: "asc" }],
    include: {
      exercise: {
        select: {
          id: true,
          name: true,
          primaryMuscleGroup: true,
          difficulty: true,
          equipment: true,
          thumbnailUrl: true,
          videoUrl: true,
          isBodyweight: true,
          allowsExtraLoad: true
        }
      }
    }
  });
}

export async function addPinnedExercise(userId: string, payload: PinnedExerciseBody) {
  await assertExerciseAvailableToUser(payload.exerciseId, userId);

  const [existing, count] = await Promise.all([
    progressPrisma.pinnedExercise.findUnique({
      where: {
        userId_exerciseId: {
          userId,
          exerciseId: payload.exerciseId
        }
      },
      select: { id: true }
    }),
    progressPrisma.pinnedExercise.count({ where: { userId } })
  ]);

  if (existing) {
    throw new AppError("Exercise already pinned", {
      statusCode: 409,
      code: "PINNED_EXERCISE_DUPLICATE"
    });
  }

  if (count >= PINNED_EXERCISE_LIMIT) {
    throw new AppError("Pinned exercise limit reached", {
      statusCode: 400,
      code: "PINNED_EXERCISE_LIMIT_REACHED",
      details: {
        limit: PINNED_EXERCISE_LIMIT
      }
    });
  }

  return progressPrisma.pinnedExercise.create({
    data: {
      userId,
      exerciseId: payload.exerciseId
    },
    include: {
      exercise: {
        select: {
          id: true,
          name: true,
          primaryMuscleGroup: true,
          difficulty: true,
          equipment: true,
          thumbnailUrl: true,
          videoUrl: true,
          isBodyweight: true,
          allowsExtraLoad: true
        }
      }
    }
  });
}

export async function removePinnedExercise(userId: string, params: ExerciseParams) {
  const deleted = await progressPrisma.pinnedExercise.deleteMany({
    where: {
      userId,
      exerciseId: params.exerciseId
    }
  });

  if (deleted.count === 0) {
    throw new AppError("Pinned exercise not found", {
      statusCode: 404,
      code: "PINNED_EXERCISE_NOT_FOUND"
    });
  }

  return { success: true };
}

export async function listExerciseProgress(userId: string) {
  const pinned = (await progressPrisma.pinnedExercise.findMany({
    where: { userId },
    orderBy: [{ createdAt: "asc" }],
    include: {
      exercise: {
        select: {
          id: true,
          name: true,
          primaryMuscleGroup: true,
          difficulty: true,
          equipment: true,
          thumbnailUrl: true,
          videoUrl: true,
          isBodyweight: true,
          allowsExtraLoad: true
        }
      }
    }
  })) as Array<{
    exerciseId: string;
    createdAt: Date;
    exercise: {
      id: string;
      name: string;
      primaryMuscleGroup: string;
      difficulty: string;
      equipment: string;
      thumbnailUrl: string | null;
      videoUrl: string | null;
      isBodyweight: boolean;
      allowsExtraLoad: boolean;
    };
  }>;

  const pinnedExerciseIds = pinned.map((item) => item.exerciseId);

  if (pinnedExerciseIds.length === 0) {
    return {
      maxPinned: PINNED_EXERCISE_LIMIT,
      items: []
    };
  }

  const history = await prisma.workoutHistory.findMany({
    where: {
      userId,
      exerciseId: { in: pinnedExerciseIds },
      workoutSession: {
        userId,
        status: "COMPLETED"
      }
    },
    orderBy: [{ completedAt: "asc" }, { executionOrder: "asc" }],
    select: {
      exerciseId: true,
      workoutSessionId: true,
      setNumber: true,
      reps: true,
      weightKg: true,
      completedAt: true,
      workoutSession: {
        select: {
          id: true,
          endedAt: true,
          startedAt: true,
          scheduledAt: true
        }
      }
    }
  });

  const byExercise = new Map<
    string,
    Map<
      string,
      {
        workoutSessionId: string;
        completedAt: Date;
        maxLoadKg: number | null;
        maxReps: number | null;
        totalVolumeKg: number;
      }
    >
  >();

  history.forEach((entry) => {
    const exerciseMap = byExercise.get(entry.exerciseId) ?? new Map();
    const current =
      exerciseMap.get(entry.workoutSessionId) ??
      {
        workoutSessionId: entry.workoutSessionId,
        completedAt:
          entry.workoutSession.endedAt ??
          entry.workoutSession.startedAt ??
          entry.workoutSession.scheduledAt ??
          entry.completedAt,
        maxLoadKg: null,
        maxReps: null,
        totalVolumeKg: 0
      };

    if (entry.weightKg != null && entry.weightKg > 0) {
      current.maxLoadKg = current.maxLoadKg == null ? entry.weightKg : Math.max(current.maxLoadKg, entry.weightKg);
    }

    if (entry.reps != null && entry.reps > 0) {
      current.maxReps = current.maxReps == null ? entry.reps : Math.max(current.maxReps, entry.reps);
    }

    if (entry.weightKg != null && entry.reps != null && entry.weightKg > 0 && entry.reps > 0) {
      current.totalVolumeKg += entry.weightKg * entry.reps;
    }

    exerciseMap.set(entry.workoutSessionId, current);
    byExercise.set(entry.exerciseId, exerciseMap);
  });

  return {
    maxPinned: PINNED_EXERCISE_LIMIT,
    items: pinned.map((item) => {
      const sessions = Array.from(byExercise.get(item.exerciseId)?.values() ?? [])
        .sort((a, b) => a.completedAt.getTime() - b.completedAt.getTime())
        .map((session) => ({
          workoutSessionId: session.workoutSessionId,
          completedAt: session.completedAt,
          maxLoadKg: session.maxLoadKg,
          maxReps: session.maxReps,
          totalVolumeKg: Number(session.totalVolumeKg.toFixed(2))
        }));

      return {
        pinnedAt: item.createdAt,
        exercise: item.exercise,
        sessions
      };
    })
  };
}

export async function createBodyMeasurement(userId: string, payload: CreateBodyMeasurementBody) {
  return progressPrisma.bodyMeasurement.create({
    data: {
      userId,
      date: payload.date,
      photoUrl: payload.photoUrl,
      weight: payload.weight,
      chest: payload.chest,
      shoulders: payload.shoulders,
      arms: payload.arms,
      forearms: payload.forearms,
      waist: payload.waist,
      hips: payload.hips,
      thighs: payload.thighs,
      calves: payload.calves,
      neck: payload.neck,
      bmi: payload.bmi,
      bodyFatPercentage: payload.bodyFatPercentage
    }
  });
}

export async function listBodyMeasurements(userId: string, query: ListBodyMeasurementsQuery) {
  const skip = (query.page - 1) * query.pageSize;

  const [total, items] = await Promise.all([
    progressPrisma.bodyMeasurement.count({ where: { userId } }),
    progressPrisma.bodyMeasurement.findMany({
      where: { userId },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      skip,
      take: query.pageSize
    })
  ]);

  return {
    page: query.page,
    pageSize: query.pageSize,
    total,
    items
  };
}
