-- AlterTable
ALTER TABLE "users" ADD COLUMN     "availableDaysPerWeek" INTEGER,
ADD COLUMN     "onboardingCompletedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "users_onboardingCompletedAt_idx" ON "users"("onboardingCompletedAt");
