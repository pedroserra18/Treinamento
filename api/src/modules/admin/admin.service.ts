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
      mfaEnabled: true
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

  // Busca server-side: nome, e-mail, handle ou ID (case-insensitive).
  const searchTerm = query.search?.trim().toLowerCase();
  const matchedUsers = searchTerm
    ? scopedUsers.filter((user) => {
        return (
          (user.name ?? "").toLowerCase().includes(searchTerm) ||
          user.email.toLowerCase().includes(searchTerm) ||
          (user.handle ?? "").toLowerCase().includes(searchTerm) ||
          user.id.toLowerCase().includes(searchTerm)
        );
      })
    : scopedUsers;

  const total = matchedUsers.length;
  const skip = (query.page - 1) * query.pageSize;
  const pagedUsers = matchedUsers.slice(skip, skip + query.pageSize);

  return {
    page: query.page,
    pageSize: query.pageSize,
    total,
    summary: {
      realCount,
      testCount,
      totalCount: classifiedUsers.length,
      newRealLast7Days
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
