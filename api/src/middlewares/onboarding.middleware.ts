import { prisma } from "../config/prisma";
import { AppError } from "../shared/errors/app-error";
import { NextFunction, Request, Response } from "express";

export async function requireCompletedOnboarding(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  const userId = req.context.userId;
  if (!userId) {
    throw new AppError("Unauthorized", {
      statusCode: 401,
      code: "UNAUTHORIZED"
    });
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      onboardingCompletedAt: true,
      availableDaysPerWeek: true,
      isDeleted: true,
      status: true
    }
  });

  const isOnboardingComplete = Boolean(user?.onboardingCompletedAt && user?.availableDaysPerWeek);

  if (!user || user.isDeleted || user.status !== "ACTIVE") {
    throw new AppError("User not found", {
      statusCode: 404,
      code: "USER_NOT_FOUND"
    });
  }

  if (!isOnboardingComplete) {
    throw new AppError("Onboarding required before accessing dashboard", {
      statusCode: 403,
      code: "ONBOARDING_REQUIRED",
      details: {
        requiredFields: ["sex", "availableDaysPerWeek"],
        redirectPath: "/onboarding"
      }
    });
  }

  next();
}
