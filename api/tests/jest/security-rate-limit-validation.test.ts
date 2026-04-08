import request from "supertest";
import type { Express } from "express";

let app: Express;

beforeAll(async () => {
  process.env.GLOBAL_RATE_LIMIT_MAX = "5";
  process.env.LOGIN_BRUTE_FORCE_MAX = "2";

  const appModule = await import("../../src/app");
  app = appModule.app;
});

describe("Security: rate limit and input validation", () => {
  test("applies global rate limit per IP", async () => {
    const agent = request(app);
    const ip = "203.0.113.101";

    await agent.get("/api/v1/health").set("x-forwarded-for", ip).expect(200);
    await agent.get("/api/v1/health").set("x-forwarded-for", ip).expect(200);
    await agent.get("/api/v1/health").set("x-forwarded-for", ip).expect(200);
    await agent.get("/api/v1/health").set("x-forwarded-for", ip).expect(200);
    await agent.get("/api/v1/health").set("x-forwarded-for", ip).expect(200);

    const blocked = await agent.get("/api/v1/health").set("x-forwarded-for", ip);

    expect(blocked.status).toBe(429);
  });

  test("rejects invalid login payload", async () => {
    const response = await request(app)
      .post("/api/v1/auth/login")
      .set("x-forwarded-for", "203.0.113.102")
      .send({ email: "invalid-email", password: "123" });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
  });
});