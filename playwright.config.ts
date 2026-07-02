import { defineConfig, devices } from "@playwright/test";

// E2E do SerraAthlo. Roda o app completo (frontend na 3000 + API na 4000 + DB)
// e dirige o navegador nos fluxos críticos. Local: usa o `npm run dev` já
// rodando (reuseExistingServer) ou sobe um. A API é validada antes dos testes
// que dependem dela (ver e2e/helpers.ts → ensureApiReady).
const WEB_URL = process.env.E2E_WEB_URL ?? "http://localhost:3000";

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: WEB_URL,
    trace: "on-first-retry",
    screenshot: "only-on-failure"
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run dev",
    url: WEB_URL,
    reuseExistingServer: true,
    timeout: 120_000
  }
});
