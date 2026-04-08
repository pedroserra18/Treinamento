import { NextFunction, Request, Response } from "express";

import { logger } from "../config/logger";
import { AppError } from "../shared/errors/app-error";

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  const requestId = req.context?.requestId;

  if (err instanceof AppError) {
    const logLevel = err.statusCode >= 500 ? "error" : "warn";

    logger.log(logLevel, "app_error", {
      requestId,
      message: err.message,
      code: err.code,
      statusCode: err.statusCode,
      details: err.details
    });

    res.status(err.statusCode).json({
      error: {
        code: err.code,
        message: err.message,
        details: err.details
      },
      meta: { requestId }
    });
    return;
  }

  logger.error("unhandled_error", { requestId, err });
  res.status(500).json({
    error: {
      code: "INTERNAL_SERVER_ERROR",
      message: "Internal server error"
    },
    meta: { requestId }
  });
}

export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    error: {
      code: "NOT_FOUND",
      message: "Route not found"
    },
    meta: {
      requestId: req.context?.requestId
    }
  });
}
