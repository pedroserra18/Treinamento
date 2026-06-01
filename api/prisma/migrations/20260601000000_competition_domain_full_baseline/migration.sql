
-- CreateEnum
CREATE TYPE "CompetitionType" AS ENUM ('TRAINING', 'CARDIO', 'BOTH');

-- CreateEnum
CREATE TYPE "CompetitionStatus" AS ENUM ('LOBBY', 'ACTIVE', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CompetitionRole" AS ENUM ('ADMIN', 'MEMBER');

-- CreateEnum
CREATE TYPE "CompetitionInviteStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CompetitionEntryKind" AS ENUM ('TRAINING', 'CARDIO');

-- CreateEnum
CREATE TYPE "CompetitionReactionKind" AS ENUM ('CLAP', 'FIRE', 'STRONG', 'PRAY');

-- AlterEnum
ALTER TYPE "EventCategory" ADD VALUE 'COMPETITION';

-- CreateTable
CREATE TABLE "competitions" (
    "id" TEXT NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "name" TEXT,
    "type" "CompetitionType" NOT NULL,
    "durationDays" INTEGER NOT NULL,
    "status" "CompetitionStatus" NOT NULL DEFAULT 'LOBBY',
    "startDeadline" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "winnerUserId" TEXT,
    "inviteToken" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "competitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "competition_members" (
    "id" TEXT NOT NULL,
    "competitionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "CompetitionRole" NOT NULL DEFAULT 'MEMBER',
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "abandonedAt" TIMESTAMP(3),

    CONSTRAINT "competition_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "competition_invites" (
    "id" TEXT NOT NULL,
    "competitionId" TEXT NOT NULL,
    "invitedByUserId" TEXT NOT NULL,
    "invitedUserId" TEXT,
    "token" TEXT NOT NULL,
    "status" "CompetitionInviteStatus" NOT NULL DEFAULT 'PENDING',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "respondedAt" TIMESTAMP(3),

    CONSTRAINT "competition_invites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "competition_entry_reactions" (
    "id" TEXT NOT NULL,
    "entryId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" "CompetitionReactionKind" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "competition_entry_reactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "competition_messages" (
    "id" TEXT NOT NULL,
    "competitionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "content" VARCHAR(500) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "competition_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "competition_entries" (
    "id" TEXT NOT NULL,
    "competitionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "kind" "CompetitionEntryKind" NOT NULL,
    "workoutSessionId" TEXT,
    "photoUrl" TEXT NOT NULL,
    "photoPath" TEXT,
    "photoHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "competition_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "competition_member_stats" (
    "id" TEXT NOT NULL,
    "competitionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "daysActive" INTEGER NOT NULL DEFAULT 0,
    "points" INTEGER NOT NULL DEFAULT 0,
    "totalDurationSec" INTEGER NOT NULL DEFAULT 0,
    "volumeKg" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "competition_member_stats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "competition_entry_comments" (
    "id" TEXT NOT NULL,
    "entryId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "content" VARCHAR(500) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "competition_entry_comments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "competitions_inviteToken_key" ON "competitions"("inviteToken");

-- CreateIndex
CREATE INDEX "competitions_ownerUserId_idx" ON "competitions"("ownerUserId");

-- CreateIndex
CREATE INDEX "competitions_status_endsAt_idx" ON "competitions"("status", "endsAt");

-- CreateIndex
CREATE INDEX "competition_members_userId_abandonedAt_idx" ON "competition_members"("userId", "abandonedAt");

-- CreateIndex
CREATE UNIQUE INDEX "competition_members_competitionId_userId_key" ON "competition_members"("competitionId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "competition_invites_token_key" ON "competition_invites"("token");

-- CreateIndex
CREATE INDEX "competition_invites_invitedUserId_status_idx" ON "competition_invites"("invitedUserId", "status");

-- CreateIndex
CREATE INDEX "competition_invites_competitionId_status_idx" ON "competition_invites"("competitionId", "status");

-- CreateIndex
CREATE INDEX "competition_entry_reactions_entryId_idx" ON "competition_entry_reactions"("entryId");

-- CreateIndex
CREATE UNIQUE INDEX "competition_entry_reactions_entryId_userId_kind_key" ON "competition_entry_reactions"("entryId", "userId", "kind");

-- CreateIndex
CREATE INDEX "competition_messages_competitionId_createdAt_idx" ON "competition_messages"("competitionId", "createdAt");

-- CreateIndex
CREATE INDEX "competition_messages_userId_idx" ON "competition_messages"("userId");

-- CreateIndex
CREATE INDEX "competition_entries_competitionId_userId_idx" ON "competition_entries"("competitionId", "userId");

-- CreateIndex
CREATE INDEX "competition_entries_userId_createdAt_idx" ON "competition_entries"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "competition_entries_userId_photoHash_idx" ON "competition_entries"("userId", "photoHash");

-- CreateIndex
CREATE UNIQUE INDEX "competition_entries_competitionId_userId_day_kind_key" ON "competition_entries"("competitionId", "userId", "day", "kind");

-- CreateIndex
CREATE INDEX "competition_member_stats_competitionId_daysActive_points_to_idx" ON "competition_member_stats"("competitionId", "daysActive", "points", "totalDurationSec", "volumeKg");

-- CreateIndex
CREATE UNIQUE INDEX "competition_member_stats_competitionId_userId_key" ON "competition_member_stats"("competitionId", "userId");

-- CreateIndex
CREATE INDEX "competition_entry_comments_entryId_createdAt_idx" ON "competition_entry_comments"("entryId", "createdAt");

-- CreateIndex
CREATE INDEX "competition_entry_comments_userId_idx" ON "competition_entry_comments"("userId");

-- AddForeignKey
ALTER TABLE "competitions" ADD CONSTRAINT "competitions_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "competition_members" ADD CONSTRAINT "competition_members_competitionId_fkey" FOREIGN KEY ("competitionId") REFERENCES "competitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "competition_members" ADD CONSTRAINT "competition_members_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "competition_invites" ADD CONSTRAINT "competition_invites_competitionId_fkey" FOREIGN KEY ("competitionId") REFERENCES "competitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "competition_invites" ADD CONSTRAINT "competition_invites_invitedByUserId_fkey" FOREIGN KEY ("invitedByUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "competition_invites" ADD CONSTRAINT "competition_invites_invitedUserId_fkey" FOREIGN KEY ("invitedUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "competition_entry_reactions" ADD CONSTRAINT "competition_entry_reactions_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "competition_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "competition_entry_reactions" ADD CONSTRAINT "competition_entry_reactions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "competition_messages" ADD CONSTRAINT "competition_messages_competitionId_fkey" FOREIGN KEY ("competitionId") REFERENCES "competitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "competition_messages" ADD CONSTRAINT "competition_messages_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "competition_entries" ADD CONSTRAINT "competition_entries_competitionId_fkey" FOREIGN KEY ("competitionId") REFERENCES "competitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "competition_entries" ADD CONSTRAINT "competition_entries_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "competition_entries" ADD CONSTRAINT "competition_entries_workoutSessionId_fkey" FOREIGN KEY ("workoutSessionId") REFERENCES "workout_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "competition_member_stats" ADD CONSTRAINT "competition_member_stats_competitionId_fkey" FOREIGN KEY ("competitionId") REFERENCES "competitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "competition_member_stats" ADD CONSTRAINT "competition_member_stats_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "competition_entry_comments" ADD CONSTRAINT "competition_entry_comments_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "competition_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "competition_entry_comments" ADD CONSTRAINT "competition_entry_comments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

