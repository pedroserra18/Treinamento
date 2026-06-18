-- Denúncias de posts (moderação pela comunidade → fila do admin/suporte).
-- Enums de motivo e status + tabela post_reports. Unique (postId, reporterId)
-- garante 1 denúncia por usuário por post (idempotente, anti-spam).
CREATE TYPE "PostReportReason" AS ENUM ('SPAM', 'HARASSMENT', 'INAPPROPRIATE', 'VIOLENCE', 'MISINFORMATION', 'OTHER');
CREATE TYPE "PostReportStatus" AS ENUM ('PENDING', 'REVIEWED', 'DISMISSED');

CREATE TABLE "post_reports" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "reporterId" TEXT NOT NULL,
    "reason" "PostReportReason" NOT NULL,
    "details" VARCHAR(500),
    "status" "PostReportStatus" NOT NULL DEFAULT 'PENDING',
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "post_reports_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "post_reports_postId_reporterId_key" ON "post_reports"("postId", "reporterId");
CREATE INDEX "post_reports_status_createdAt_idx" ON "post_reports"("status", "createdAt");
CREATE INDEX "post_reports_postId_idx" ON "post_reports"("postId");

ALTER TABLE "post_reports"
  ADD CONSTRAINT "post_reports_postId_fkey" FOREIGN KEY ("postId")
  REFERENCES "workout_posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "post_reports"
  ADD CONSTRAINT "post_reports_reporterId_fkey" FOREIGN KEY ("reporterId")
  REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
