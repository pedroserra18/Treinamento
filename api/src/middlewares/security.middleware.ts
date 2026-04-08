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

const allowedOrigins = [
  env.clientUrl,
  ...(env.corsAllowedOrigins
    ? env.corsAllowedOrigins
        .split(",")
        .map((origin) => origin.trim())
        .filter(Boolean)
    : [])
];

const dedupedAllowedOrigins = Array.from(new Set(allowedOrigins));

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

    if (dedupedAllowedOrigins.includes(origin)) {
      callback(null, true);
      return;
    }

    logger.warn("security_suspicious_access", {
      alert: true,
      suspicious: true,
      reason: "cors_origin_denied",
      origin
    });

    callback(
      new AppError("Origin not allowed by CORS", {
        statusCode: 403,
        code: "CORS_ORIGIN_DENIED"
      })
    );
  },
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "x-request-id", "x-user-id", "x-user-role"],
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
