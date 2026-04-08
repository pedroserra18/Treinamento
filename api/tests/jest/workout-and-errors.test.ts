import request from "supertest";
import type { Express } from "express";

let app: Express;

beforeAll(async () => {
  const appModule = await import("../../src/app");
  app = appModule.app;
});

async function createOnboardedUserToken() {
  const email = `jest-workout-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@example.com`;

  await request(app).post("/api/v1/auth/register").send({
    name: "Jest Workout User",
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
    .send({ sex: "MALE", availableDaysPerWeek: 4 })
    .expect(200);

  return token;
}

describe("Workout + Error Scenarios", () => {
  test("start and complete workout session", async () => {
    const token = await createOnboardedUserToken();

    const start = await request(app)
      .post("/api/v1/workouts/start")
      .set("Authorization", `Bearer ${token}`)
      .send({ notes: "Treino de teste com Jest" });

    expect(start.status).toBe(201);
    expect(start.body.data.status).toBe("IN_PROGRESS");

    const sessionId = start.body.data.id as string;

    const complete = await request(app)
      .post(`/api/v1/workouts/${sessionId}/complete`)
      .set("Authorization", `Bearer ${token}`)
      .send({ durationSec: 1500, caloriesBurned: 300 });

    expect(complete.status).toBe(200);
    expect(complete.body.data.status).toBe("COMPLETED");
  });

  test("returns validation and auth errors for invalid workout operations", async () => {
    const unauthorized = await request(app).post("/api/v1/workouts/start").send({ notes: "abc" });
    expect(unauthorized.status).toBe(401);

    const token = await createOnboardedUserToken();

    const invalidStart = await request(app)
      .post("/api/v1/workouts/start")
      .set("Authorization", `Bearer ${token}`)
      .send({ notes: "" });

    expect(invalidStart.status).toBe(400);
    expect(invalidStart.body.error.code).toBe("VALIDATION_ERROR");

    const invalidComplete = await request(app)
      .post("/api/v1/workouts/not-a-valid-id/complete")
      .set("Authorization", `Bearer ${token}`)
      .send({ durationSec: 1000 });

    expect(invalidComplete.status).toBe(400);
    expect(invalidComplete.body.error.code).toBe("VALIDATION_ERROR");
  });
});