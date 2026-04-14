-- Add deterministic execution order for workout history entries.
ALTER TABLE "workout_history"
ADD COLUMN "executionOrder" INTEGER;

WITH ranked AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      PARTITION BY "workoutSessionId"
      ORDER BY "completedAt" ASC, "createdAt" ASC, "setNumber" ASC, "id" ASC
    ) AS rn
  FROM "workout_history"
)
UPDATE "workout_history" AS wh
SET "executionOrder" = ranked.rn
FROM ranked
WHERE wh."id" = ranked."id";

ALTER TABLE "workout_history"
ALTER COLUMN "executionOrder" SET NOT NULL;

CREATE INDEX "workout_history_workoutSessionId_executionOrder_idx"
ON "workout_history"("workoutSessionId", "executionOrder");
