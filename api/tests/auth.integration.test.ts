import test, { before } from "node:test";
import assert from "node:assert/strict";
import type { Express } from "express";

import request from "supertest";

Object.assign(process.env, {
  NODE_ENV: "test",
  API_PORT: "4002",
  CLIENT_URL: "http://localhost:3000",
  CORS_ALLOWED_ORIGINS: "http://localhost:3000",
  GLOBAL_RATE_LIMIT_MAX: "500",
  LOGIN_BRUTE_FORCE_MAX: "50",
  LOGIN_BRUTE_FORCE_WINDOW_MIN: "15",
  LOGIN_PROGRESSIVE_BASE_MIN: "1",
  LOGIN_PROGRESSIVE_MAX_MIN: "5",
  JWT_SECRET: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  JWT_REFRESH_SECRET: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
  GOOGLE_CLIENT_ID: "test-client-id",
  GOOGLE_CLIENT_SECRET: "test-client-secret",
  GOOGLE_CALLBACK_URL: "http://localhost:4002/api/v1/auth/google/callback",
  DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/acad_dev?schema=public"
});

let app: Express;

before(async () => {
  const appModule = await import("../src/app");
  app = appModule.app;
});

test("register creates user and returns token pair", async () => {
  const email = `register-${Date.now()}@example.com`;

  const response = await request(app).post("/api/v1/auth/register").send({
    name: "Auth User",
    email,
    password: "Password123!"
  });

  assert.equal(response.status, 201);
  assert.equal(response.body.data.user.email, email);
  assert.equal(response.body.data.user.sex, "OTHER");
  assert.equal(response.body.data.user.onboardingCompleted, false);
  assert.ok(response.body.data.accessToken);
  assert.ok(response.body.data.refreshToken);
});

test("login returns access and refresh tokens", async () => {
  const email = `login-${Date.now()}@example.com`;

  await request(app).post("/api/v1/auth/register").send({
    name: "Login User",
    email,
    password: "Password123!"
  });

  const login = await request(app).post("/api/v1/auth/login").send({
    email,
    password: "Password123!"
  });

  assert.equal(login.status, 200);
  assert.ok(login.body.data.accessToken);
  assert.ok(login.body.data.refreshToken);
  assert.equal(login.body.data.user.email, email);
});

test("authenticated profile requires bearer token", async () => {
  const unauthorized = await request(app).get("/api/v1/auth/profile");
  assert.equal(unauthorized.status, 401);

  const email = `profile-${Date.now()}@example.com`;
  await request(app).post("/api/v1/auth/register").send({
    name: "Profile User",
    email,
    password: "Password123!"
  });

  const login = await request(app).post("/api/v1/auth/login").send({
    email,
    password: "Password123!"
  });

  const authorized = await request(app)
    .get("/api/v1/auth/profile")
    .set("Authorization", `Bearer ${login.body.data.accessToken}`);

  assert.equal(authorized.status, 200);
  assert.equal(authorized.body.data.email, email);
});

test("refresh rotates refresh token and invalidates previous one", async () => {
  const email = `refresh-${Date.now()}@example.com`;
  await request(app).post("/api/v1/auth/register").send({
    name: "Refresh User",
    email,
    password: "Password123!"
  });

  const login = await request(app).post("/api/v1/auth/login").send({
    email,
    password: "Password123!"
  });

  const originalRefresh = login.body.data.refreshToken;

  const refreshed = await request(app).post("/api/v1/auth/refresh").send({
    refreshToken: originalRefresh
  });

  assert.equal(refreshed.status, 200);
  assert.ok(refreshed.body.data.refreshToken);
  assert.notEqual(refreshed.body.data.refreshToken, originalRefresh);

  const oldRefreshReuse = await request(app).post("/api/v1/auth/refresh").send({
    refreshToken: originalRefresh
  });

  assert.equal(oldRefreshReuse.status, 401);
});

test("logout revokes refresh session", async () => {
  const email = `logout-${Date.now()}@example.com`;
  await request(app).post("/api/v1/auth/register").send({
    name: "Logout User",
    email,
    password: "Password123!"
  });

  const login = await request(app).post("/api/v1/auth/login").send({
    email,
    password: "Password123!"
  });

  const accessToken = login.body.data.accessToken;
  const refreshToken = login.body.data.refreshToken;

  const logout = await request(app)
    .post("/api/v1/auth/logout")
    .set("Authorization", `Bearer ${accessToken}`);

  assert.equal(logout.status, 200);

  const refreshAfterLogout = await request(app).post("/api/v1/auth/refresh").send({
    refreshToken
  });

  assert.equal(refreshAfterLogout.status, 401);
});

test("progressive lockout triggers after repeated failed login attempts", async () => {
  const email = `lockout-${Date.now()}@example.com`;
  await request(app).post("/api/v1/auth/register").send({
    name: "Lockout User",
    email,
    password: "Password123!"
  });

  await request(app).post("/api/v1/auth/login").send({ email, password: "wrong-pass-1" }).expect(401);
  await request(app).post("/api/v1/auth/login").send({ email, password: "wrong-pass-2" }).expect(401);
  await request(app).post("/api/v1/auth/login").send({ email, password: "wrong-pass-3" }).expect(401);

  const locked = await request(app).post("/api/v1/auth/login").send({
    email,
    password: "Password123!"
  });

  assert.equal(locked.status, 423);
  assert.equal(locked.body.error.code, "ACCOUNT_LOCKED");
});

test("dashboard is blocked until onboarding is completed", async () => {
  const email = `onboarding-${Date.now()}@example.com`;

  await request(app).post("/api/v1/auth/register").send({
    name: "Onboarding User",
    email,
    password: "Password123!"
  });

  const login = await request(app).post("/api/v1/auth/login").send({
    email,
    password: "Password123!"
  });

  const accessToken = login.body.data.accessToken;

  const blocked = await request(app)
    .get("/api/v1/dashboard/summary")
    .set("Authorization", `Bearer ${accessToken}`);

  assert.equal(blocked.status, 403);
  assert.equal(blocked.body.error.code, "ONBOARDING_REQUIRED");

  const completed = await request(app)
    .post("/api/v1/auth/onboarding/complete")
    .set("Authorization", `Bearer ${accessToken}`)
    .send({
      sex: "FEMALE",
      availableDaysPerWeek: 5
    });

  assert.equal(completed.status, 200);
  assert.equal(completed.body.data.user.sex, "FEMALE");
  assert.equal(completed.body.data.user.availableDaysPerWeek, 5);
  assert.equal(completed.body.data.user.onboardingCompleted, true);

  const unlocked = await request(app)
    .get("/api/v1/dashboard/summary")
    .set("Authorization", `Bearer ${accessToken}`);

  assert.equal(unlocked.status, 200);
});
