-- Histórico INDEPENDENTE de planos da IA — separado de workout_plans pra
-- "Rotinas" só conter o que o user curou. Auto-salvo na geração.

-- CreateTable
CREATE TABLE "ai_generated_plans" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "generationId" TEXT NOT NULL,
    "generationLabel" TEXT NOT NULL,
    "dayLabel" TEXT NOT NULL,
    "dayIndex" INTEGER NOT NULL,
    "planName" TEXT NOT NULL,
    "planSnapshot" JSONB NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_generated_plans_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ai_generated_plans_userId_generatedAt_idx" ON "ai_generated_plans"("userId", "generatedAt");

-- CreateIndex
CREATE INDEX "ai_generated_plans_userId_generationId_idx" ON "ai_generated_plans"("userId", "generationId");

-- AddForeignKey
ALTER TABLE "ai_generated_plans" ADD CONSTRAINT "ai_generated_plans_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
