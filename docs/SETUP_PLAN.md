# Setup Inicial do Projeto

## Arquitetura
- Frontend: Next.js na raiz
- Backend: Express + TypeScript em `api/`
- Banco: PostgreSQL + Prisma (proxima etapa)

## Estrutura principal
- `app/`, `components/`, `hooks/`, `lib/`, `services/`, `types/`
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
- Front: `@/*` mapeando para raiz do projeto
- API: `@/*` mapeando para `api/src`

## Lint e format
- ESLint no front (`.eslintrc.cjs`)
- ESLint na API (`api/.eslintrc.cjs`)
- Prettier global (`.prettierrc.json`)

## Scripts principais
- `npm run dev:web`
- `npm run dev:api`
- `npm run dev:full`
- `npm run typecheck`
- `npm run lint`
- `npm run format`

## Padrao de commit
- Conventional Commits (feat, fix, chore, docs, refactor, test...)
- Exemplo: `feat(auth): adicionar login com jwt`
