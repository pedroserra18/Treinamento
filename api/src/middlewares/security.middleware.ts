import cors from "cors";
import helmet from "helmet";
import hpp from "hpp";
import rateLimit from "express-rate-limit";
import { RequestHandler } from "express";
import { xss } from "express-xss-sanitizer";
import { env } from "../config/env";

export const secureHeaders = helmet({
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      "default-src": ["'self'"],
      "img-src": ["'self'", "data:", "https:"],
      "script-src": ["'self'"],
      "style-src": ["'self'", "'unsafe-inline'"]
    }
  }
});

export const corsPolicy = cors({
  origin: [env.clientUrl],
  credentials: true
});

export const rateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many requests, try again later." }
});

export const sanitizeInput = xss() as RequestHandler;

export const preventHttpParamPollution = hpp();
