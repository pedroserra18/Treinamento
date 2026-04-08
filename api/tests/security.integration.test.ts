import request from "supertest";
import assert from "node:assert/strict";
import test, { before } from "node:test";
import type { Express } from "express";

Object.assign(process.env, {
  NODE_ENV: "test",
  API_PORT: "4001",
  CLIENT_URL: "http://localhost:3000",
  CORS_ALLOWED_ORIGINS: "http://localhost:3000",
  GLOBAL_RATE_LIMIT_MAX: "5",
  LOGIN_BRUTE_FORCE_MAX: "2",
  LOGIN_BRUTE_FORCE_WINDOW_MIN: "15",
  JWT_SECRET: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  JWT_REFRESH_SECRET: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
  GOOGLE_CLIENT_ID: "test-client-id",
  GOOGLE_CLIENT_SECRET: "test-client-secret",
  GOOGLE_CALLBACK_URL: "http://localhost:4001/api/v1/auth/google/callback",
  DATABASE_URL:
    process.env.TEST_DATABASE_URL ??
    process.env.DATABASE_URL ??
    "postgresql://postgres:postgres@localhost:5432/acad_dev?schema=public"
});

let app: Express;

before(async () => {
  const appModule = await import("../src/app");
  app = appModule.app;
});

test("blocks disallowed CORS origin", async () => {
  const response = await request(app).get("/api/v1/health").set("Origin", "http://evil.local");

  assert.equal(response.status, 403);
  assert.equal(response.body.error.code, "CORS_ORIGIN_DENIED");
});

test("applies global rate limit per IP", async () => {
  const agent = request(app);

  await agent.get("/api/v1/health").set("x-forwarded-for", "203.0.113.10").expect(200);
  await agent.get("/api/v1/health").set("x-forwarded-for", "203.0.113.10").expect(200);
  await agent.get("/api/v1/health").set("x-forwarded-for", "203.0.113.10").expect(200);
  await agent.get("/api/v1/health").set("x-forwarded-for", "203.0.113.10").expect(200);
  await agent.get("/api/v1/health").set("x-forwarded-for", "203.0.113.10").expect(200);
  const blocked = await agent.get("/api/v1/health").set("x-forwarded-for", "203.0.113.10");

  assert.equal(blocked.status, 429);
});

test("applies brute-force limiter by IP and email on login", async () => {
  const agent = request(app);
  const payload = { email: "user@example.com", password: "wrongPassword123" };

  await agent
    .post("/api/v1/auth/login")
    .set("x-forwarded-for", "203.0.113.20")
    .send(payload)
    .expect(401);

  await agent
    .post("/api/v1/auth/login")
    .set("x-forwarded-for", "203.0.113.20")
    .send(payload)
    .expect(401);

  const blocked = await agent
    .post("/api/v1/auth/login")
    .set("x-forwarded-for", "203.0.113.20")
    .send(payload);

  assert.equal(blocked.status, 429);
});

test("rejects invalid login payload with zod validation", async () => {
  const response = await request(app)
    .post("/api/v1/auth/login")
    .set("x-forwarded-for", "203.0.113.30")
    .send({ email: "invalid-email", password: "123" });

  assert.equal(response.status, 400);
  assert.equal(response.body.error.code, "VALIDATION_ERROR");
});
