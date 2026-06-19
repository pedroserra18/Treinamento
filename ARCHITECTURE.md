# Arquitetura

Visão geral do SerraAthlo + decisões e convenções que não dá pra inferir só
lendo o código.

## Estrutura

```
api/                 Backend Express + Prisma
  src/
    config/          env (validado por Zod), prisma, sentry, redis
    middlewares/     auth, segurança (helmet/cors/rate-limit/sanitize), erros
    modules/         1 pasta por domínio: routes + controller + service + schema
    shared/          utils e serviços transversais (event-log, etc.)
  prisma/            schema + migrations + seed
  tests/             testes de integração (Jest + node:test)

frontend-vite/       Web React + Vite (PWA)
  src/
    pages/           telas (algumas com subpastas, ex.: train/)
    components/      UI compartilhada
    hooks/           hooks reutilizáveis
    lib/             utilitários puros + caches client-side
    services/        chamadas à API (1 arquivo por domínio)
    context/         AuthContext (tokens, usuário)
```

## Backend — padrão por módulo
Cada domínio em `api/src/modules/<x>/` segue 4 camadas:
`routes` (rota + guards + validação Zod) → `controller` (HTTP in/out) →
`service` (regra de negócio + Prisma) → `schema` (Zod + tipos inferidos).

## Segurança (resumo)
- JWT access + refresh (segredos separados, ≥32 chars, validados em prod).
- `helmet`, CORS allowlist (HTTPS obrigatório em prod), rate-limit global +
  brute-force no login, sanitização de input, HPP, body limit.
- Autorização via middlewares: `requireAuth`, `requireAdminRole`,
  `requireCompletedOnboarding`.
- `.env` nunca versionado; validação por Zod recusa placeholders em produção.

## Convenções e decisões (o "porquê")
- **`__PERF__:` em `notes`** — config estruturada por-série (reps/tipo/drop/
  cluster) é encodada como JSON após o marcador `__PERF__:` no campo `notes` do
  plano, pra não mexer no schema. Fonte única: `frontend-vite/src/lib/perf-notes.ts`.
- **`accountType` (REAL/TEST)** — persistido no cadastro (antes era inferido por
  regex no e-mail a cada leitura). Permite paginar/contar no banco e mantém a
  classificação estável. Util: `api/src/shared/utils/account-type.ts`.
- **Planos FREE/PRO/ADMIN** — ADMIN herda PRO em runtime (sem upgrade explícito).
- **Optimistic UI** — ações sociais (curtir/reagir) e CRUD de rotina atualizam a
  UI na hora e sincronizam em background; toggles no backend são idempotentes
  (deleteMany + create com catch de P2002) pra evitar corrida.
- **Editores de rotina** — `CreateRoutineScreen` (criar/editar/enviar, simples:
  reps + tipo) e `WorkoutsPage` (recomendações, rico: carga/RPE/drop/cluster +
  cardio). Mantidos separados de propósito (capacidades diferentes).
- **Notificações** — deep-link derivado de `type` + `metadata`
  (`notificationLink`); push trata `notificationclick` no service worker.

## Deploy
- **Web:** Vercel (branch de produção: `feat/feed-history-redesign-rpe`).
- **API:** Render (`start:prod` roda `prisma migrate deploy` antes do boot, então
  migrations aplicam sozinhas no deploy). Config em [render.yaml](render.yaml).
- Mudança só de frontend → sobe na Vercel; mudança de backend/schema → exige
  deploy do Render.

## Testes & CI
- API: `npm --prefix api test` (Jest, `api/tests/jest/`).
- Web: `npm --prefix frontend-vite test` (Vitest, `*.test.ts`).
- CI: [.github/workflows/ci.yml](.github/workflows/ci.yml).
