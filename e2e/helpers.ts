import type { APIRequestContext } from "@playwright/test";

export const API_URL = process.env.E2E_API_URL ?? "http://localhost:4000";

export type TestUser = {
  name: string;
  handle: string;
  email: string;
  password: string;
};

// Espera a API responder /health antes dos testes que dependem dela. O
// `npm run dev` sobe front e API em paralelo; a API costuma demorar mais.
export async function ensureApiReady(request: APIRequestContext, attempts = 40): Promise<void> {
  for (let i = 0; i < attempts; i += 1) {
    try {
      const res = await request.get(`${API_URL}/api/v1/health`);
      if (res.ok()) return;
    } catch {
      // ainda subindo
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(`API não respondeu em ${API_URL}/api/v1/health`);
}

// Cria um usuário real via o endpoint direto de registro (mesmo caminho usado
// pelos testes de integração — não exige código de verificação por e-mail).
// Retorna as credenciais para o teste logar pela UI.
export async function registerTestUser(request: APIRequestContext): Promise<TestUser> {
  const stamp = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const user: TestUser = {
    name: "E2E User",
    handle: `e2e${stamp}`,
    email: `e2e-${stamp}@example.com`,
    password: "Password123!"
  };

  const res = await request.post(`${API_URL}/api/v1/auth/register`, { data: user });
  if (!res.ok()) {
    throw new Error(`Falha ao registrar usuário de teste (${res.status()}): ${await res.text()}`);
  }

  return user;
}
