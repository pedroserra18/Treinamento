import hpp from "hpp";
import cors from "cors";
import helmet from "helmet";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import { env } from "../config/env";
import { RequestHandler } from "express";
import { logger } from "../config/logger";
import { xss } from "express-xss-sanitizer";
import { RedisStore } from "rate-limit-redis";
import { redisClient } from "../config/redis";
import { AppError } from "../shared/errors/app-error";

function normalizeOrigin(value: string): string | null {
  try {
    const url = new URL(value);

    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return null;
    }

    return `${url.protocol}//${url.host}`;
  } catch {
    return null;
  }
}

const rawAllowedOrigins = [
  env.clientUrl,
  ...(env.corsAllowedOrigins
    ? env.corsAllowedOrigins
        .split(",")
        .map((origin) => origin.trim())
        .filter(Boolean)
    : [])
];

const dedupedAllowedOrigins = Array.from(
  new Set(
    rawAllowedOrigins
      .map((origin) => normalizeOrigin(origin))
      .filter((origin): origin is string => Boolean(origin))
  )
);

type SecurityMetrics = {
  globalRateLimitHits: number;
  loginBruteForceHits: number;
  loginFailures: number;
  updatedAt: string;
};

const securityMetrics: SecurityMetrics = {
  globalRateLimitHits: 0,
  loginBruteForceHits: 0,
  loginFailures: 0,
  updatedAt: new Date().toISOString()
};

function touchMetrics(): void {
  securityMetrics.updatedAt = new Date().toISOString();
}

function createRedisStore(prefix: string): RedisStore | undefined {
  const client = redisClient;

  if (!client) {
    return undefined;
  }

  return new RedisStore({
    prefix,
    sendCommand: (...args: string[]) =>
      client.call(args[0], ...args.slice(1)) as unknown as Promise<string | number>
  });
}

function trackGlobalRateLimit(reqIp: string, path: string): void {
  securityMetrics.globalRateLimitHits += 1;
  touchMetrics();
  logger.warn("security_rate_limit_global", {
    alert: true,
    suspicious: true,
    reason: "global_rate_limit_exceeded",
    ip: reqIp,
    path,
    totalHits: securityMetrics.globalRateLimitHits
  });
}

function trackLoginBruteForce(reqIp: string, email: string): void {
  securityMetrics.loginBruteForceHits += 1;
  touchMetrics();
  logger.warn("security_bruteforce_login", {
    alert: true,
    suspicious: true,
    reason: "login_bruteforce_detected",
    ip: reqIp,
    email,
    totalHits: securityMetrics.loginBruteForceHits
  });
}

type LoginFailureContext = {
  requestId?: string;
  userAgent?: string;
  path?: string;
};

export function trackLoginFailure(email: string, reqIp: string, context?: LoginFailureContext): void {
  securityMetrics.loginFailures += 1;
  touchMetrics();
  logger.warn("security_login_failed", {
    alert: true,
    suspicious: true,
    reason: "invalid_login_credentials",
    requestId: context?.requestId,
    userAgent: context?.userAgent,
    path: context?.path,
    ip: reqIp,
    email,
    totalFailures: securityMetrics.loginFailures
  });
}

export function getSecurityMetricsSnapshot(): SecurityMetrics {
  return { ...securityMetrics };
}

export const enforceHttpsInProduction: RequestHandler = (req, res, next) => {
  if (!env.enforceHttps) {
    next();
    return;
  }

  const forwardedProto = req.header("x-forwarded-proto");
  const isHttps = req.secure || forwardedProto === "https";

  if (isHttps) {
    next();
    return;
  }

  logger.warn("security_https_required", {
    alert: true,
    suspicious: true,
    reason: "insecure_http_request_in_production",
    ip: req.ip,
    path: req.originalUrl
  });

  res.status(426).json({
    error: {
      code: "HTTPS_REQUIRED",
      message: "HTTPS is required"
    }
  });
};

export const secureHeaders = helmet({
  contentSecurityPolicy: {
    useDefaults: false,
    directives: {
      "default-src": ["'none'"],
      "base-uri": ["'none'"],
      "object-src": ["'none'"],
      "frame-ancestors": ["'none'"],
      "form-action": ["'none'"],
      "img-src": ["'none'"],
      "script-src": ["'none'"],
      "style-src": ["'none'"],
      "connect-src": ["'self'", ...dedupedAllowedOrigins]
    }
  },
  crossOriginEmbedderPolicy: false
});

export const corsPolicy = cors({
  origin: (origin, callback) => {
    // Allow same-origin/server-to-server requests that do not send Origin.
    if (!origin) {
      callback(null, true);
      return;
    }

    const normalizedOrigin = normalizeOrigin(origin);

    if (normalizedOrigin && dedupedAllowedOrigins.includes(normalizedOrigin)) {
      callback(null, true);
      return;
    }

    logger.warn("security_suspicious_access", {
      alert: true,
      suspicious: true,
      reason: "cors_origin_denied",
      origin,
      normalizedOrigin
    });

    callback(
      new AppError("Origin not allowed by CORS", {
        statusCode: 403,
        code: "CORS_ORIGIN_DENIED"
      })
    );
  },
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  // `x-user-id` / `x-user-role` foram removidos de propósito: a identidade é
  // derivada só do JWT (ver request-context.middleware.ts), então não há razão
  // para o cliente enviá-los e aceitá-los só ampliaria a superfície de abuso.
  allowedHeaders: ["Content-Type", "Authorization", "x-request-id"],
  credentials: false,
  optionsSuccessStatus: 204
});

export const rateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: env.globalRateLimitMax,
  store: createRedisStore("rl:global:"),
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many requests, try again later." },
  handler: (req, res, _next, options) => {
    trackGlobalRateLimit(req.ip ?? "unknown", req.originalUrl);
    res.status(options.statusCode).json(options.message);
  }
});

export const loginBruteForceLimiter = rateLimit({
  windowMs: env.loginBruteForceWindowMin * 60 * 1000,
  max: env.loginBruteForceMax,
  store: createRedisStore("rl:login:"),
  keyGenerator: (req) => {
    const ipKey = ipKeyGenerator(req.ip ?? req.socket.remoteAddress ?? "unknown");
    const email =
      typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "anonymous";
    return `${ipKey}:${email}`;
  },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: {
    message: "Too many failed login attempts. Please try again later."
  },
  handler: (req, res, _next, options) => {
    const email =
      typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "anonymous";
    trackLoginBruteForce(req.ip ?? "unknown", email);
    res.status(options.statusCode).json(options.message);
  }
});

export const authCodeRequestLimiter = rateLimit({
  windowMs: env.authCodeRequestWindowMin * 60 * 1000,
  max: env.authCodeRequestMax,
  store: createRedisStore("rl:auth:code:request:"),
  keyGenerator: (req) => {
    const ipKey = ipKeyGenerator(req.ip ?? req.socket.remoteAddress ?? "unknown");
    const email =
      typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "anonymous";
    return `${ipKey}:${email}`;
  },
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    message: "Too many code requests. Please try again later."
  }
});

export const authCodeVerifyLimiter = rateLimit({
  windowMs: env.authCodeVerifyWindowMin * 60 * 1000,
  max: env.authCodeVerifyMax,
  store: createRedisStore("rl:auth:code:verify:"),
  keyGenerator: (req) => {
    const ipKey = ipKeyGenerator(req.ip ?? req.socket.remoteAddress ?? "unknown");
    const email =
      typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "anonymous";
    return `${ipKey}:${email}`;
  },
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    message: "Too many validation attempts. Please try again later."
  }
});

export const sanitizeInput = xss() as RequestHandler;

export const preventHttpParamPollution = hpp();

// Builds a per-user rate limiter for authenticated endpoints. Must be
// mounted AFTER auth so req.context.userId is populated; when no user
// is on the request, falls back to IP so unauthenticated callers don't
// silently bypass the cap.
//
// The shared-IP problem (offices, NAT, mobile carriers) means a single
// IP-keyed global cap will block legitimate users at scale once a couple
// of people on the same network are polling concurrently. A per-user
// cap is the right knob — at 5k DAU each polling /standings every 12s
// = ~25k req/min total, but each user only contributes 5 req/min, so
// 60/min headroom per user is plenty for normal use.
export function createUserScopedLimiter(opts: {
  prefix: string;
  windowMs: number;
  max: number;
}): RequestHandler {
  return rateLimit({
    windowMs: opts.windowMs,
    max: opts.max,
    store: createRedisStore(opts.prefix),
    keyGenerator: (req) => {
      const userId = req.context?.userId;
      if (userId) return `u:${userId}`;
      return `ip:${ipKeyGenerator(req.ip ?? req.socket.remoteAddress ?? "unknown")}`;
    },
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: "Muitas requisições. Tente novamente em alguns segundos." }
  });
}

// Polling endpoints (standings, feed, chat list). 120 reads/min per user
// is roughly 4× the normal polling rate, so bursts (tab refocus,
// multiple devices) still pass.
export const competitionReadLimiter = createUserScopedLimiter({
  prefix: "rl:comp:read:",
  windowMs: 60 * 1000,
  max: 120
});

// Write endpoints (chat, comments, reactions, entries, invites). A
// tighter cap since the per-action service-level limits (2s/30s) already
// stop normal-pattern spam — this is purely the "scripted bot" backstop.
export const competitionWriteLimiter = createUserScopedLimiter({
  prefix: "rl:comp:write:",
  windowMs: 60 * 1000,
  max: 30
});
