import { prisma } from "../../config/prisma";
import { AppError } from "../../shared/errors/app-error";
import { trackEvent } from "../../shared/services/event-log.service";
import { EventContext } from "../../shared/utils/event-context";
import { OnboardingCompleteBody, ProfileUpdateBody } from "./auth.schema";
import { verifyRegisterEmailCode } from "./registration-verification.service";
import { SafeUser, toSafeUser } from "./auth-safe-user";
import { logoutSession } from "./auth.service";

// experienceLevel e primaryGoal vão no retorno pra que o quiz pule essas
// perguntas (já existem no perfil) e pré-preencha goal.
export async function getProfileDefaults(userId: string) {
  const [user, latestMeasurement] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        sex: true,
        birthDate: true,
        heightCm: true,
        weightKg: true,
        experienceLevel: true,
        primaryGoal: true
      }
    }),
    prisma.bodyMeasurement.findFirst({ where: { userId }, orderBy: { date: "desc" }, select: { weight: true } }),
  ]);

  const weightKg = latestMeasurement?.weight ?? user?.weightKg ?? null;
  const heightCm = user?.heightCm ?? null;
  const sex = user?.sex ?? null;
  const birthDate = user?.birthDate ?? null;
  const experienceLevel = user?.experienceLevel ?? null;
  const primaryGoal = user?.primaryGoal ?? null;

  let age: number | null = null;
  if (birthDate) {
    const now = new Date();
    age = now.getFullYear() - birthDate.getFullYear();
    const monthDiff = now.getMonth() - birthDate.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < birthDate.getDate())) {
      age -= 1;
    }
  }

  return {
    weightKg,
    heightCm,
    gender: sex === "MALE" ? "Masculino" : sex === "FEMALE" ? "Feminino" : null,
    birthDate: birthDate ? birthDate.toISOString().slice(0, 10) : null, // YYYY-MM-DD
    age,
    experienceLevel,
    primaryGoal,
  };
}

export async function updateBirthDate(userId: string, birthDate: string | null): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: { birthDate: birthDate ? new Date(birthDate) : null },
  });
}

// Salva o gênero (campo User.sex) a partir do rótulo PT usado no quiz, pra que
// a pergunta não seja feita de novo. Espelha o mapeamento de getProfileDefaults.
export async function updateGender(userId: string, gender: "Masculino" | "Feminino"): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: { sex: gender === "Masculino" ? "MALE" : "FEMALE" },
  });
}

// Indica se a conta tem o login Google vinculado e ativo (não revogado).
export async function getGoogleLinkStatus(userId: string): Promise<{ linked: boolean }> {
  const provider = await prisma.authProvider.findFirst({
    where: { userId, provider: "GOOGLE", revokedAt: null },
    select: { id: true },
  });
  return { linked: Boolean(provider) };
}

// Registra aceite de uma nova versão dos termos/privacidade pelo user logado.
// Chamado pelo TermsAcceptanceGate no frontend quando detecta que
// user.acceptedTermsVersion < CURRENT_TERMS_VERSION. Retorna o user atualizado
// pra o cliente refrescar o estado sem fazer outra round-trip.
export async function acceptTermsForUser(
  userId: string,
  version: string,
  context: EventContext = {}
): Promise<SafeUser> {
  const updated = await prisma.user.update({
    where: { id: userId },
    data: {
      acceptedTermsAt: new Date(),
      acceptedTermsVersion: version
    },
    select: {
      id: true,
      name: true,
      handle: true,
      email: true,
      role: true,
      sex: true,
      availableDaysPerWeek: true,
      birthDate: true,
      heightCm: true,
      weightKg: true,
      experienceLevel: true,
      primaryGoal: true,
      plan: true,
      planExpiresAt: true,
      acceptedTermsAt: true,
      acceptedTermsVersion: true,
      onboardingCompletedAt: true,
      isPrivate: true, showFollowLists: true, avatarUrl: true
    }
  });

  await trackEvent({
    userId,
    category: "AUTH",
    action: "terms_accepted",
    resourceType: "user",
    resourceId: userId,
    requestId: context.requestId,
    ipAddress: context.ipAddress,
    userAgent: context.userAgent,
    metadata: { version }
  });

  return toSafeUser(updated);
}

export async function getAuthenticatedProfile(userId: string): Promise<SafeUser> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      handle: true,
      email: true,
      role: true,
      sex: true,
      availableDaysPerWeek: true,
      birthDate: true,
      heightCm: true,
      weightKg: true,
      experienceLevel: true,
      primaryGoal: true,
      plan: true,
      planExpiresAt: true,
      acceptedTermsAt: true,
      acceptedTermsVersion: true,
      onboardingCompletedAt: true,
      isPrivate: true, showFollowLists: true, avatarUrl: true,
      isDeleted: true,
      status: true
    }
  });

  if (!user || user.isDeleted || user.status !== "ACTIVE") {
    throw new AppError("User not found", {
      statusCode: 404,
      code: "USER_NOT_FOUND"
    });
  }

  return toSafeUser(user);
}

export async function getOnboardingStatus(userId: string): Promise<{
  onboardingCompleted: boolean;
  sex: "MALE" | "FEMALE" | "OTHER";
  availableDaysPerWeek: number | null;
}> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      sex: true,
      availableDaysPerWeek: true,
      birthDate: true,
      heightCm: true,
      weightKg: true,
      experienceLevel: true,
      primaryGoal: true,
      plan: true,
      planExpiresAt: true,
      acceptedTermsAt: true,
      acceptedTermsVersion: true,
      onboardingCompletedAt: true,
      isDeleted: true,
      status: true
    }
  });

  if (!user || user.isDeleted || user.status !== "ACTIVE") {
    throw new AppError("User not found", {
      statusCode: 404,
      code: "USER_NOT_FOUND"
    });
  }

  return {
    onboardingCompleted: Boolean(user.onboardingCompletedAt && user.availableDaysPerWeek),
    sex: user.sex,
    availableDaysPerWeek: user.availableDaysPerWeek
  };
}

export async function updatePrivacy(
  userId: string,
  fields: { isPrivate?: boolean; showFollowLists?: boolean }
): Promise<{ isPrivate: boolean; showFollowLists: boolean; downgradedPosts: number }> {
  const before = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { isPrivate: true },
  });

  await prisma.user.update({ where: { id: userId }, data: fields });

  let downgradedPosts = 0;
  if (fields.isPrivate === true && before.isPrivate === false) {
    const result = await prisma.workoutPost.updateMany({
      where: { userId, privacy: "PUBLIC", removedAt: null },
      data: { privacy: "FRIENDS" },
    });
    downgradedPosts = result.count;
  }

  const updated = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { isPrivate: true, showFollowLists: true },
  });
  return { ...updated, downgradedPosts };
}

export async function updateAvatar(userId: string, avatarUrl: string | null): Promise<SafeUser> {
  const updated = await prisma.user.update({
    where: { id: userId },
    data: { avatarUrl },
    select: {
      id: true, name: true, handle: true, email: true, role: true,
      sex: true, availableDaysPerWeek: true, birthDate: true, heightCm: true, weightKg: true, experienceLevel: true, primaryGoal: true, plan: true, planExpiresAt: true, acceptedTermsAt: true, acceptedTermsVersion: true, onboardingCompletedAt: true, isPrivate: true, showFollowLists: true, avatarUrl: true,
    },
  });
  return toSafeUser(updated);
}

// Lets a logged-in user change their public @handle. Throws 409 on collision
// instead of silently appending a suffix — the user picked it deliberately.
export async function updateHandle(userId: string, newHandle: string): Promise<SafeUser> {
  const taken = await prisma.user.findUnique({
    where: { handle: newHandle },
    select: { id: true },
  });
  if (taken && taken.id !== userId) {
    throw new AppError("Handle already in use", {
      statusCode: 409,
      code: "HANDLE_ALREADY_IN_USE",
    });
  }

  const updated = await prisma.user.update({
    where: { id: userId },
    data: { handle: newHandle },
    select: {
      id: true, name: true, handle: true, email: true, role: true,
      sex: true, availableDaysPerWeek: true, birthDate: true, heightCm: true, weightKg: true, experienceLevel: true, primaryGoal: true, plan: true, planExpiresAt: true, acceptedTermsAt: true, acceptedTermsVersion: true, onboardingCompletedAt: true,
      isPrivate: true, showFollowLists: true, avatarUrl: true,
    },
  });
  return toSafeUser(updated);
}

// PATCH /auth/profile/name — display name only. No uniqueness check (handle
// is the unique identifier), just length validation done by the zod schema.
export async function updateName(userId: string, newName: string): Promise<SafeUser> {
  const updated = await prisma.user.update({
    where: { id: userId },
    data: { name: newName },
    select: {
      id: true, name: true, handle: true, email: true, role: true,
      sex: true, availableDaysPerWeek: true, birthDate: true, heightCm: true, weightKg: true, experienceLevel: true, primaryGoal: true, plan: true, planExpiresAt: true, acceptedTermsAt: true, acceptedTermsVersion: true, onboardingCompletedAt: true,
      isPrivate: true, showFollowLists: true, avatarUrl: true,
    },
  });
  return toSafeUser(updated);
}

// POST /auth/profile/email/confirm — runs the same verification primitive
// used at signup (verifyRegisterEmailCode), then atomically swaps the user's
// email. The code was emitted by requestEmailChangeCode, which already
// validated that the new email is free and different from the current one.
export async function confirmEmailChange(
  userId: string,
  newEmail: string,
  verificationCode: string,
  context: EventContext = {}
): Promise<SafeUser> {
  await verifyRegisterEmailCode(newEmail, verificationCode);

  // Re-check uniqueness right before committing — another user could have
  // signed up with the same email between the code request and confirmation.
  const taken = await prisma.user.findUnique({
    where: { email: newEmail },
    select: { id: true },
  });
  if (taken && taken.id !== userId) {
    throw new AppError("Email already in use", {
      statusCode: 409,
      code: "EMAIL_ALREADY_IN_USE",
    });
  }

  const updated = await prisma.user.update({
    where: { id: userId },
    data: { email: newEmail },
    select: {
      id: true, name: true, handle: true, email: true, role: true,
      sex: true, availableDaysPerWeek: true, birthDate: true, heightCm: true, weightKg: true, experienceLevel: true, primaryGoal: true, plan: true, planExpiresAt: true, acceptedTermsAt: true, acceptedTermsVersion: true, onboardingCompletedAt: true,
      isPrivate: true, showFollowLists: true, avatarUrl: true,
    },
  });

  // Mudança de email é evento sensível — revoga refresh tokens existentes
  // para que sessões antigas não consigam emitir novos access tokens em nome
  // do usuário com o email novo. O cliente atual precisa logar novamente.
  await logoutSession(userId, context);

  await trackEvent({
    userId,
    category: "AUTH",
    severity: "WARNING",
    action: "email_changed",
    resourceType: "user",
    resourceId: userId,
    requestId: context.requestId,
    ipAddress: context.ipAddress,
    userAgent: context.userAgent,
    metadata: { newEmail }
  });

  return toSafeUser(updated);
}

// GET /auth/profile/export — gathers everything we have on this user and
// returns a single JSON blob the client can download. We deliberately leave
// out password hashes, refresh tokens and OAuth secrets — anything that
// would let someone replay the account if the file leaks.
export async function exportUserData(userId: string) {
  // onboardingProfile removido — campos migraram pra User (heightCm, weightKg,
  // experienceLevel, primaryGoal vêm direto na query do user abaixo).
  const [
    user, pinnedExercises, bodyMeasurements, workoutPlans,
    workoutSessions, workoutHistory, posts, comments, follows, followers,
  ] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true, name: true, handle: true, email: true, role: true,
        sex: true, availableDaysPerWeek: true, isPrivate: true, showFollowLists: true,
        avatarUrl: true, onboardingCompletedAt: true, createdAt: true, updatedAt: true,
        birthDate: true, heightCm: true, weightKg: true, experienceLevel: true, primaryGoal: true,
      },
    }),
    prisma.pinnedExercise.findMany({
      where: { userId },
      include: { exercise: { select: { id: true, name: true, primaryMuscleGroup: true } } },
    }),
    prisma.bodyMeasurement.findMany({ where: { userId }, orderBy: { date: "asc" } }),
    prisma.workoutPlan.findMany({
      where: { userId },
      include: {
        exercises: { include: { exercise: { select: { id: true, name: true, primaryMuscleGroup: true } } } },
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.workoutSession.findMany({
      where: { userId },
      orderBy: { scheduledAt: "asc" },
      include: { workoutPlan: { select: { id: true, name: true } } },
    }),
    prisma.workoutHistory.findMany({
      where: { userId },
      orderBy: { completedAt: "asc" },
      include: { exercise: { select: { id: true, name: true, primaryMuscleGroup: true } } },
    }),
    prisma.workoutPost.findMany({
      where: { userId },
      orderBy: { createdAt: "asc" },
      include: { workoutSession: { select: { id: true } } },
    }),
    prisma.postComment.findMany({ where: { userId }, orderBy: { createdAt: "asc" } }),
    prisma.follow.findMany({
      where: { followerId: userId },
      include: { following: { select: { id: true, name: true, handle: true } } },
    }),
    prisma.follow.findMany({
      where: { followingId: userId },
      include: { follower: { select: { id: true, name: true, handle: true } } },
    }),
  ]);

  if (!user) {
    throw new AppError("User not found", { statusCode: 404, code: "USER_NOT_FOUND" });
  }

  return {
    exportedAt: new Date().toISOString(),
    format: "serraathlo-export-v1",
    user,
    pinnedExercises,
    bodyMeasurements,
    workoutPlans,
    workoutSessions,
    workoutHistory,
    posts,
    comments,
    following: follows,
    followers,
  };
}

// Hard-deletes the authenticated user and all data that has a Cascade FK
// to the `User` table (workout sessions, posts, comments, follows, tokens…).
// Caller must echo back the user's current `@handle` to confirm intent —
// the same value the UI demanded the user type in. We re-validate here so
// the check can't be bypassed by hitting the API directly.
//
// Rows that reference the user with `SetNull` (audit logs, exercise.ownerUser)
// stay intact with a null user reference, which is the desired behaviour:
// audit history survives and shared exercises don't disappear from other
// users' catalogues.
export async function deleteAccount(
  userId: string,
  confirmHandle: string,
  context: EventContext = {}
): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { handle: true },
  });

  if (!user) {
    throw new AppError("User not found", { statusCode: 404, code: "USER_NOT_FOUND" });
  }

  if (user.handle.toLowerCase() !== confirmHandle.toLowerCase()) {
    throw new AppError("Handle confirmation does not match", {
      statusCode: 400,
      code: "HANDLE_CONFIRMATION_MISMATCH",
    });
  }

  // Loga ANTES de deletar — depois do delete, o userId desaparece, mas a entry
  // do EventLog continua (FK é SetNull, não Cascade). Isto preserva o trail
  // forense de quem apagou a conta.
  await trackEvent({
    userId,
    category: "AUTH",
    severity: "WARNING",
    action: "account_deleted_self",
    resourceType: "user",
    resourceId: userId,
    requestId: context.requestId,
    ipAddress: context.ipAddress,
    userAgent: context.userAgent,
    metadata: { handle: user.handle }
  });

  await prisma.user.delete({ where: { id: userId } });
}

export async function completeOnboarding(
  userId: string,
  data: OnboardingCompleteBody
): Promise<SafeUser> {
  // birthDate vem como YYYY-MM-DD; convertemos pra Date em UTC midnight
  // pra evitar drift de timezone em queries de aniversário/idade.
  const birthDate = new Date(`${data.birthDate}T00:00:00.000Z`);

  const updated = await prisma.user.update({
    where: { id: userId },
    data: {
      sex: data.sex,
      availableDaysPerWeek: data.availableDaysPerWeek,
      birthDate,
      experienceLevel: data.experienceLevel,
      primaryGoal: data.primaryGoal,
      // Opcionais — undefined = "não mexe" via behavior do Prisma.
      heightCm: data.heightCm ?? null,
      weightKg: data.weightKg ?? null,
      onboardingCompletedAt: new Date()
    },
    select: {
      id: true,
      name: true,
      handle: true,
      email: true,
      role: true,
      sex: true,
      availableDaysPerWeek: true,
      birthDate: true,
      heightCm: true,
      weightKg: true,
      experienceLevel: true,
      primaryGoal: true,
      plan: true,
      planExpiresAt: true,
      acceptedTermsAt: true,
      acceptedTermsVersion: true,
      onboardingCompletedAt: true,
      isPrivate: true, showFollowLists: true, avatarUrl: true
    }
  });

  return toSafeUser(updated);
}

// PATCH /auth/profile — usado pelo Settings → Perfil pra editar
// height/weight/goal/experience sem refazer onboarding. Cada campo é
// opcional (partial). null explícito limpa; undefined preserva.
export async function updateProfile(userId: string, patch: ProfileUpdateBody): Promise<SafeUser> {
  const updateData: {
    sex?: "MALE" | "FEMALE" | "OTHER";
    availableDaysPerWeek?: number;
    heightCm?: number | null;
    weightKg?: number | null;
    experienceLevel?: "BEGINNER" | "INTERMEDIATE" | "ADVANCED" | null;
    primaryGoal?: "STRENGTH" | "HYPERTROPHY" | "WEIGHT_LOSS" | "ENDURANCE" | "GENERAL_FITNESS" | null;
  } = {};
  if (patch.sex !== undefined) updateData.sex = patch.sex;
  if (patch.availableDaysPerWeek !== undefined) updateData.availableDaysPerWeek = patch.availableDaysPerWeek;
  if (patch.heightCm !== undefined) updateData.heightCm = patch.heightCm;
  if (patch.weightKg !== undefined) updateData.weightKg = patch.weightKg;
  if (patch.experienceLevel !== undefined) updateData.experienceLevel = patch.experienceLevel;
  if (patch.primaryGoal !== undefined) updateData.primaryGoal = patch.primaryGoal;

  const updated = await prisma.user.update({
    where: { id: userId },
    data: updateData,
    select: {
      id: true,
      name: true,
      handle: true,
      email: true,
      role: true,
      sex: true,
      availableDaysPerWeek: true,
      birthDate: true,
      heightCm: true,
      weightKg: true,
      experienceLevel: true,
      primaryGoal: true,
      plan: true,
      planExpiresAt: true,
      acceptedTermsAt: true,
      acceptedTermsVersion: true,
      onboardingCompletedAt: true,
      isPrivate: true, showFollowLists: true, avatarUrl: true
    }
  });

  return toSafeUser(updated);
}
