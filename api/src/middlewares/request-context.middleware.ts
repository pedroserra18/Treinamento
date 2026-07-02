import { logger } from "../config/logger";
import { NextFunction, Request, Response } from "express";

export function requestContextMiddleware(req: Request, _res: Response, next: NextFunction): void {
  const requestId =
    req.header("x-request-id")?.trim() ??
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

  // A identidade (userId/userRole) NUNCA vem de headers do cliente. Ela é
  // populada exclusivamente pelos middlewares de auth (requireAuth /
  // optionalAuth) a partir de um JWT verificado. Confiar em `x-user-id` /
  // `x-user-role` aqui permitiria a qualquer chamador se passar por outro
  // usuário (e escalar para ADMIN) apenas enviando um header — inclusive em
  // rotas com `optionalAuth`, onde nenhum token é exigido. Iniciamos com o
  // papel mínimo; quem tiver Bearer válido é promovido pela auth.
  req.context = {
    requestId,
    userId: undefined,
    userRole: "USER"
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
