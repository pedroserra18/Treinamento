-- Comments on workout posts (one-level, no replies). Cascade with the post and
-- the author so deleting either cleans up. Content is bounded so we don't store
-- novels in a feed entry.
CREATE TABLE "post_comments" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "content" VARCHAR(500) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "post_comments_pkey" PRIMARY KEY ("id")
);

-- Listing comments for a post is the hot path; sort by createdAt without a sort step.
CREATE INDEX "post_comments_postId_createdAt_idx" ON "post_comments"("postId", "createdAt");
CREATE INDEX "post_comments_userId_idx" ON "post_comments"("userId");

ALTER TABLE "post_comments"
  ADD CONSTRAINT "post_comments_postId_fkey" FOREIGN KEY ("postId")
  REFERENCES "workout_posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "post_comments"
  ADD CONSTRAINT "post_comments_userId_fkey" FOREIGN KEY ("userId")
  REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
