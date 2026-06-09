-- CreateTable
CREATE TABLE "notification_preferences" (
    "userId" TEXT NOT NULL,
    "pushSocial" BOOLEAN NOT NULL DEFAULT true,
    "pushCompetition" BOOLEAN NOT NULL DEFAULT true,
    "pushSupport" BOOLEAN NOT NULL DEFAULT true,
    "pushEngagement" BOOLEAN NOT NULL DEFAULT true,
    "lastInactivePushAt" TIMESTAMP(3),
    "lastAnniversaryPushAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notification_preferences_pkey" PRIMARY KEY ("userId")
);

-- AddForeignKey
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
