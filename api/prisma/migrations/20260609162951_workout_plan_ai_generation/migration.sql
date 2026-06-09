-- Adiciona aiGenerationId + aiGenerationLabel em workout_plans pra agrupar
-- planos criados na mesma geração de IA (ex.: FB 3x = 3 planos com mesmo id).
-- Zero-downtime: ambos NULL — código antigo continua funcionando.

-- AlterTable
ALTER TABLE "workout_plans" ADD COLUMN "aiGenerationId" TEXT;
ALTER TABLE "workout_plans" ADD COLUMN "aiGenerationLabel" TEXT;

-- CreateIndex
-- Hot path do endpoint /workouts/plans/ai/recent: filtra por (userId,
-- aiGenerationId not null), ordena por createdAt desc.
CREATE INDEX "workout_plans_userId_aiGenerationId_createdAt_idx" ON "workout_plans"("userId", "aiGenerationId", "createdAt");
