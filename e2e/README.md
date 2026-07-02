# E2E (Playwright)

Testes ponta-a-ponta que dirigem o app real (frontend + API + banco) num navegador.

## Rodar

```bash
npm run dev        # sobe front (3000) + API (4000) — em outro terminal
npm run test:e2e   # roda os testes (reutiliza o dev server se já estiver de pé)
```

- `npm run test:e2e:ui` — modo interativo do Playwright.
- `npm run test:e2e:report` — abre o relatório HTML do último run.

Não precisa subir o app à mão: o `playwright.config.ts` sobe o `npm run dev`
sozinho se não houver nada rodando (`reuseExistingServer`).

## Cobertura atual

- `smoke.spec.ts` — UI pública: a tela de login renderiza e a navegação básica funciona.
- `auth.spec.ts` — login real: cria um usuário via `POST /auth/register` e loga
  pela UI (sucesso e senha errada).

## Notas

- O usuário de teste é criado pelo endpoint direto de registro (sem código de
  e-mail), o mesmo caminho dos testes de integração. Ver `helpers.ts`.
- Artefatos (`test-results/`, `playwright-report/`) são ignorados no git.
- Ainda **não roda no CI** — precisa de Postgres + stack completa + browser no
  runner. É o próximo passo natural (job dedicado), quando quiser.
