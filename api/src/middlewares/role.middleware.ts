import { NextFunction, Request, Response } from "express";

import { AppError } from "../shared/errors/app-error";

export function requireAdminRole(req: Request, _res: Response, next: NextFunction): void {
  if (!req.context.userId) {
    throw new AppError("Unauthorized", {
      statusCode: 401,
      code: "UNAUTHORIZED"
    });
  }

  if (req.context.userRole !== "ADMIN") {
    throw new AppError("Forbidden", {
      statusCode: 403,
      code: "FORBIDDEN"
    });
  }

  next();
}
