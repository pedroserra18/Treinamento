-- Add `handle` to users: a public, lowercase identifier shown as @handle in
-- the feed and profile. Existing accounts are backfilled deterministically
-- from each email's local part so nobody is left without a handle:
--   1. Add the column nullable so backfill can run.
--   2. Derive a base handle from email (sanitised lowercase alnum + `._-`),
--      falling back to `user_<id-prefix>` when the result is < 3 chars.
--   3. Resolve collisions by appending `_<row_number>` to duplicates,
--      keeping the earliest account by createdAt with the bare base.
--   4. Promote the column to NOT NULL and add the unique index.

ALTER TABLE "users" ADD COLUMN "handle" TEXT;

WITH derived AS (
  SELECT
    id,
    "createdAt",
    CASE
      WHEN LENGTH(LOWER(REGEXP_REPLACE(SPLIT_PART(email, '@', 1), '[^a-z0-9_.-]', '_', 'g'))) < 3
        THEN 'user_' || LEFT(id, 6)
      ELSE LOWER(REGEXP_REPLACE(SPLIT_PART(email, '@', 1), '[^a-z0-9_.-]', '_', 'g'))
    END AS handle_base
  FROM "users"
),
numbered AS (
  SELECT
    id,
    handle_base,
    ROW_NUMBER() OVER (PARTITION BY handle_base ORDER BY "createdAt", id) AS rn
  FROM derived
)
UPDATE "users" u
SET "handle" = CASE
  WHEN n.rn = 1 THEN n.handle_base
  ELSE n.handle_base || '_' || n.rn
END
FROM numbered n
WHERE u.id = n.id;

ALTER TABLE "users" ALTER COLUMN "handle" SET NOT NULL;
CREATE UNIQUE INDEX "users_handle_key" ON "users"("handle");
