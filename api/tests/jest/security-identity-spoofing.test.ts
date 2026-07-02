import request from "supertest";
import type { Express } from "express";

// Regressão da falha de impersonação por header (Etapa 0 do plano de
// hardening). Antes do fix, o request-context.middleware populava
// `req.context.userId` / `userRole` a partir dos headers `x-user-id` /
// `x-user-role` enviados pelo cliente. Em rotas com `optionalAuth` (sem
// Bearer obrigatório) isso permitia que qualquer chamador se passasse por
// outro usuário — bastava saber o id da vítima (que aparece no feed/perfil
// público) e mandar `x-user-id: <vitima>` sem token para o backend tratar a
// requisição como se fosse a própria vítima (isSelf), devolvendo até posts
// PRIVATE. O fix: identidade vem só do JWT verificado.

let app: Express;

async function registerAndLogin() {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const email = `jest-spoof-${suffix}@example.com`;
  const password = "Password123!";

  await request(app).post("/api/v1/auth/register").send({
    name: "Jest Spoof User",
    handle: `jsp${Date.now()}${Math.floor(Math.random() * 100000)}`,
    email,
    password
  });

  const login = await request(app).post("/api/v1/auth/login").send({ email, password });

  return {
    token: login.body.data.accessToken as string,
    userId: login.body.data.user.id as string
  };
}

beforeAll(async () => {
  const appModule = await import("../../src/app");
  app = appModule.app;
});

describe("Security: identity cannot be spoofed via client headers", () => {
  test("forged x-user-id header does NOT grant self-view on optionalAuth routes", async () => {
    const victim = await registerAndLogin();

    const privateCaption = `segredo-${Date.now()}`;
    const created = await request(app)
      .post("/api/v1/social/posts")
      .set("Authorization", `Bearer ${victim.token}`)
      .send({ caption: privateCaption, privacy: "PRIVATE" });

    expect(created.status).toBe(201);

    // Ataque: sem Bearer, forjando o header de identidade da vítima.
    const attack = await request(app)
      .get(`/api/v1/social/users/${victim.userId}/posts`)
      .set("x-user-id", victim.userId);

    expect(attack.status).toBe(200);
    const captions = (attack.body.data as Array<{ caption: string | null }>).map((p) => p.caption);
    expect(captions).not.toContain(privateCaption);

    // Controle: o dono real (com Bearer válido) continua vendo o post PRIVATE.
    const owner = await request(app)
      .get(`/api/v1/social/users/${victim.userId}/posts`)
      .set("Authorization", `Bearer ${victim.token}`);

    expect(owner.status).toBe(200);
    const ownerCaptions = (owner.body.data as Array<{ caption: string | null }>).map((p) => p.caption);
    expect(ownerCaptions).toContain(privateCaption);
  });

  test("forged x-user-role header does NOT grant admin access", async () => {
    const user = await registerAndLogin();

    // Sem token, só o header de role forjado → precisa ser barrado (401).
    const anonWithRole = await request(app)
      .get("/api/v1/admin/users")
      .set("x-user-role", "ADMIN")
      .set("x-user-id", user.userId);
    expect(anonWithRole.status).toBe(401);

    // Com token de usuário comum + header de role forjado → 403 (role vem do
    // JWT, não do header).
    const userWithForgedRole = await request(app)
      .get("/api/v1/admin/users")
      .set("Authorization", `Bearer ${user.token}`)
      .set("x-user-role", "ADMIN");
    expect(userWithForgedRole.status).toBe(403);
  });
});
