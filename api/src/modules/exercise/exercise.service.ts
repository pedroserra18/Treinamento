import { MuscleGroup, Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { ListExercisesQuery, UpdateExerciseBody } from "./exercise.schema";
import { AppError } from "../../shared/errors/app-error";

type RequestUser = {
  userId?: string;
  userRole: "USER" | "COACH" | "ADMIN";
};

function buildScopeCondition(
  scope: ListExercisesQuery["scope"],
  user: RequestUser
): Record<string, unknown> {
  if (scope === "GLOBAL") {
    return { scope: "GLOBAL" };
  }

  if (scope === "PRIVATE") {
    if (!user.userId) {
      return { id: "__none__" };
    }

    return {
      scope: "PRIVATE",
      ownerUserId: user.userId
    };
  }

  if (!user.userId) {
    return { scope: "GLOBAL" };
  }

  if (user.userRole === "ADMIN") {
    return {};
  }

  return {
    OR: [
      { scope: "GLOBAL" },
      {
        scope: "PRIVATE",
        ownerUserId: user.userId
      }
    ]
  };
}

export async function listExercises(query: ListExercisesQuery, user: RequestUser) {
  const where = {
    isActive: true,
    ...buildScopeCondition(query.scope, user),
    ...(query.difficulty ? { difficulty: query.difficulty } : {}),
    ...(query.primaryMuscleGroup ? { primaryMuscleGroup: query.primaryMuscleGroup } : {}),
    ...(query.equipment ? { equipment: { equals: query.equipment, mode: "insensitive" } } : {}),
    ...(query.search
      ? {
          OR: [
            { name: { contains: query.search, mode: "insensitive" } },
            { slug: { contains: query.search, mode: "insensitive" } }
          ]
        }
      : {})
  };

  return prisma.exercise.findMany({
    where: where as Prisma.ExerciseWhereInput,
    orderBy: [{ scope: "asc" }, { name: "asc" }]
  });
}

export async function getExerciseById(exerciseId: string, user: RequestUser) {
  const where = {
    id: exerciseId,
    isActive: true,
    ...buildScopeCondition(undefined, user)
  };

  const exercise = await prisma.exercise.findFirst({
    where: where as Prisma.ExerciseWhereInput
  });

  if (!exercise) {
    throw new AppError("Exercise not found", {
      statusCode: 404,
      code: "EXERCISE_NOT_FOUND"
    });
  }

  return exercise;
}

export async function updateExercise(exerciseId: string, input: UpdateExerciseBody) {
  const existing = await prisma.exercise.findUnique({
    where: { id: exerciseId },
    select: { id: true }
  });

  if (!existing) {
    throw new AppError("Exercise not found", {
      statusCode: 404,
      code: "EXERCISE_NOT_FOUND"
    });
  }

  return prisma.exercise.update({
    where: { id: exerciseId },
    data: {
      secondaryMuscleGroup: input.secondaryMuscleGroup as unknown as
        | MuscleGroup
        | null
        | Prisma.NullableEnumMuscleGroupFieldUpdateOperationsInput
        | undefined
    }
  });
}
