import { MuscleGroup, Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { CreateExerciseBody, ListExercisesQuery, UpdateExerciseBody } from "./exercise.schema";
import { AppError } from "../../shared/errors/app-error";
import { assertWithinLimit, PLAN_LIMITS } from "../../shared/plan-limits";
import { resolveExerciseSearchTerm } from "./exercise-search-vocabulary";

type RequestUser = {
  userId?: string;
  userRole: "USER" | "COACH" | "ADMIN";
};

// Limite de exercícios PRIVATE (criados pelo usuário) no plano FREE.
// Quando o usuário tem 5 exercícios ativos próprios, o create retorna
// 402 Payment Required com code EXERCISE_LIMIT_REACHED — o frontend
// exibe um InfoDialog explicando o plano Pro futuro.
// Mantemos a constante exportada por compat (alguns lugares importavam
// pra mostrar o limite na UI). Valor agora vem do PLAN_LIMITS centralizado
// — mudança aqui propaga pra todos os checks.
export const MAX_PRIVATE_EXERCISES_FREE = PLAN_LIMITS.FREE.customExercises;

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
  // Busca textual estilo apps profissionais (Hevy/Strong/Fitbod):
  //
  // 1) Match em name e slug (já existia)
  // 2) Match em equipment ("barra", "halter", "polia"...)
  // 3) Match em primaryMuscleGroup + secondaryMuscleGroup quando o termo
  //    bate com sinônimo PT-BR no vocabulário ("biceps" → BICEPS, "peito"
  //    → CHEST, "perna" → LEGS+QUADS+HAMSTRINGS+CALVES, ...). Acentos e
  //    plurais são normalizados — "bíceps", "biceps", "bicep" e "bi"
  //    todos retornam a mesma lista.
  //
  // Como o Postgres `contains insensitive` já lida com case mas NÃO com
  // acentos, passamos o termo normalizado pra busca textual também — assim
  // 'biceps' bate em exercício chamado 'Rosca Bíceps' mesmo a fonte tendo
  // acento.
  const searchTerm = query.search?.trim() ?? "";
  const searchOr: Prisma.ExerciseWhereInput[] = [];
  if (searchTerm) {
    const { normalizedText, muscleGroups } = resolveExerciseSearchTerm(searchTerm);
    // Busca textual: nome, slug e equipment. Usamos o termo bruto (pra
    // preservar 'Bíceps' literal quando user digita com acento) E o
    // normalizado (pra cobrir 'biceps' sem acento batendo em 'Bíceps').
    searchOr.push(
      { name: { contains: searchTerm, mode: "insensitive" } },
      { slug: { contains: searchTerm, mode: "insensitive" } },
      { equipment: { contains: searchTerm, mode: "insensitive" } }
    );
    if (normalizedText && normalizedText !== searchTerm.toLowerCase()) {
      searchOr.push(
        { name: { contains: normalizedText, mode: "insensitive" } },
        { slug: { contains: normalizedText, mode: "insensitive" } }
      );
    }
    // Match por enum quando o termo é apelido de grupo muscular.
    if (muscleGroups.length > 0) {
      searchOr.push(
        { primaryMuscleGroup: { in: muscleGroups } },
        { secondaryMuscleGroup: { in: muscleGroups } }
      );
    }
  }

  const where = {
    isActive: true,
    ...buildScopeCondition(query.scope, user),
    ...(query.difficulty ? { difficulty: query.difficulty } : {}),
    ...(query.primaryMuscleGroup ? { primaryMuscleGroup: query.primaryMuscleGroup } : {}),
    ...(query.equipment ? { equipment: { equals: query.equipment, mode: "insensitive" } } : {}),
    ...(searchOr.length > 0 ? { OR: searchOr } : {})
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

  // Gate via helper centralizado — emite PLAN_LIMIT_REACHED (402) que o
  // frontend captura no PlanLimitDialogProvider e mostra o dialog padrão.
  const activeCount = await prisma.exercise.count({
    where: {
      scope: "PRIVATE",
      ownerUserId: user.userId,
      isActive: true
    }
  });
  await assertWithinLimit(user.userId, "customExercises", activeCount);

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

// Soft-delete: zera isActive em vez de remover. WorkoutPlanExercise e
// WorkoutSession têm onDelete: Restrict apontando pra Exercise — apagar
// de verdade quebraria histórico de planos e sessões antigas. O scope
// PRIVATE + ownerUserId garante que o usuário só apaga seus próprios.
export async function deletePrivateExercise(exerciseId: string, user: RequestUser) {
  if (!user.userId) {
    throw new AppError("Não autorizado", { statusCode: 401, code: "UNAUTHORIZED" });
  }

  const exercise = await prisma.exercise.findUnique({
    where: { id: exerciseId },
    select: { id: true, scope: true, ownerUserId: true, isActive: true }
  });

  if (!exercise || !exercise.isActive) {
    throw new AppError("Exercise not found", {
      statusCode: 404,
      code: "EXERCISE_NOT_FOUND"
    });
  }

  if (exercise.scope !== "PRIVATE" || exercise.ownerUserId !== user.userId) {
    throw new AppError("Você só pode apagar exercícios criados por você.", {
      statusCode: 403,
      code: "FORBIDDEN"
    });
  }

  await prisma.exercise.update({
    where: { id: exerciseId },
    data: { isActive: false }
  });
}

// Estatísticas usadas pelo CreateExerciseModal pra renderizar o contador
// "X/5 criados". Retorna o estado atual + plano (FREE hoje, PRO no futuro).
export async function getMyExerciseStats(user: RequestUser) {
  if (!user.userId) {
    throw new AppError("Não autorizado", { statusCode: 401, code: "UNAUTHORIZED" });
  }

  const [created, userPlan] = await Promise.all([
    prisma.exercise.count({
      where: {
        scope: "PRIVATE",
        ownerUserId: user.userId,
        isActive: true
      }
    }),
    prisma.user.findUnique({
      where: { id: user.userId },
      select: { plan: true, role: true }
    })
  ]);

  // ADMIN herda PRO; PRO já é PRO; FREE é FREE.
  const effectivePlan: "FREE" | "PRO" =
    userPlan?.role === "ADMIN" ? "PRO" : userPlan?.plan ?? "FREE";
  const rawLimit = PLAN_LIMITS[effectivePlan].customExercises;
  // POSITIVE_INFINITY → null no payload pra UI interpretar como ilimitado.
  const limit = Number.isFinite(rawLimit) ? rawLimit : null;

  return {
    created,
    limit,
    plan: effectivePlan
  };
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
