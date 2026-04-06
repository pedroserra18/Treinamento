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
- `NEXT_PUBLIC_SENTRY_DSN`

## Regras de segurança para `.env`

- Nunca versionar `.env` (somente `.env.example`).
- Usar segredos fortes (>= 32 caracteres) para JWT.
- Não reutilizar secrets entre dev/staging/prod.
- Rotacionar segredos periodicamente e após incidentes.
- Não colocar segredos com prefixo `NEXT_PUBLIC_`.
- Limitar permissões do usuário de banco (least privilege).
- Revisar logs para garantir que valores de env não sejam impressos.
- Guardar segredos em gerenciador de segredo no deploy (ex.: Doppler, AWS SSM, Vault).
