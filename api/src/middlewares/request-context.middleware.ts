import { logger } from "../config/logger";
import { UserRole } from "../types/request-context";
import { NextFunction, Request, Response } from "express";

function normalizeRole(value?: string): UserRole {
  const upper = value?.toUpperCase();
  if (upper === "ADMIN" || upper === "COACH" || upper === "USER") {
    return upper;
  }

  return "USER";
}

export function requestContextMiddleware(req: Request, _res: Response, next: NextFunction): void {
  const requestId =
    req.header("x-request-id")?.trim() ??
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

  req.context = {
    requestId,
    userId: req.header("x-user-id")?.trim() || undefined,
    userRole: normalizeRole(req.header("x-user-role")?.trim())
  };

  next();
}

export function requestLoggingMiddleware(req: Request, res: Response, next: NextFunction): void {
  const startedAt = Date.now();

  res.on("finish", () => {
    logger.info("http_request", {
      requestId: req.context?.requestId,
      method: req.method,
      path: req.originalUrl,
      statusCode: res.statusCode,
      durationMs: Date.now() - startedAt,
      userId: req.context?.userId,
      userRole: req.context?.userRole
    });
  });

  next();
}
