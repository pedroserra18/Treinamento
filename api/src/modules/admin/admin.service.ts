import { Prisma } from "@prisma/client";

import { ListUsersQuery } from "./admin.schema";
import { prisma } from "../../config/prisma";
import { AppError } from "../../shared/errors/app-error";

const TEST_EMAIL_SUFFIXES = ["@example.com", "@local.dev"];
const AUTOMATED_TEST_LOCAL_PART = /^[a-z0-9-]+-\d{10,}(?:-[a-z0-9]{3,8})?$/i;

function isTestAccountByEmail(email: string): boolean {
  const normalized = email.trim().toLowerCase();
  const [localPart = ""] = normalized.split("@");

  if (TEST_EMAIL_SUFFIXES.some((suffix) => normalized.endsWith(suffix))) {
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

  const scopedUsers = users.filter((user) => {
    const accountType = isTestAccountByEmail(user.email) ? "TEST" : "REAL";

    if (accountScope === "REAL") {
      return accountType === "REAL";
    }

    if (accountScope === "TEST") {
      return accountType === "TEST";
    }

    return true;
  });

  const total = scopedUsers.length;
  const skip = (query.page - 1) * query.pageSize;
  const pagedUsers = scopedUsers.slice(skip, skip + query.pageSize);

  return {
    page: query.page,
    pageSize: query.pageSize,
    total,
    items: pagedUsers.map((user) => ({
      ...user,
      accountType: isTestAccountByEmail(user.email) ? "TEST" : "REAL"
    }))
  };
}

export async function deactivateUserAccount(targetUserId: string, actorUserId: string) {
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

  return result;
}

export async function deleteUserAccount(targetUserId: string, actorUserId: string) {
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

  return result;
}
