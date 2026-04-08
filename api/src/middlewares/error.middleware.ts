import { logger } from "../config/logger";
import { captureException } from "../config/sentry";
import { AppError } from "../shared/errors/app-error";
import { NextFunction, Request, Response } from "express";

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  const requestId = req.context?.requestId;

  if (err instanceof AppError) {
    const logLevel = err.statusCode >= 500 ? "error" : "warn";

    if (err.statusCode >= 500) {
      captureException(err, {
        level: "error",
        request: req,
        tags: {
          error_code: err.code,
          error_type: "app_error"
        },
        extra: {
          statusCode: err.statusCode,
          details: err.details
        }
      });
    }

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

  captureException(err, {
    level: "error",
    request: req,
    tags: {
      error_type: "unhandled_error"
    }
  });

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
