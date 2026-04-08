Object.assign(process.env, {
  NODE_ENV: "test",
  API_PORT: "4002",
  CLIENT_URL: "http://localhost:3000",
  CORS_ALLOWED_ORIGINS: "http://localhost:3000",
  GLOBAL_RATE_LIMIT_MAX: process.env.GLOBAL_RATE_LIMIT_MAX ?? "500",
  LOGIN_BRUTE_FORCE_MAX: process.env.LOGIN_BRUTE_FORCE_MAX ?? "50",
  LOGIN_BRUTE_FORCE_WINDOW_MIN: process.env.LOGIN_BRUTE_FORCE_WINDOW_MIN ?? "15",
  LOGIN_PROGRESSIVE_BASE_MIN: process.env.LOGIN_PROGRESSIVE_BASE_MIN ?? "1",
  LOGIN_PROGRESSIVE_MAX_MIN: process.env.LOGIN_PROGRESSIVE_MAX_MIN ?? "5",
  JWT_SECRET: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  JWT_REFRESH_SECRET: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
  GOOGLE_CLIENT_ID: "test-client-id",
  GOOGLE_CLIENT_SECRET: "test-client-secret",
  GOOGLE_CALLBACK_URL: "http://localhost:4002/api/v1/auth/google/callback",
  DATABASE_URL:
    process.env.TEST_DATABASE_URL ??
    process.env.DATABASE_URL ??
    "postgresql://postgres:postgres@localhost:5432/acad_dev?schema=public"
});