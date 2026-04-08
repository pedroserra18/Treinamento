import request from "supertest";
import assert from "node:assert/strict";
import test, { before } from "node:test";
import type { Express } from "express";
import { prisma } from "../src/config/prisma";

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

test("exercise listing and detail expose thumbnailUrl and videoUrl", async () => {
  const slug = `exercise-media-${Date.now()}`;

  const exercise = await prisma.exercise.create({
    data: {
      slug,
      name: "Exercicio Midia Teste",
      scope: "GLOBAL",
      primaryMuscleGroup: "CHEST",
      equipment: "Dumbbell",
      difficulty: "BEGINNER",
      thumbnailUrl: "https://cdn.example.com/thumb.jpg",
      videoUrl: "https://cdn.example.com/video.mp4",
      isActive: true
    }
  });

  const listResponse = await request(app).get("/api/v1/exercises");
  assert.equal(listResponse.status, 200);

  const listed = listResponse.body.data.find((item: { id: string }) => item.id === exercise.id);
  assert.ok(listed);
  assert.equal(listed.thumbnailUrl, "https://cdn.example.com/thumb.jpg");
  assert.equal(listed.videoUrl, "https://cdn.example.com/video.mp4");

  const detailResponse = await request(app).get(`/api/v1/exercises/${exercise.id}`);
  assert.equal(detailResponse.status, 200);
  assert.equal(detailResponse.body.data.id, exercise.id);
  assert.equal(detailResponse.body.data.thumbnailUrl, "https://cdn.example.com/thumb.jpg");
  assert.equal(detailResponse.body.data.videoUrl, "https://cdn.example.com/video.mp4");

  await prisma.exercise.delete({ where: { id: exercise.id } });
});
