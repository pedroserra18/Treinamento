# API (Express + TypeScript)

## Run locally

1. Install dependencies:
   npm install
2. Create env file:
   copy .env.example .env
3. Start dev server:
   npm run dev

Server default: http://localhost:4000
Health route: /api/v1/health

## PostgreSQL + Prisma (local)

1. Start PostgreSQL (Docker):
   docker run --name acad-postgres -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=acad_dev -p 5432:5432 -d postgres:16
2. Keep `DATABASE_URL` and `DIRECT_URL` in `.env` pointing to local DB.
3. Validate Prisma schema:
   npm run prisma:validate
4. Generate Prisma Client:
   npm run prisma:generate
5. Create first migration:
   npm run prisma:migrate:dev -- --name init
6. (Optional) Open Prisma Studio:
   npm run prisma:studio

## Required env keys

- Database: `DATABASE_URL`, `DIRECT_URL`
- JWT: `JWT_SECRET`, `JWT_EXPIRES_IN`, `JWT_REFRESH_SECRET`, `JWT_REFRESH_EXPIRES_IN`, `JWT_ISSUER`, `JWT_AUDIENCE`
- Google OAuth: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_CALLBACK_URL`
- Monitoring: `LOG_LEVEL`, `SENTRY_DSN`, `OTEL_EXPORTER_OTLP_ENDPOINT`, `OTEL_SERVICE_NAME`

## .env security rules

- Never commit `.env` files to Git.
- Use high-entropy secrets (minimum 32 chars) for JWT keys.
- Use different secrets/credentials by environment (`development`, `staging`, `production`).
- Rotate JWT/OAuth/client secrets periodically and after any incident.
- Restrict database user permissions (principle of least privilege).
- Only expose safe vars to frontend via `NEXT_PUBLIC_*` prefix.
- Keep only placeholders in `.env.example` (no real tokens).
