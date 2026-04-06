import cors from "cors";
import { RequestHandler } from "express";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import { xss } from "express-xss-sanitizer";
import helmet from "helmet";
import hpp from "hpp";
import { RedisStore } from "rate-limit-redis";

import { env } from "../config/env";
import { logger } from "../config/logger";
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
    ip: reqIp,
    email,
    totalHits: securityMetrics.loginBruteForceHits
  });
}

export function trackLoginFailure(email: string, reqIp: string): void {
  securityMetrics.loginFailures += 1;
  touchMetrics();
  logger.warn("security_login_failed", {
    alert: true,
    ip: reqIp,
    email,
    totalFailures: securityMetrics.loginFailures
  });
}

export function getSecurityMetricsSnapshot(): SecurityMetrics {
  return { ...securityMetrics };
}

export const secureHeaders = helmet({
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      "default-src": ["'self'"],
      "base-uri": ["'self'"],
      "object-src": ["'none'"],
      "frame-ancestors": ["'none'"],
      "form-action": ["'self'"],
      "img-src": ["'self'", "data:", "https:"],
      "script-src": ["'self'"],
      "style-src": ["'self'", "'unsafe-inline'"],
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

    callback(
      new AppError("Origin not allowed by CORS", {
        statusCode: 403,
        code: "CORS_ORIGIN_DENIED"
      })
    );
  },
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "x-request-id", "x-user-id", "x-user-role"],
  credentials: true,
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

export const sanitizeInput = xss() as RequestHandler;

export const preventHttpParamPollution = hpp();
