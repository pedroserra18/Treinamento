import { test, expect } from "@playwright/test";
import { ensureApiReady, registerTestUser, type TestUser } from "./helpers";

// Fluxo de autenticação real: cria um usuário via API e faz login pela UI.
test.describe("Autenticação", () => {
  let user: TestUser;

  test.beforeAll(async ({ request }) => {
    await ensureApiReady(request);
    user = await registerTestUser(request);
  });

  test("login com credenciais válidas sai da tela de login", async ({ page }) => {
    await page.goto("/login");
    await page.locator('input[type="email"]').fill(user.email);
    await page.locator('input[type="password"]').fill(user.password);
    await page.getByRole("button", { name: "Entrar", exact: true }).click();

    // Login OK → o app redireciona pra dentro (onboarding/dashboard/gate de
    // termos). O invariante estável é: não estamos mais em /login.
    await expect(page).not.toHaveURL(/\/login/, { timeout: 15_000 });
  });

  test("login com senha errada mostra erro e permanece em /login", async ({ page }) => {
    await page.goto("/login");
    await page.locator('input[type="email"]').fill(user.email);
    await page.locator('input[type="password"]').fill("SenhaErrada999!");
    await page.getByRole("button", { name: "Entrar", exact: true }).click();

    await expect(page.locator("p.text-red-500")).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });
});
