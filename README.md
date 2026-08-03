# SerraAthlo

App de treino (PT-BR): rotinas, treino ao vivo com cronômetros, progresso/PRs,
feed social, desafios, IA de treinos, planos FREE/PRO e painel admin.

Monorepo: **API** (Express + Prisma + Postgres) + **Web** (React 19 + Vite + TS,
PWA instalável). Deploy: Web na Vercel, API no Render.

## Stack
- **Backend:** Node/Express, Prisma ORM, Postgres, Zod (validação), JWT (access +
  refresh), bcrypt, helmet, rate-limit, Sentry.
- **Frontend:** React 19, Vite, TypeScript (strict), Tailwind v4, React Query,
  framer-motion, react-router, vite-plugin-pwa.

## Como rodar (local)
Pré-requisitos: Node 20+, Postgres. Detalhes em [docs/LOCAL_ENV_SETUP.md](docs/LOCAL_ENV_SETUP.md).

```bash
# 1. Variáveis de ambiente (copie e preencha)
cp api/.env.example api/.env
cp frontend-vite/.env.example frontend-vite/.env

# 2. Instalar deps
npm install --prefix api && npm install --prefix frontend-vite

# 3. Banco (gera client + aplica migrations + seed)
npm --prefix api run prisma:generate
npm --prefix api run prisma:migrate:dev
npm --prefix api run prisma:seed

# 4. Subir tudo (web + api)
npm run dev
```

## Scripts úteis (raiz)
| Comando | O quê |
|---|---|
| `npm run dev` | Web + API em paralelo |
| `npm run build` | Build de web e api |
| `npm run lint` | ESLint (web + api) |
| `npm run typecheck` | TypeScript (web + api) |
| `npm test` | Testes de integração da API (Jest) |

Frontend: `npm --prefix frontend-vite test` (Vitest).

## Qualidade
- **TypeScript strict** nos dois lados; ESLint com plugins custom em
  [eslint-plugins/](eslint-plugins/); commits validados por commitlint + husky.
- **Testes:** API com Jest (integração, em `api/tests/`); Web com Vitest
  (`*.test.ts`).
- **CI:** [.github/workflows/ci.yml](.github/workflows/ci.yml) roda lint +
  typecheck + build + testes em todo push/PR (com Postgres pros testes da API).

## Arquitetura
- Visão geral, decisões e convenções em [ARCHITECTURE.md](ARCHITECTURE.md).
- **Mapa do código** (onde cada coisa mora e como se conecta) em [docs/CODE_MAP.md](docs/CODE_MAP.md) — comece por aqui pra se localizar no projeto.
