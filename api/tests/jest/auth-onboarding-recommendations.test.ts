import request from "supertest";
import type { Express } from "express";

let app: Express;

beforeAll(async () => {
  const appModule = await import("../../src/app");
  app = appModule.app;
});

describe("Auth + Onboarding + Recommendations", () => {
  test("register/login/profile flow works", async () => {
    const email = `jest-auth-${Date.now()}@example.com`;

    const register = await request(app).post("/api/v1/auth/register").send({
      name: "Jest Auth User",
      email,
      password: "Password123!"
    });

    expect(register.status).toBe(201);
    expect(register.body.data.user.email).toBe(email);
    expect(register.body.data.accessToken).toBeTruthy();

    const login = await request(app).post("/api/v1/auth/login").send({
      email,
      password: "Password123!"
    });

    expect(login.status).toBe(200);
    expect(login.body.data.accessToken).toBeTruthy();

    const profile = await request(app)
      .get("/api/v1/auth/profile")
      .set("Authorization", `Bearer ${login.body.data.accessToken}`);

    expect(profile.status).toBe(200);
    expect(profile.body.data.email).toBe(email);
  });

  test("onboarding blocks then unlocks protected recommendation route", async () => {
    const email = `jest-onboarding-${Date.now()}@example.com`;

    await request(app).post("/api/v1/auth/register").send({
      name: "Jest Onboarding User",
      email,
      password: "Password123!"
    });

    const login = await request(app).post("/api/v1/auth/login").send({
      email,
      password: "Password123!"
    });

    const token = login.body.data.accessToken as string;

    const blockedRecommendations = await request(app)
      .get("/api/v1/recommendations/workout")
      .set("Authorization", `Bearer ${token}`);

    expect(blockedRecommendations.status).toBe(403);
    expect(blockedRecommendations.body.error.code).toBe("ONBOARDING_REQUIRED");

    const completeOnboarding = await request(app)
      .post("/api/v1/auth/onboarding/complete")
      .set("Authorization", `Bearer ${token}`)
      .send({ sex: "FEMALE", availableDaysPerWeek: 5 });

    expect(completeOnboarding.status).toBe(200);
    expect(completeOnboarding.body.data.user.onboardingCompleted).toBe(true);

    const allowedRecommendations = await request(app)
      .get("/api/v1/recommendations/workout")
      .set("Authorization", `Bearer ${token}`);

    expect(allowedRecommendations.status).toBe(200);
    expect(Array.isArray(allowedRecommendations.body.data.recommendations)).toBe(true);
    expect(allowedRecommendations.body.data.recommendations.length).toBe(2);
  });
});