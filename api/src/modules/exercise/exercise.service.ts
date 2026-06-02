import { MuscleGroup, Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { CreateExerciseBody, ListExercisesQuery, UpdateExerciseBody } from "./exercise.schema";
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

  const rows = await prisma.exercise.findMany({
    where: where as Prisma.ExerciseWhereInput,
    orderBy: [{ scope: "asc" }, { name: "asc" }]
  });

  return rows.sort((a, b) => {
    if (a.scope !== b.scope) return a.scope.localeCompare(b.scope);
    const g = a.primaryMuscleGroup.localeCompare(b.primaryMuscleGroup);
    if (g !== 0) return g;
    return a.name.localeCompare(b.name, "pt-BR");
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

// Cria um exercício PRIVATE do próprio usuário. O service força
// scope=PRIVATE + ownerUserId pra o caller atual — o schema do body
// não aceita esses campos pra evitar elevation-of-privilege via API.
// Slug é derivado do nome + sufixo curto pra garantir unicidade sem
// expor o cuid no URL.
export async function createExercise(input: CreateExerciseBody, user: RequestUser) {
  if (!user.userId) {
    throw new AppError("Não autorizado", { statusCode: 401, code: "UNAUTHORIZED" });
  }

  const baseSlug = input.name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  const suffix = Math.random().toString(36).slice(2, 8);
  const slug = `${baseSlug}-${suffix}`;

  const exercise = await prisma.exercise.create({
    data: {
      slug,
      name: input.name,
      scope: "PRIVATE",
      ownerUserId: user.userId,
      equipment: input.equipment,
      primaryMuscleGroup: input.primaryMuscleGroup,
      secondaryMuscleGroup: input.secondaryMuscleGroup ?? null,
      difficulty: input.difficulty,
      trackingType: input.trackingType,
      isBodyweight: input.isBodyweight,
      allowsExtraLoad: input.allowsExtraLoad,
      isCompound: input.isCompound,
      instructions: input.instructions ?? null,
      thumbnailUrl: input.thumbnailUrl ?? null
    }
  });

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
