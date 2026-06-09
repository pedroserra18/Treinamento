-- Tier comercial USER/PRO + invites + log de subscription. Zero-downtime:
-- todos os defaults compatíveis com código antigo (FREE / 0 / nulls).

-- CreateEnum
CREATE TYPE "PlanTier" AS ENUM ('FREE', 'PRO');
CREATE TYPE "SubscriptionSource" AS ENUM ('DEFAULT', 'ADMIN_LINK', 'PAYMENT', 'GIFT');

-- AlterTable
ALTER TABLE "users" ADD COLUMN "plan" "PlanTier" NOT NULL DEFAULT 'FREE';
ALTER TABLE "users" ADD COLUMN "planExpiresAt" TIMESTAMP(3);
ALTER TABLE "users" ADD COLUMN "aiGenerationsTotal" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "subscription_events" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "fromPlan" "PlanTier" NOT NULL,
    "toPlan" "PlanTier" NOT NULL,
    "source" "SubscriptionSource" NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subscription_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "subscription_events_userId_createdAt_idx" ON "subscription_events"("userId", "createdAt");

ALTER TABLE "subscription_events" ADD CONSTRAINT "subscription_events_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "pro_upgrade_invites" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "usedById" TEXT,
    "usedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "note" TEXT,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pro_upgrade_invites_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "pro_upgrade_invites_token_key" ON "pro_upgrade_invites"("token");
CREATE INDEX "pro_upgrade_invites_token_idx" ON "pro_upgrade_invites"("token");
CREATE INDEX "pro_upgrade_invites_createdById_createdAt_idx" ON "pro_upgrade_invites"("createdById", "createdAt");

ALTER TABLE "pro_upgrade_invites" ADD CONSTRAINT "pro_upgrade_invites_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "pro_upgrade_invites" ADD CONSTRAINT "pro_upgrade_invites_usedById_fkey" FOREIGN KEY ("usedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
