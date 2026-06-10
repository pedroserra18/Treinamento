-- Aceite dos Termos/Privacidade no User — colunas opcionais pra existing
-- users não quebrarem (acceptedTermsAt=null vai ser pego pelo
-- TermsAcceptanceGate no frontend, que força aceite na próxima entrada).
ALTER TABLE "users"
  ADD COLUMN "acceptedTermsAt" TIMESTAMP(3),
  ADD COLUMN "acceptedTermsVersion" TEXT;
