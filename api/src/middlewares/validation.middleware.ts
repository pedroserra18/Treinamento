import { NextFunction, Request, Response } from "express";
import { ZodError, ZodTypeAny } from "zod";

import { AppError } from "../shared/errors/app-error";

export function validateRequest(schema: {
  body?: ZodTypeAny;
  params?: ZodTypeAny;
  query?: ZodTypeAny;
}) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      if (schema.body) {
        req.body = schema.body.parse(req.body);
      }

      if (schema.params) {
        req.params = schema.params.parse(req.params) as Request["params"];
      }

      if (schema.query) {
        const parsedQuery = schema.query.parse(req.query) as Record<string, unknown>;
        const queryTarget = req.query as Record<string, unknown>;

        for (const key of Object.keys(queryTarget)) {
          delete queryTarget[key];
        }

        Object.assign(queryTarget, parsedQuery);
      }

      next();
    } catch (error) {
      if (error instanceof ZodError) {
        throw new AppError("Validation error", {
          statusCode: 400,
          code: "VALIDATION_ERROR",
          details: error.flatten()
        });
      }

      throw error;
    }
  };
}
