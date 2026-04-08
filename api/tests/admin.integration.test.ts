import test, { before } from "node:test";
import assert from "node:assert/strict";
import type { Express } from "express";

import request from "supertest";

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

async function registerAndLogin(emailPrefix: string) {
  const email = `${emailPrefix}-${Date.now()}@example.com`;

  await request(app).post("/api/v1/auth/register").send({
    name: `${emailPrefix} user`,
    email,
    password: "Password123!"
  });

  const login = await request(app).post("/api/v1/auth/login").send({
    email,
    password: "Password123!"
  });

  return {
    email,
    accessToken: login.body.data.accessToken as string
  };
}

test("admin can list registered users", async () => {
  const admin = await registerAndLogin("admin-list-users");

  await prisma.user.update({
    where: { email: admin.email },
    data: { role: "ADMIN" }
  });

  const loginAsAdmin = await request(app).post("/api/v1/auth/login").send({
    email: admin.email,
    password: "Password123!"
  });

  const token = loginAsAdmin.body.data.accessToken as string;

  const response = await request(app)
    .get("/api/v1/admin/users?page=1&pageSize=10")
    .set("Authorization", `Bearer ${token}`);

  assert.equal(response.status, 200);
  assert.ok(response.body.data.total >= 1);
  assert.ok(Array.isArray(response.body.data.items));
  assert.ok(response.body.data.items[0].email);
});

test("non-admin is forbidden from listing users", async () => {
  const user = await registerAndLogin("user-forbidden-users");

  const response = await request(app)
    .get("/api/v1/admin/users")
    .set("Authorization", `Bearer ${user.accessToken}`);

  assert.equal(response.status, 403);
  assert.equal(response.body.error.code, "FORBIDDEN");
});

test("admin listing excludes test users by default", async () => {
  const admin = await registerAndLogin("admin-real-filter");

  await prisma.user.update({
    where: { email: admin.email },
    data: { role: "ADMIN" }
  });

  await request(app).post("/api/v1/auth/register").send({
    name: "Test Pattern User",
    email: `pattern-${Date.now()}@example.com`,
    password: "Password123!"
  });

  const realEmail = `real-${Date.now()}@gmail.com`;
  await request(app).post("/api/v1/auth/register").send({
    name: "Real User",
    email: realEmail,
    password: "Password123!"
  });

  const loginAsAdmin = await request(app).post("/api/v1/auth/login").send({
    email: admin.email,
    password: "Password123!"
  });

  const token = loginAsAdmin.body.data.accessToken as string;

  const response = await request(app)
    .get("/api/v1/admin/users?page=1&pageSize=100")
    .set("Authorization", `Bearer ${token}`);

  assert.equal(response.status, 200);
  const emails = response.body.data.items.map((item: { email: string }) => item.email);
  assert.ok(emails.includes(realEmail));
  assert.ok(!emails.some((email: string) => email.endsWith("@example.com")));
});

test("admin listing can include test users and marks account type", async () => {
  const admin = await registerAndLogin("admin-account-type");

  await prisma.user.update({
    where: { email: admin.email },
    data: { role: "ADMIN" }
  });

  const testEmail = `test-tag-${Date.now()}@example.com`;
  await request(app).post("/api/v1/auth/register").send({
    name: "Tagged Test User",
    email: testEmail,
    password: "Password123!"
  });

  const realEmail = `real-tag-${Date.now()}@outlook.com`;
  await request(app).post("/api/v1/auth/register").send({
    name: "Tagged Real User",
    email: realEmail,
    password: "Password123!"
  });

  const loginAsAdmin = await request(app).post("/api/v1/auth/login").send({
    email: admin.email,
    password: "Password123!"
  });

  const token = loginAsAdmin.body.data.accessToken as string;

  const response = await request(app)
    .get("/api/v1/admin/users?page=1&pageSize=100&includeTest=true")
    .set("Authorization", `Bearer ${token}`);

  assert.equal(response.status, 200);

  const testItem = response.body.data.items.find((item: { email: string }) => item.email === testEmail);
  const realItem = response.body.data.items.find((item: { email: string }) => item.email === realEmail);

  assert.equal(testItem?.accountType, "TEST");
  assert.equal(realItem?.accountType, "REAL");
});

test("admin listing supports registration ordering", async () => {
  const admin = await registerAndLogin("admin-order");

  await prisma.user.update({
    where: { email: admin.email },
    data: { role: "ADMIN" }
  });

  const firstEmail = `ordered-first-${Date.now()}@gmail.com`;
  const secondEmail = `ordered-second-${Date.now()}@gmail.com`;

  await request(app).post("/api/v1/auth/register").send({
    name: "Ordered First",
    email: firstEmail,
    password: "Password123!"
  });

  await request(app).post("/api/v1/auth/register").send({
    name: "Ordered Second",
    email: secondEmail,
    password: "Password123!"
  });

  const baseDate = new Date();

  await prisma.user.update({
    where: { email: firstEmail },
    data: { createdAt: new Date(baseDate.getTime() - 60000) }
  });

  await prisma.user.update({
    where: { email: secondEmail },
    data: { createdAt: new Date(baseDate.getTime() + 60000) }
  });

  const loginAsAdmin = await request(app).post("/api/v1/auth/login").send({
    email: admin.email,
    password: "Password123!"
  });

  const token = loginAsAdmin.body.data.accessToken as string;

  const ascResponse = await request(app)
    .get("/api/v1/admin/users?page=1&pageSize=100&registrationOrder=asc")
    .set("Authorization", `Bearer ${token}`);

  assert.equal(ascResponse.status, 200);

  const ascEmails = ascResponse.body.data.items.map((item: { email: string }) => item.email);
  assert.ok(ascEmails.includes(firstEmail));
  assert.ok(ascEmails.includes(secondEmail));
  assert.ok(ascEmails.indexOf(firstEmail) < ascEmails.indexOf(secondEmail));
});

test("admin can deactivate user account", async () => {
  const admin = await registerAndLogin("admin-deactivate");

  await prisma.user.update({
    where: { email: admin.email },
    data: { role: "ADMIN" }
  });

  const target = await registerAndLogin("target-deactivate");

  const targetUser = await prisma.user.findUnique({
    where: { email: target.email },
    select: { id: true }
  });

  const loginAsAdmin = await request(app).post("/api/v1/auth/login").send({
    email: admin.email,
    password: "Password123!"
  });

  const token = loginAsAdmin.body.data.accessToken as string;

  const deactivate = await request(app)
    .patch(`/api/v1/admin/users/${targetUser?.id}/deactivate`)
    .set("Authorization", `Bearer ${token}`);

  assert.equal(deactivate.status, 200);
  assert.equal(deactivate.body.data.user.status, "DISABLED");

  const loginDisabled = await request(app).post("/api/v1/auth/login").send({
    email: target.email,
    password: "Password123!"
  });

  assert.equal(loginDisabled.status, 401);
});

test("admin can soft delete user account", async () => {
  const admin = await registerAndLogin("admin-delete");

  await prisma.user.update({
    where: { email: admin.email },
    data: { role: "ADMIN" }
  });

  const target = await registerAndLogin("target-delete");

  const targetUser = await prisma.user.findUnique({
    where: { email: target.email },
    select: { id: true }
  });

  const loginAsAdmin = await request(app).post("/api/v1/auth/login").send({
    email: admin.email,
    password: "Password123!"
  });

  const token = loginAsAdmin.body.data.accessToken as string;

  const deletion = await request(app)
    .delete(`/api/v1/admin/users/${targetUser?.id}`)
    .set("Authorization", `Bearer ${token}`);

  assert.equal(deletion.status, 200);
  assert.equal(deletion.body.data.user.isDeleted, true);

  const listResponse = await request(app)
    .get("/api/v1/admin/users?page=1&pageSize=100&includeTest=true")
    .set("Authorization", `Bearer ${token}`);

  const deletedStillVisible = listResponse.body.data.items.some(
    (item: { id: string }) => item.id === targetUser?.id
  );

  assert.equal(deletedStillVisible, false);
});
