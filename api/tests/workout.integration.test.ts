import request from "supertest";
import assert from "node:assert/strict";
import test, { before } from "node:test";
import type { Express } from "express";

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

async function createAuthenticatedOnboardedUser() {
  const email = `workout-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@example.com`;

  await request(app).post("/api/v1/auth/register").send({
    name: "Workout User",
    email,
    password: "Password123!"
  });

  const login = await request(app).post("/api/v1/auth/login").send({
    email,
    password: "Password123!"
  });

  const token = login.body.data.accessToken as string;

  await request(app)
    .post("/api/v1/auth/onboarding/complete")
    .set("Authorization", `Bearer ${token}`)
    .send({
      sex: "FEMALE",
      availableDaysPerWeek: 4
    })
    .expect(200);

  return { token };
}

test("workout endpoints support recommendation/start/complete/history/explore", async () => {
  const { token } = await createAuthenticatedOnboardedUser();

  const recommendations = await request(app)
    .get("/api/v1/workouts/recommendations")
    .set("Authorization", `Bearer ${token}`);

  assert.equal(recommendations.status, 200);
  assert.equal(recommendations.body.data.recommendations.length, 2);

  const start = await request(app)
    .post("/api/v1/workouts/start")
    .set("Authorization", `Bearer ${token}`)
    .send({ notes: "Sessao de teste" });

  assert.equal(start.status, 201);
  assert.equal(start.body.data.status, "IN_PROGRESS");
  const sessionId = start.body.data.id as string;

  const explore = await request(app)
    .get("/api/v1/workouts/explore")
    .set("Authorization", `Bearer ${token}`)
    .query({ page: 1, pageSize: 5 });

  assert.equal(explore.status, 200, JSON.stringify(explore.body));
  assert.ok(explore.body.data.divisionsByDays);
  assert.ok(Array.isArray(explore.body.data.catalog.items));

  const exerciseId = explore.body.data.catalog.items?.[0]?.id as string | undefined;

  const completePayload = exerciseId
    ? {
        durationSec: 1800,
        caloriesBurned: 350,
        exercises: [
          {
            exerciseId,
            setNumber: 1,
            reps: 12,
            weightKg: 20,
            perceivedExertion: 7
          }
        ]
      }
    : {
        durationSec: 1800,
        caloriesBurned: 350
      };

  const complete = await request(app)
    .post(`/api/v1/workouts/${sessionId}/complete`)
    .set("Authorization", `Bearer ${token}`)
    .send(completePayload);

  assert.equal(complete.status, 200);
  assert.equal(complete.body.data.status, "COMPLETED");

  const history = await request(app)
    .get("/api/v1/workouts/history")
    .set("Authorization", `Bearer ${token}`)
    .query({ page: 1, pageSize: 10 });

  assert.equal(history.status, 200);
  assert.ok(history.body.data.total >= 1);
  assert.ok(Array.isArray(history.body.data.items));
  assert.equal(history.body.data.items[0].id, sessionId);
});

test("workout endpoints validate payload and require auth", async () => {
  const unauthorized = await request(app).post("/api/v1/workouts/start").send({});
  assert.equal(unauthorized.status, 401);

  const { token } = await createAuthenticatedOnboardedUser();

  const invalidStart = await request(app)
    .post("/api/v1/workouts/start")
    .set("Authorization", `Bearer ${token}`)
    .send({ notes: "" });

  assert.equal(invalidStart.status, 400);
  assert.equal(invalidStart.body.error.code, "VALIDATION_ERROR");

  const invalidComplete = await request(app)
    .post("/api/v1/workouts/invalid-id/complete")
    .set("Authorization", `Bearer ${token}`)
    .send({ durationSec: 1200 });

  assert.equal(invalidComplete.status, 400);
  assert.equal(invalidComplete.body.error.code, "VALIDATION_ERROR");
});
