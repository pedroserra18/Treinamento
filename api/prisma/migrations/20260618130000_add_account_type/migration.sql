-- Classificação real vs teste persistida (antes inferida por regex no e-mail a
-- cada leitura). Enum + coluna (default REAL) + backfill que replica FIELMENTE
-- a função classifyAccountType/isTestAccountByEmail, pra NÃO reclassificar a
-- base existente. Índice pra paginação/contagem por tipo no banco.
CREATE TYPE "AccountType" AS ENUM ('REAL', 'TEST');

ALTER TABLE "users" ADD COLUMN "accountType" "AccountType" NOT NULL DEFAULT 'REAL';

-- Backfill: TEST quando o e-mail bate com algum padrão de conta de teste.
-- split_part(lower(email),'@',1) = parte local (antes do @), sempre minúscula.
UPDATE "users" SET "accountType" = 'TEST'
WHERE lower(email) LIKE '%@example.com'
   OR lower(email) LIKE '%@local.dev'
   OR split_part(lower(email), '@', 1) LIKE 'test%'
   OR split_part(lower(email), '@', 1) LIKE 'teste%'
   OR split_part(lower(email), '@', 1) LIKE 'qa%'
   OR split_part(lower(email), '@', 1) LIKE 'mock%'
   OR split_part(lower(email), '@', 1) LIKE 'demo%'
   OR split_part(lower(email), '@', 1) LIKE 'seed%'
   OR split_part(lower(email), '@', 1) LIKE 'tmp%'
   OR split_part(lower(email), '@', 1) LIKE 'temp%'
   OR split_part(lower(email), '@', 1) LIKE 'fake%'
   OR split_part(lower(email), '@', 1) LIKE 'recover%'
   OR split_part(lower(email), '@', 1) LIKE 'authcheck%'
   OR split_part(lower(email), '@', 1) LIKE 'logincheck%'
   OR split_part(lower(email), '@', 1) LIKE 'cadastro.teste%'
   OR split_part(lower(email), '@', 1) LIKE '%.teste%'
   OR split_part(lower(email), '@', 1) LIKE '%.test%'
   OR split_part(lower(email), '@', 1) ~ '^[a-z0-9-]+-\d{10,}(-[a-z0-9]{3,8})?$';

CREATE INDEX "users_accountType_createdAt_idx" ON "users"("accountType", "createdAt");
