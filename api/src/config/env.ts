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

const coerceBoolean = (value: unknown): boolean | undefined => {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["1", "true", "yes", "on"].includes(normalized)) {
      return true;
    }

    if (["0", "false", "no", "off"].includes(normalized)) {
      return false;
    }
  }

  return undefined;
};

const secretPlaceholderPatterns = [
  "replace_with_",
  "changeme",
  "change_me",
  "example",
  "your_",
  "test"
];

function hasPlaceholderSecret(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    return true;
  }

  return secretPlaceholderPatterns.some((pattern) => normalized.includes(pattern));
}

function isLocalhostUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return ["localhost", "127.0.0.1", "::1"].includes(parsed.hostname);
  } catch {
    return false;
  }
}

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
  AUTH_CODE_REQUEST_WINDOW_MIN: z.coerce.number().int().positive().default(10),
  AUTH_CODE_REQUEST_MAX: z.coerce.number().int().positive().default(5),
  AUTH_CODE_VERIFY_WINDOW_MIN: z.coerce.number().int().positive().default(10),
  AUTH_CODE_VERIFY_MAX: z.coerce.number().int().positive().default(10),
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

  RESEND_API_KEY: z.preprocess(emptyToUndefined, z.string().optional()),
  RESEND_FROM_EMAIL: z.preprocess(emptyToUndefined, z.string().email().optional()),
  EMAIL_VERIFICATION_TTL_MIN: z.coerce.number().int().positive().default(10),

  LOG_LEVEL: z.enum(["error", "warn", "info", "http", "debug", "silent"]).default("info"),
  ENFORCE_HTTPS: z.preprocess(coerceBoolean, z.boolean().optional()),
  SENTRY_DSN: z.string().optional(),
  OTEL_EXPORTER_OTLP_ENDPOINT: z.string().optional(),
  OTEL_SERVICE_NAME: z.string().default("acad-api"),

  OPENAI_API_KEY: z.preprocess(emptyToUndefined, z.string().optional()),
  OPENAI_MODEL: z.preprocess(emptyToUndefined, z.string().optional()),

  // Object storage (Supabase Storage). Optional in dev — the upload endpoint
  // returns 503 with a clear message when these are missing so the feature
  // degrades gracefully instead of crashing the API on boot.
  SUPABASE_URL: z.preprocess(emptyToUndefined, z.string().url().optional()),
  SUPABASE_SERVICE_ROLE_KEY: z.preprocess(emptyToUndefined, z.string().optional()),
  SUPABASE_STORAGE_BUCKET: z.preprocess(emptyToUndefined, z.string().optional()),

  // Sightengine image moderation — runs against competition proof
  // photos before upload. Optional; when empty the moderation module
  // is a no-op (image goes straight to Storage). See:
  // src/modules/competition/image-moderation.ts
  SIGHTENGINE_API_USER: z.preprocess(emptyToUndefined, z.string().optional()),
  SIGHTENGINE_API_SECRET: z.preprocess(emptyToUndefined, z.string().optional()),

  // Shared secret expected on /cron/* endpoints. Vercel Cron sends it
  // as `Authorization: Bearer <CRON_SECRET>` when set in the Vercel
  // project env; we accept either that header or `x-cron-secret`. The
  // endpoint refuses calls without a matching secret so the public URL
  // can't be abused to repeatedly trigger expensive background work.
  CRON_SECRET: z.preprocess(emptyToUndefined, z.string().min(32, "CRON_SECRET must have at least 32 chars").optional())
});

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  const flattened = parsedEnv.error.flatten().fieldErrors;
  throw new Error(`Invalid environment variables: ${JSON.stringify(flattened)}`);
}

const data = parsedEnv.data;

if (data.NODE_ENV === "production") {
  const productionSecrets = [
    ["JWT_SECRET", data.JWT_SECRET],
    ["JWT_REFRESH_SECRET", data.JWT_REFRESH_SECRET],
    ["GOOGLE_CLIENT_SECRET", data.GOOGLE_CLIENT_SECRET]
  ] as const;

  for (const [name, value] of productionSecrets) {
    if (hasPlaceholderSecret(value)) {
      throw new Error(`Invalid environment variables: ${name} uses a placeholder value in production`);
    }
  }

  if (!data.CLIENT_URL.startsWith("https://") && !isLocalhostUrl(data.CLIENT_URL)) {
    throw new Error("Invalid environment variables: CLIENT_URL must use HTTPS in production");
  }

  if (data.CORS_ALLOWED_ORIGINS) {
    const invalidOrigin = data.CORS_ALLOWED_ORIGINS.split(",")
      .map((origin) => origin.trim())
      .find((origin) => origin && !origin.startsWith("https://") && !isLocalhostUrl(origin));

    if (invalidOrigin) {
      throw new Error(
        `Invalid environment variables: CORS_ALLOWED_ORIGINS contains non-HTTPS origin in production (${invalidOrigin})`
      );
    }
  }
}

const enforceHttps = data.ENFORCE_HTTPS ?? data.NODE_ENV === "production";

export const env = {
  nodeEnv: data.NODE_ENV,
  port: data.API_PORT,
  clientUrl: data.CLIENT_URL,
  corsAllowedOrigins: data.CORS_ALLOWED_ORIGINS,
  redisUrl: data.REDIS_URL,

  globalRateLimitMax: data.GLOBAL_RATE_LIMIT_MAX,
  loginBruteForceMax: data.LOGIN_BRUTE_FORCE_MAX,
  loginBruteForceWindowMin: data.LOGIN_BRUTE_FORCE_WINDOW_MIN,
  loginProgressiveBaseMin: data.LOGIN_PROGRESSIVE_BASE_MIN,
  loginProgressiveMaxMin: data.LOGIN_PROGRESSIVE_MAX_MIN,
  authCodeRequestWindowMin: data.AUTH_CODE_REQUEST_WINDOW_MIN,
  authCodeRequestMax: data.AUTH_CODE_REQUEST_MAX,
  authCodeVerifyWindowMin: data.AUTH_CODE_VERIFY_WINDOW_MIN,
  authCodeVerifyMax: data.AUTH_CODE_VERIFY_MAX,
  oauthStateTtlMin: data.OAUTH_STATE_TTL_MIN,

  databaseUrl: data.DATABASE_URL,
  directUrl: data.DIRECT_URL,

  jwtSecret: data.JWT_SECRET,
  jwtExpiresIn: data.JWT_EXPIRES_IN,
  jwtRefreshSecret: data.JWT_REFRESH_SECRET,
  jwtRefreshExpiresIn: data.JWT_REFRESH_EXPIRES_IN,
  jwtIssuer: data.JWT_ISSUER,
  jwtAudience: data.JWT_AUDIENCE,

  googleClientId: data.GOOGLE_CLIENT_ID,
  googleClientSecret: data.GOOGLE_CLIENT_SECRET,
  googleCallbackUrl: data.GOOGLE_CALLBACK_URL,

  resendApiKey: data.RESEND_API_KEY,
  resendFromEmail: data.RESEND_FROM_EMAIL,
  emailVerificationTtlMin: data.EMAIL_VERIFICATION_TTL_MIN,

  supabaseUrl: data.SUPABASE_URL,
  supabaseServiceRoleKey: data.SUPABASE_SERVICE_ROLE_KEY,
  supabaseStorageBucket: data.SUPABASE_STORAGE_BUCKET,
  cronSecret: data.CRON_SECRET,
  sightengineApiUser: data.SIGHTENGINE_API_USER,
  sightengineApiSecret: data.SIGHTENGINE_API_SECRET,

  logLevel: data.LOG_LEVEL,
  enforceHttps,
  sentryDsn: data.SENTRY_DSN,
  otelExporterEndpoint: data.OTEL_EXPORTER_OTLP_ENDPOINT,
  otelServiceName: data.OTEL_SERVICE_NAME,

  openaiApiKey: data.OPENAI_API_KEY,
  openaiModel: data.OPENAI_MODEL ?? "gpt-4o-mini",
};
