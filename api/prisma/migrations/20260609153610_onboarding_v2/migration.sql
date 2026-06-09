-- Onboarding profissional v2:
--   • Adiciona heightCm, weightKg, experienceLevel, primaryGoal em User
--   • Cria enum PrimaryGoal
--   • Move dados existentes de onboarding_profiles pra users (cobre quem
--     já tinha algo salvo no model legado, mesmo que o fluxo atual não
--     populasse essa tabela)
--   • Remove tabela onboarding_profiles e enum OnboardingGoal (órfãos)
--
-- Migração ZERO-DOWNTIME: todas as colunas novas são NULL — código
-- antigo continua funcionando sem mudança até o deploy completar.

-- CreateEnum
CREATE TYPE "PrimaryGoal" AS ENUM ('STRENGTH', 'HYPERTROPHY', 'WEIGHT_LOSS', 'ENDURANCE', 'GENERAL_FITNESS');

-- AlterTable
ALTER TABLE "users" ADD COLUMN "heightCm" DOUBLE PRECISION;
ALTER TABLE "users" ADD COLUMN "weightKg" DOUBLE PRECISION;
ALTER TABLE "users" ADD COLUMN "experienceLevel" "ExperienceLevel";
ALTER TABLE "users" ADD COLUMN "primaryGoal" "PrimaryGoal";

-- Backfill — copia dados de onboarding_profiles que possam existir.
-- height/weight: direto. experienceLevel: direto. goal: mapeia
-- OnboardingGoal → PrimaryGoal nos casos compatíveis (FAT_LOSS →
-- WEIGHT_LOSS, MUSCLE_GAIN → HYPERTROPHY). MOBILITY e REHAB não têm
-- equivalente direto — ficam NULL e o user escolhe depois.
UPDATE "users" u
SET
  "heightCm" = op."heightCm",
  "weightKg" = op."weightKg",
  "experienceLevel" = op."experienceLevel",
  "primaryGoal" = CASE
    WHEN op."goal" = 'FAT_LOSS' THEN 'WEIGHT_LOSS'::"PrimaryGoal"
    WHEN op."goal" = 'MUSCLE_GAIN' THEN 'HYPERTROPHY'::"PrimaryGoal"
    WHEN op."goal" = 'ENDURANCE' THEN 'ENDURANCE'::"PrimaryGoal"
    WHEN op."goal" = 'GENERAL_FITNESS' THEN 'GENERAL_FITNESS'::"PrimaryGoal"
    ELSE NULL
  END
FROM "onboarding_profiles" op
WHERE op."userId" = u."id";

-- DropTable
DROP TABLE IF EXISTS "onboarding_profiles";

-- DropEnum
DROP TYPE IF EXISTS "OnboardingGoal";
