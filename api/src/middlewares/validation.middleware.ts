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
        req.query = schema.query.parse(req.query) as Request["query"];
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
