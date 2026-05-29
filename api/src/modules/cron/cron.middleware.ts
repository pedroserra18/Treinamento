import { RequestHandler } from "express";
import { env } from "../../config/env";
import { AppError } from "../../shared/errors/app-error";
import { logger } from "../../config/logger";

// Compares the incoming secret with env.cronSecret using a length-safe
// constant-time check so a timing attack can't probe one byte at a
// time. Returns false when either side is missing or when they differ.
function timingSafeEquals(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i += 1) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

// Mounted on every /cron route. Refuses calls without a matching
// CRON_SECRET so the public URL can't be abused to repeatedly trigger
// expensive background work. Accepts the secret on either header so we
// can use either Vercel Cron's default `Authorization: Bearer <secret>`
// or a custom `x-cron-secret` from another scheduler.
export const requireCronSecret: RequestHandler = (req, res, next) => {
  const configured = env.cronSecret;
  if (!configured) {
    // Fail closed — if no secret is set, the cron endpoint is disabled
    // entirely. Prevents accidentally shipping an open background job
    // trigger to production.
    logger.warn("cron_secret_unset", { path: req.originalUrl });
    res.status(503).json({
      error: { code: "CRON_DISABLED", message: "Cron is not configured on this environment" }
    });
    return;
  }

  const headerAuth = (req.headers.authorization ?? "").trim();
  const bearer = headerAuth.toLowerCase().startsWith("bearer ")
    ? headerAuth.slice(7).trim()
    : "";
  const headerSecret =
    typeof req.headers["x-cron-secret"] === "string"
      ? req.headers["x-cron-secret"]
      : "";
  const candidate = bearer || headerSecret;

  if (!candidate || !timingSafeEquals(candidate, configured)) {
    logger.warn("cron_secret_invalid", {
      path: req.originalUrl,
      ip: req.ip,
      hasBearer: Boolean(bearer),
      hasHeader: Boolean(headerSecret)
    });
    next(new AppError("Unauthorized cron call", { statusCode: 401, code: "CRON_UNAUTHORIZED" }));
    return;
  }
  next();
};
