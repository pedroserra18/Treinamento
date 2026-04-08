import jwt from "jsonwebtoken";
import { env } from "../config/env";
import { AppError } from "../shared/errors/app-error";
import { NextFunction, Request, Response } from "express";

type AccessTokenClaims = {
  sub: string;
  role: "USER" | "COACH" | "ADMIN";
  email: string;
  tokenType?: "access" | "refresh";
};

export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  const authHeader = req.header("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    throw new AppError("Unauthorized", {
      statusCode: 401,
      code: "UNAUTHORIZED"
    });
  }

  const token = authHeader.slice("Bearer ".length).trim();
  try {
    const decoded = jwt.verify(token, env.jwtSecret, {
      issuer: env.jwtIssuer,
      audience: env.jwtAudience
    }) as AccessTokenClaims;

    if (decoded.tokenType && decoded.tokenType !== "access") {
      throw new AppError("Invalid token", {
        statusCode: 401,
        code: "INVALID_TOKEN"
      });
    }

    req.context.userId = decoded.sub;
    req.context.userRole = decoded.role;
    next();
  } catch {
    throw new AppError("Invalid token", {
      statusCode: 401,
      code: "INVALID_TOKEN"
    });
  }
}
