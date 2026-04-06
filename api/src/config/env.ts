import dotenv from "dotenv";
import path from "node:path";
import { z } from "zod";

dotenv.config({
  path: path.resolve(__dirname, "../../.env"),
  override: true
});

const emptyToUndefined = (value: unknown) => {
  if (typeof value === "string" && value.trim() === "") {
    return undefined;
  }

  return value;
};

const booleanFromEnv = (value: unknown) => {
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();

    if (normalized === "true") {
      return true;
    }

    if (normalized === "false") {
      return false;
    }
  }

  return value;
};

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  API_PORT: z.coerce.number().int().positive().default(4000),
  CLIENT_URL: z.string().url().default("http://localhost:3000"),
  CORS_ALLOWED_ORIGINS: z.string().optional(),
  REDIS_URL: z.string().url().optional(),

  GLOBAL_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(100),
  LOGIN_BRUTE_FORCE_MAX: z.coerce.number().int().positive().default(5),
  LOGIN_BRUTE_FORCE_WINDOW_MIN: z.coerce.number().int().positive().default(15),
  LOGIN_PROGRESSIVE_BASE_MIN: z.coerce.number().int().positive().default(3),
  LOGIN_PROGRESSIVE_MAX_MIN: z.coerce.number().int().positive().default(60),
  OAUTH_STATE_TTL_MIN: z.coerce.number().int().positive().default(10),

  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  DIRECT_URL: z.string().optional(),

  JWT_SECRET: z.string().min(32, "JWT_SECRET must have at least 32 chars"),
  JWT_EXPIRES_IN: z.string().default("1d"),
  JWT_REFRESH_SECRET: z
    .string()
    .min(32, "JWT_REFRESH_SECRET must have at least 32 chars"),
  JWT_REFRESH_EXPIRES_IN: z.string().default("7d"),
  JWT_ISSUER: z.string().default("acad-api"),
  JWT_AUDIENCE: z.string().default("acad-web"),

  GOOGLE_CLIENT_ID: z.string().min(1, "GOOGLE_CLIENT_ID is required"),
  GOOGLE_CLIENT_SECRET: z.string().min(1, "GOOGLE_CLIENT_SECRET is required"),
  GOOGLE_CALLBACK_URL: z.string().url(),

  SMTP_HOST: z.preprocess(emptyToUndefined, z.string().optional()),
  SMTP_PORT: z.preprocess(emptyToUndefined, z.coerce.number().int().positive().optional()),
  SMTP_SECURE: z.preprocess(booleanFromEnv, z.boolean()).default(false),
  SMTP_USER: z.preprocess(emptyToUndefined, z.string().optional()),
  SMTP_PASS: z.preprocess(emptyToUndefined, z.string().optional()),
  SMTP_FROM: z.preprocess(emptyToUndefined, z.string().email().optional()),
  EMAIL_VERIFICATION_TTL_MIN: z.coerce.number().int().positive().default(10),

  LOG_LEVEL: z.enum(["error", "warn", "info", "http", "debug", "silent"]).default("info"),
  SENTRY_DSN: z.string().optional(),
  OTEL_EXPORTER_OTLP_ENDPOINT: z.string().optional(),
  OTEL_SERVICE_NAME: z.string().default("acad-api")
});

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  const flattened = parsedEnv.error.flatten().fieldErrors;
  throw new Error(`Invalid environment variables: ${JSON.stringify(flattened)}`);
}

export const env = {
  nodeEnv: parsedEnv.data.NODE_ENV,
  port: parsedEnv.data.API_PORT,
  clientUrl: parsedEnv.data.CLIENT_URL,
  corsAllowedOrigins: parsedEnv.data.CORS_ALLOWED_ORIGINS,
  redisUrl: parsedEnv.data.REDIS_URL,

  globalRateLimitMax: parsedEnv.data.GLOBAL_RATE_LIMIT_MAX,
  loginBruteForceMax: parsedEnv.data.LOGIN_BRUTE_FORCE_MAX,
  loginBruteForceWindowMin: parsedEnv.data.LOGIN_BRUTE_FORCE_WINDOW_MIN,
  loginProgressiveBaseMin: parsedEnv.data.LOGIN_PROGRESSIVE_BASE_MIN,
  loginProgressiveMaxMin: parsedEnv.data.LOGIN_PROGRESSIVE_MAX_MIN,
  oauthStateTtlMin: parsedEnv.data.OAUTH_STATE_TTL_MIN,

  databaseUrl: parsedEnv.data.DATABASE_URL,
  directUrl: parsedEnv.data.DIRECT_URL,

  jwtSecret: parsedEnv.data.JWT_SECRET,
  jwtExpiresIn: parsedEnv.data.JWT_EXPIRES_IN,
  jwtRefreshSecret: parsedEnv.data.JWT_REFRESH_SECRET,
  jwtRefreshExpiresIn: parsedEnv.data.JWT_REFRESH_EXPIRES_IN,
  jwtIssuer: parsedEnv.data.JWT_ISSUER,
  jwtAudience: parsedEnv.data.JWT_AUDIENCE,

  googleClientId: parsedEnv.data.GOOGLE_CLIENT_ID,
  googleClientSecret: parsedEnv.data.GOOGLE_CLIENT_SECRET,
  googleCallbackUrl: parsedEnv.data.GOOGLE_CALLBACK_URL,

  smtpHost: parsedEnv.data.SMTP_HOST,
  smtpPort: parsedEnv.data.SMTP_PORT,
  smtpSecure: parsedEnv.data.SMTP_SECURE,
  smtpUser: parsedEnv.data.SMTP_USER,
  smtpPass: parsedEnv.data.SMTP_PASS,
  smtpFrom: parsedEnv.data.SMTP_FROM,
  emailVerificationTtlMin: parsedEnv.data.EMAIL_VERIFICATION_TTL_MIN,

  logLevel: parsedEnv.data.LOG_LEVEL,
  sentryDsn: parsedEnv.data.SENTRY_DSN,
  otelExporterEndpoint: parsedEnv.data.OTEL_EXPORTER_OTLP_ENDPOINT,
  otelServiceName: parsedEnv.data.OTEL_SERVICE_NAME
};
