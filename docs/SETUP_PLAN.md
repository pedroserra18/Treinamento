# Setup Inicial do Projeto

## Arquitetura
- Frontend: Vite + React + TypeScript em `frontend-vite/`
- Backend: Express + TypeScript em `api/`
- Banco: PostgreSQL + Prisma (proxima etapa)

## Estrutura principal
- `frontend-vite/src/` para app, pages, services e tipos do frontend
- `api/src/config`, `api/src/modules`, `api/src/middlewares`, `api/src/shared`
- `api/prisma` para schema, migracoes e seed
- `docs/` para guias tecnicos e runbooks

## Convencoes de nomes
- Componentes React: `PascalCase`
- Hooks: `useNomeDoHook`
- Utilitarios: `camelCase`
- Rotas/pastas: `kebab-case`
- Backend por modulo: `*.controller.ts`, `*.service.ts`, `*.routes.ts`, `*.schema.ts`

## Aliases de import
- Front: aliases definidos no `frontend-vite` quando aplicavel
- API: `@/*` mapeando para `api/src`

## Lint e format
- ESLint no front (`frontend-vite/eslint.config.js`)
- Prettier global (`.prettierrc.json`)

## Scripts principais
- `npm run dev:web`
- `npm run dev:api`
- `npm run dev`
- `npm run lint`
- `npm run format`

## Padrao de commit
- Conventional Commits (feat, fix, chore, docs, refactor, test...)
- Exemplo: `feat(auth): adicionar login com jwt`
