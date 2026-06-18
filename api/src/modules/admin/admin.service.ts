import { Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { ListUsersQuery } from "./admin.schema";
import { AppError } from "../../shared/errors/app-error";
import { trackEvent } from "../../shared/services/event-log.service";
import { EventContext } from "../../shared/utils/event-context";

// Campos retornados por usuário na listagem do painel admin.
const ADMIN_LIST_SELECT = {
  id: true,
  name: true,
  handle: true,
  avatarUrl: true,
  email: true,
  role: true,
  status: true,
  accountType: true,
  createdAt: true,
  lastLoginAt: true,
  onboardingCompletedAt: true,
  // Campos do onboarding pra calcular o progresso real (x/6) na tabela.
  availableDaysPerWeek: true,
  birthDate: true,
  heightCm: true,
  weightKg: true,
  experienceLevel: true,
  primaryGoal: true,
  mfaEnabled: true,
  plan: true,
  planExpiresAt: true,
  aiGenerationsTotal: true
} satisfies Prisma.UserSelect;

// Onboarding "completo" = os 6 campos do quiz preenchidos (não a flag antiga
// onboardingCompletedAt, que ficou defasada quando o fluxo ganhou campos).
const ONBOARDING_FIELDS_FILLED: Prisma.UserWhereInput[] = [
  { birthDate: { not: null } },
  { availableDaysPerWeek: { not: null } },
  { heightCm: { not: null } },
  { weightKg: { not: null } },
  { experienceLevel: { not: null } },
  { primaryGoal: { not: null } }
];

export async function listRegisteredUsers(query: ListUsersQuery) {
  const accountScope = query.accountScope ?? (query.includeTest ? "ALL" : "REAL");

  // Tudo em SQL agora (accountType persistido) — pagina/conta no banco.
  const and: Prisma.UserWhereInput[] = [];

  if (query.onboarding === "completed") {
    and.push(...ONBOARDING_FIELDS_FILLED);
  } else if (query.onboarding === "pending") {
    // Pelo menos um campo vazio.
    and.push({
      OR: [
        { birthDate: null },
        { availableDaysPerWeek: null },
        { heightCm: null },
        { weightKg: null },
        { experienceLevel: null },
        { primaryGoal: null }
      ]
    });
  }

  const search = query.search?.trim();
  if (search) {
    and.push({
      OR: [
        { name: { contains: search, mode: "insensitive" } },
        { email: { contains: search, mode: "insensitive" } },
        { handle: { contains: search, mode: "insensitive" } },
        { id: { contains: search } }
      ]
    });
  }

  const where: Prisma.UserWhereInput = {
    isDeleted: false,
    ...(accountScope === "REAL" ? { accountType: "REAL" } : accountScope === "TEST" ? { accountType: "TEST" } : {}),
    ...(query.role ? { role: query.role } : {}),
    ...(query.status ? { status: query.status } : {}),
    ...(query.plan ? { plan: query.plan } : {}),
    ...(and.length ? { AND: and } : {})
  };

  const sortBy = query.sortBy ?? "createdAt";
  const sortOrder = query.sortOrder ?? query.registrationOrder ?? "desc";
  const orderBy: Prisma.UserOrderByWithRelationInput[] = [
    { [sortBy]: sortOrder } as Prisma.UserOrderByWithRelationInput,
    { id: sortOrder } // desempate estável
  ];

  // Resumo do cabeçalho: contagens globais (independentes dos filtros), em SQL.
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const baseReal: Prisma.UserWhereInput = { isDeleted: false, accountType: "REAL" };

  const [total, items, realCount, testCount, newRealLast7Days, proRealCount] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      orderBy,
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      select: ADMIN_LIST_SELECT
    }),
    prisma.user.count({ where: baseReal }),
    prisma.user.count({ where: { isDeleted: false, accountType: "TEST" } }),
    prisma.user.count({ where: { ...baseReal, createdAt: { gte: weekAgo } } }),
    prisma.user.count({ where: { ...baseReal, plan: "PRO" } })
  ]);

  return {
    page: query.page,
    pageSize: query.pageSize,
    total,
    summary: {
      realCount,
      testCount,
      totalCount: realCount + testCount,
      newRealLast7Days,
      proRealCount
    },
    items
  };
}

export async function reactivateUserAccount(
  targetUserId: string,
  actorUserId: string,
  context: EventContext = {}
) {
  const existing = await prisma.user.findUnique({
    where: { id: targetUserId },
    select: {
      id: true,
      email: true,
      status: true,
      isDeleted: true
    }
  });

  if (!existing || existing.isDeleted) {
    throw new AppError("User not found", {
      statusCode: 404,
      code: "USER_NOT_FOUND"
    });
  }

  if (existing.status === "ACTIVE") {
    return { id: existing.id, email: existing.email, status: existing.status };
  }

  const result = await prisma.user.update({
    where: { id: targetUserId },
    data: { status: "ACTIVE" },
    select: { id: true, email: true, status: true }
  });

  await trackEvent({
    userId: actorUserId,
    category: "SECURITY",
    severity: "INFO",
    action: "admin_user_reactivated",
    resourceType: "user",
    resourceId: targetUserId,
    requestId: context.requestId,
    ipAddress: context.ipAddress,
    userAgent: context.userAgent,
    metadata: { targetEmail: existing.email }
  });

  return result;
}

export async function deactivateUserAccount(
  targetUserId: string,
  actorUserId: string,
  context: EventContext = {}
) {
  if (targetUserId === actorUserId) {
    throw new AppError("Admin cannot deactivate own account", {
      statusCode: 400,
      code: "CANNOT_DEACTIVATE_SELF"
    });
  }

  const existing = await prisma.user.findUnique({
    where: { id: targetUserId },
    select: {
      id: true,
      email: true,
      status: true,
      isDeleted: true
    }
  });

  if (!existing || existing.isDeleted) {
    throw new AppError("User not found", {
      statusCode: 404,
      code: "USER_NOT_FOUND"
    });
  }

  if (existing.status === "DISABLED") {
    return {
      id: existing.id,
      email: existing.email,
      status: existing.status
    };
  }

  const result = await prisma.$transaction(async (tx) => {
    const user = await tx.user.update({
      where: { id: targetUserId },
      data: {
        status: "DISABLED"
      },
      select: {
        id: true,
        email: true,
        status: true
      }
    });

    await tx.authProvider.updateMany({
      where: {
        userId: targetUserId,
        revokedAt: null
      },
      data: {
        revokedAt: new Date()
      }
    });

    return user;
  });

  await trackEvent({
    userId: actorUserId,
    category: "SECURITY",
    severity: "WARNING",
    action: "admin_user_deactivated",
    resourceType: "user",
    resourceId: targetUserId,
    requestId: context.requestId,
    ipAddress: context.ipAddress,
    userAgent: context.userAgent,
    metadata: { targetEmail: existing.email }
  });

  return result;
}

export async function deleteUserAccount(
  targetUserId: string,
  actorUserId: string,
  context: EventContext = {}
) {
  if (targetUserId === actorUserId) {
    throw new AppError("Admin cannot delete own account", {
      statusCode: 400,
      code: "CANNOT_DELETE_SELF"
    });
  }

  const existing = await prisma.user.findUnique({
    where: { id: targetUserId },
    select: {
      id: true,
      email: true,
      isDeleted: true
    }
  });

  if (!existing || existing.isDeleted) {
    throw new AppError("User not found", {
      statusCode: 404,
      code: "USER_NOT_FOUND"
    });
  }

  const result = await prisma.$transaction(async (tx) => {
    const user = await tx.user.update({
      where: { id: targetUserId },
      data: {
        isDeleted: true,
        deletedAt: new Date(),
        status: "DISABLED"
      },
      select: {
        id: true,
        email: true,
        status: true,
        isDeleted: true,
        deletedAt: true
      }
    });

    await tx.authProvider.updateMany({
      where: {
        userId: targetUserId,
        revokedAt: null
      },
      data: {
        revokedAt: new Date()
      }
    });

    return user;
  });

  await trackEvent({
    userId: actorUserId,
    category: "SECURITY",
    severity: "WARNING",
    action: "admin_user_deleted",
    resourceType: "user",
    resourceId: targetUserId,
    requestId: context.requestId,
    ipAddress: context.ipAddress,
    userAgent: context.userAgent,
    metadata: { targetEmail: existing.email }
  });

  return result;
}

type AdminRole = "USER" | "COACH" | "ADMIN";

export async function updateUserRole(
  targetUserId: string,
  actorUserId: string,
  newRole: AdminRole,
  context: EventContext = {}
) {
  // Guardrail: admin não muda o próprio papel (evita auto-rebaixar/escalar).
  if (targetUserId === actorUserId) {
    throw new AppError("Admin cannot change own role", {
      statusCode: 400,
      code: "CANNOT_CHANGE_OWN_ROLE"
    });
  }

  const existing = await prisma.user.findUnique({
    where: { id: targetUserId },
    select: { id: true, email: true, role: true, isDeleted: true }
  });

  if (!existing || existing.isDeleted) {
    throw new AppError("User not found", { statusCode: 404, code: "USER_NOT_FOUND" });
  }

  if (existing.role === newRole) {
    return { id: existing.id, email: existing.email, role: existing.role };
  }

  // Guardrail: não rebaixar o último admin (evita ficar sem nenhum admin).
  if (existing.role === "ADMIN" && newRole !== "ADMIN") {
    const otherAdmins = await prisma.user.count({
      where: { role: "ADMIN", isDeleted: false, id: { not: targetUserId } }
    });
    if (otherAdmins === 0) {
      throw new AppError("Cannot remove the last admin", {
        statusCode: 400,
        code: "LAST_ADMIN"
      });
    }
  }

  const result = await prisma.user.update({
    where: { id: targetUserId },
    data: { role: newRole },
    select: { id: true, email: true, role: true }
  });

  await trackEvent({
    userId: actorUserId,
    category: "SECURITY",
    severity: "WARNING",
    action: "admin_user_role_changed",
    resourceType: "user",
    resourceId: targetUserId,
    requestId: context.requestId,
    ipAddress: context.ipAddress,
    userAgent: context.userAgent,
    metadata: { targetEmail: existing.email, from: existing.role, to: newRole }
  });

  return result;
}

// Promove ou rebaixa manualmente o tier comercial de um user. Diferente do
// fluxo de convite (que precisa de redeem da pessoa), isso é ação direta do
// admin — útil quando o user já está no sistema e você quer presentear/cobrar
// PRO sem cerimônia. Cria SubscriptionEvent (histórico de tier) + EventLog
// (auditoria de ação admin).
type PlanTier = "FREE" | "PRO";

export async function updateUserPlan(
  targetUserId: string,
  actorUserId: string,
  newPlan: PlanTier,
  expiresAt: Date | null,
  context: EventContext = {}
) {
  const existing = await prisma.user.findUnique({
    where: { id: targetUserId },
    select: {
      id: true,
      email: true,
      plan: true,
      planExpiresAt: true,
      role: true,
      isDeleted: true
    }
  });

  if (!existing || existing.isDeleted) {
    throw new AppError("User not found", { statusCode: 404, code: "USER_NOT_FOUND" });
  }

  // Guardrail: ADMINs já viram PRO em runtime via resolveEffectivePlan, então
  // mudar User.plan deles é confuso (não muda comportamento). Bloqueia pra
  // evitar admin pensar que rebaixou alguém quando na verdade nada mudou.
  if (existing.role === "ADMIN") {
    throw new AppError("Admin accounts are auto-PRO at runtime — change role to USER first if you want to manage their plan", {
      statusCode: 400,
      code: "CANNOT_CHANGE_ADMIN_PLAN"
    });
  }

  if (existing.plan === newPlan && (existing.planExpiresAt?.getTime() ?? null) === (expiresAt?.getTime() ?? null)) {
    return {
      id: existing.id,
      email: existing.email,
      plan: existing.plan,
      planExpiresAt: existing.planExpiresAt
    };
  }

  // Transação: atualiza User.plan + cria SubscriptionEvent (log do
  // histórico de assinatura, usado pra auditoria/billing futuro).
  const result = await prisma.$transaction(async (tx) => {
    const updated = await tx.user.update({
      where: { id: targetUserId },
      data: {
        plan: newPlan,
        planExpiresAt: expiresAt
      },
      select: { id: true, email: true, plan: true, planExpiresAt: true }
    });

    await tx.subscriptionEvent.create({
      data: {
        userId: targetUserId,
        fromPlan: existing.plan,
        toPlan: newPlan,
        source: "ADMIN_LINK",
        expiresAt,
        metadata: { actorUserId, method: "manual_admin_panel" }
      }
    });

    return updated;
  });

  await trackEvent({
    userId: actorUserId,
    category: "SECURITY",
    severity: "INFO",
    action: "admin_user_plan_changed",
    resourceType: "user",
    resourceId: targetUserId,
    requestId: context.requestId,
    ipAddress: context.ipAddress,
    userAgent: context.userAgent,
    metadata: {
      targetEmail: existing.email,
      from: existing.plan,
      to: newPlan,
      expiresAt: expiresAt?.toISOString() ?? null
    }
  });

  return result;
}

export async function getUserDetail(targetUserId: string) {
  const user = await prisma.user.findUnique({
    where: { id: targetUserId },
    select: {
      id: true,
      name: true,
      handle: true,
      avatarUrl: true,
      email: true,
      role: true,
      status: true,
      accountType: true,
      sex: true,
      birthDate: true,
      availableDaysPerWeek: true,
      heightCm: true,
      weightKg: true,
      experienceLevel: true,
      primaryGoal: true,
      onboardingCompletedAt: true,
      emailVerifiedAt: true,
      mfaEnabled: true,
      lastLoginAt: true,
      createdAt: true,
      isDeleted: true,
      plan: true,
      planExpiresAt: true,
      aiGenerationsTotal: true
    }
  });

  if (!user || user.isDeleted) {
    throw new AppError("User not found", { statusCode: 404, code: "USER_NOT_FOUND" });
  }

  const [
    workoutPlanCount,
    workoutSessionCount,
    completedSessionCount,
    aiPlansGenerated,
    followersCount,
    followingCount,
    proInvitesCreatedCount,
    proInvitesUsedCount,
    recentEvents
  ] = await Promise.all([
      prisma.workoutPlan.count({ where: { userId: targetUserId } }),
      prisma.workoutSession.count({ where: { userId: targetUserId } }),
      prisma.workoutSession.count({ where: { userId: targetUserId, status: "COMPLETED" } }),
      prisma.eventLog.count({ where: { userId: targetUserId, action: "ai_plan_generated" } }),
      prisma.follow.count({ where: { followingId: targetUserId } }),
      prisma.follow.count({ where: { followerId: targetUserId } }),
      // Convites PRO que esse user criou (relevante pra admins) e que ele
      // já usou pra virar PRO (zero ou um, mas mantemos count por simetria).
      prisma.proUpgradeInvite.count({ where: { createdById: targetUserId } }),
      prisma.proUpgradeInvite.count({ where: { usedById: targetUserId } }),
      prisma.eventLog.findMany({
        where: { resourceType: "user", resourceId: targetUserId },
        orderBy: { occurredAt: "desc" },
        take: 8,
        select: { id: true, action: true, severity: true, occurredAt: true, userId: true }
      })
    ]);

  const { isDeleted: _isDeleted, ...userFields } = user;
  return {
    user: {
      ...userFields,
      birthDate: user.birthDate ? user.birthDate.toISOString().slice(0, 10) : null
    },
    stats: {
      workoutPlanCount,
      workoutSessionCount,
      completedSessionCount,
      aiPlansGenerated,
      followersCount,
      followingCount,
      proInvitesCreatedCount,
      proInvitesUsedCount
    },
    recentEvents
  };
}
