# Setup Local: PostgreSQL + Prisma + Env

## 1) Arquivos de ambiente

1. Crie os arquivos a partir dos exemplos:
   - `copy .env.example .env`
   - `copy api\\.env.example api\\.env`
2. Preencha obrigatoriamente no `api/.env`:
   - `DATABASE_URL`
   - `DIRECT_URL`
   - `JWT_SECRET`
   - `JWT_REFRESH_SECRET`
   - `GOOGLE_CLIENT_ID`
   - `GOOGLE_CLIENT_SECRET`
   - `GOOGLE_CALLBACK_URL`

## 2) PostgreSQL local (Docker)

1. Subir banco local:
   - `docker run --name acad-postgres -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=acad_dev -p 5432:5432 -d postgres:16`
2. Verificar se a URL no `api/.env` aponta para `localhost:5432`.

## 3) Prisma

1. Validar schema:
   - `npm run db:validate`
2. Gerar client:
   - `npm run db:generate`
3. Criar/aplicar migração inicial:
   - `npm run db:migrate -- --name init`
4. Popular dados iniciais:
   - `npm run db:seed`
5. (Opcional) abrir Prisma Studio:
   - `npm run db:studio`

## Chaves necessárias por categoria

### JWT
- `JWT_SECRET`
- `JWT_EXPIRES_IN`
- `JWT_REFRESH_SECRET`
- `JWT_REFRESH_EXPIRES_IN`
- `JWT_ISSUER`
- `JWT_AUDIENCE`

### Google OAuth
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_CALLBACK_URL`

### Banco de dados
- `DATABASE_URL`
- `DIRECT_URL`

### Monitoramento e observabilidade
- `LOG_LEVEL`
- `SENTRY_DSN`
- `OTEL_EXPORTER_OTLP_ENDPOINT`
- `OTEL_SERVICE_NAME`
- `VITE_SENTRY_DSN`

## Regras de segurança para `.env`

- Nunca versionar `.env` (somente `.env.example`).
- Usar segredos fortes (>= 32 caracteres) para JWT.
- Não reutilizar secrets entre dev/staging/prod.
- Rotacionar segredos periodicamente e após incidentes.
- Não colocar segredos em variáveis `VITE_` (somente valores publicos no frontend).
- Limitar permissões do usuário de banco (least privilege).
- Revisar logs para garantir que valores de env não sejam impressos.
- Guardar segredos em gerenciador de segredo no deploy (ex.: Doppler, AWS SSM, Vault).

## ⚠️ Rodar testes: `TEST_DATABASE_URL`

A suíte de integração da API (`npm test` / `jest`) sobe o app real com
`supertest` e **escreve no banco de verdade** — cria usuários, treinos e
sessões. Nenhum arquivo de teste importa Prisma diretamente, então o risco não
é óbvio ao ler o código: quem toca o banco é o app por baixo do supertest.

O `tests/jest/setup-env.ts` resolve o banco nesta ordem:

```
TEST_DATABASE_URL  →  DATABASE_URL  →  localhost/acad_dev
```

Ou seja: **se o teu `api/.env` apontar `DATABASE_URL` pra produção e você rodar
`npm test`, os testes escrevem em produção.** Foi o que aconteceu em
12/08/2026 — seis usuários `jest-*@example.com` foram parar no banco real e
precisaram ser removidos à mão. As contas `@example.com` que ainda aparecem
como excluídas são resíduo de execuções antigas.

**Antes de rodar a suíte**, defina `TEST_DATABASE_URL` em `api/.env` apontando
pra um banco **separado** — mesmo formato de `DATABASE_URL`, trocando o nome do
banco (ex.: `acad_test` num Postgres local ou numa branch de teste do Supabase).
Nunca o mesmo banco de `DATABASE_URL`.

Testes **puros** (sem banco) podem rodar a qualquer momento — rode só o arquivo:

```
npx jest --config jest.config.cjs tests/jest/inactive-account-gate.test.ts
```

Ao escrever teste novo, prefira essa forma: extraia a decisão numa função sem
I/O e teste ela. Além de seguro, é mais rápido.
