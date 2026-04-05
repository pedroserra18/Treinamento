import { NextFunction, Request, Response } from "express";
import { logger } from "../config/logger";

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  logger.error("unhandled_error", { err });
  res.status(500).json({ message: "Internal server error" });
}

export function notFoundHandler(_req: Request, res: Response): void {
  res.status(404).json({ message: "Route not found" });
}
