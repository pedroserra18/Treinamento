import { Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { ListUsersQuery } from "./admin.schema";
import { AppError } from "../../shared/errors/app-error";
import { trackEvent } from "../../shared/services/event-log.service";
import { EventContext } from "../../shared/utils/event-context";

const TEST_EMAIL_SUFFIXES = ["@example.com", "@local.dev"];
const AUTOMATED_TEST_LOCAL_PART = /^[a-z0-9-]+-\d{10,}(?:-[a-z0-9]{3,8})?$/i;
const TEST_LOCAL_PART_PREFIXES = [
  "test",
  "teste",
  "qa",
  "mock",
  "demo",
  "seed",
  "tmp",
  "temp",
  "fake",
  "recover",
  "authcheck",
  "logincheck",
  "cadastro.teste"
];

function isTestAccountByEmail(email: string): boolean {
  const normalized = email.trim().toLowerCase();
  const [localPart = ""] = normalized.split("@");

  if (TEST_EMAIL_SUFFIXES.some((suffix) => normalized.endsWith(suffix))) {
    return true;
  }

  if (TEST_LOCAL_PART_PREFIXES.some((prefix) => localPart.startsWith(prefix))) {
    return true;
  }

  if (localPart.includes(".teste") || localPart.includes(".test")) {
    return true;
  }

  return AUTOMATED_TEST_LOCAL_PART.test(localPart);
}

export async function listRegisteredUsers(query: ListUsersQuery) {
  const accountScope = query.accountScope ?? (query.includeTest ? "ALL" : "REAL");

  const where: Prisma.UserWhereInput = {
    isDeleted: false
  };

  const users = await prisma.user.findMany({
    where,
    orderBy: [{ createdAt: query.registrationOrder }, { id: query.registrationOrder }],
    select: {
      id: true,
      name: true,
      handle: true,
      avatarUrl: true,
      email: true,
      role: true,
      status: true,
      createdAt: true,
      lastLoginAt: true,
      onboardingCompletedAt: true,
      availableDaysPerWeek: true,
      mfaEnabled: true,
      // Plan tier: exibido como pill no painel admin pra dar visão rápida
      // de quem é PRO, e habilita ordenação/filtragem por tier.
      plan: true,
      planExpiresAt: true,
      aiGenerationsTotal: true
    }
  });

  const classifiedUsers = users.map((user) => ({
    ...user,
    accountType: isTestAccountByEmail(user.email) ? "TEST" : "REAL"
  }));

  const realCount = classifiedUsers.filter((user) => user.accountType === "REAL").length;
  const testCount = classifiedUsers.length - realCount;

  // Contas reais criadas nos últimos 7 dias — alimenta a métrica do cabeçalho.
  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const newRealLast7Days = classifiedUsers.filter(
    (user) => user.accountType === "REAL" && user.createdAt.getTime() >= weekAgo
  ).length;

  // Quantos PRO (contando entre as contas REAIS — admins contam pra
  // separado já que aparecem com pill "ADMIN" na UI).
  const proRealCount = classifiedUsers.filter(
    (user) => user.accountType === "REAL" && user.plan === "PRO"
  ).length;

  const scopedUsers = classifiedUsers.filter((user) => {
    const accountType = user.accountType;

    if (accountScope === "REAL") {
      return accountType === "REAL";
    }

    if (accountScope === "TEST") {
      return accountType === "TEST";
    }

    return true;
  });

  // Filtros opcionais (role / status / onboarding / plan).
  const filteredUsers = scopedUsers.filter((user) => {
    if (query.role && user.role !== query.role) return false;
    if (query.status && user.status !== query.status) return false;
    if (query.onboarding === "completed" && !user.onboardingCompletedAt) return false;
    if (query.onboarding === "pending" && user.onboardingCompletedAt) return false;
    if (query.plan && user.plan !== query.plan) return false;
    return true;
  });

  // Busca server-side: nome, e-mail, handle ou ID (case-insensitive).
  const searchTerm = query.search?.trim().toLowerCase();
  const matchedUsers = searchTerm
    ? filteredUsers.filter((user) => {
        return (
          (user.name ?? "").toLowerCase().includes(searchTerm) ||
          user.email.toLowerCase().includes(searchTerm) ||
          (user.handle ?? "").toLowerCase().includes(searchTerm) ||
          user.id.toLowerCase().includes(searchTerm)
        );
      })
    : filteredUsers;

  // Ordenação server-side. sortBy tem precedência; cai no createdAt/registrationOrder.
  const sortBy = query.sortBy ?? "createdAt";
  const sortOrder = query.sortOrder ?? query.registrationOrder ?? "desc";
  const dir = sortOrder === "asc" ? 1 : -1;
  const sortedUsers = [...matchedUsers].sort((a, b) => {
    let cmp = 0;
    switch (sortBy) {
      case "name":
        cmp = (a.name ?? "").localeCompare(b.name ?? "", "pt-BR", { sensitivity: "base" });
        break;
      case "email":
        cmp = a.email.localeCompare(b.email, "pt-BR", { sensitivity: "base" });
        break;
      case "status":
        cmp = a.status.localeCompare(b.status);
        break;
      case "role":
        cmp = a.role.localeCompare(b.role);
        break;
      case "lastLoginAt": {
        const av = a.lastLoginAt ? a.lastLoginAt.getTime() : 0;
        const bv = b.lastLoginAt ? b.lastLoginAt.getTime() : 0;
        cmp = av - bv;
        break;
      }
      default:
        cmp = a.createdAt.getTime() - b.createdAt.getTime();
    }
    if (cmp === 0) cmp = a.id.localeCompare(b.id);
    return cmp * dir;
  });

  const total = sortedUsers.length;
  const skip = (query.page - 1) * query.pageSize;
  const pagedUsers = sortedUsers.slice(skip, skip + query.pageSize);

  return {
    page: query.page,
    pageSize: query.pageSize,
    total,
    summary: {
      realCount,
      testCount,
      totalCount: classifiedUsers.length,
      newRealLast7Days,
      proRealCount
    },
    items: pagedUsers
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
      sex: true,
      birthDate: true,
      availableDaysPerWeek: true,
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
      accountType: isTestAccountByEmail(user.email) ? "TEST" : "REAL",
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
