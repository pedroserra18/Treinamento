import { test, expect } from "@playwright/test";

// Smoke da UI pública (não precisa de backend autenticado): garante que o app
// sobe, a tela de login renderiza e a navegação básica funciona.
test.describe("Smoke — UI pública", () => {
  test("tela de login renderiza os elementos principais", async ({ page }) => {
    await page.goto("/login");

    await expect(page.getByRole("heading", { name: "Entrar" })).toBeVisible();
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();
    await expect(page.getByRole("button", { name: "Entrar", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: /Continuar com Google/ })).toBeVisible();
    await expect(page.getByRole("link", { name: "Criar conta" })).toBeVisible();
  });

  test("navega de login para a criação de conta", async ({ page }) => {
    await page.goto("/login");
    await page.getByRole("link", { name: "Criar conta" }).click();
    await expect(page).toHaveURL(/\/register/);
  });
});
