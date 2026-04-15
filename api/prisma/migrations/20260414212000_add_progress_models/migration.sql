-- Progress module tables: pinned exercises and body measurements.
CREATE TABLE "pinned_exercises" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "exerciseId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pinned_exercises_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "body_measurements" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "photoUrl" TEXT NOT NULL,
    "weight" DOUBLE PRECISION NOT NULL,
    "chest" DOUBLE PRECISION,
    "shoulders" DOUBLE PRECISION,
    "arms" DOUBLE PRECISION,
    "forearms" DOUBLE PRECISION,
    "waist" DOUBLE PRECISION,
    "hips" DOUBLE PRECISION,
    "thighs" DOUBLE PRECISION,
    "calves" DOUBLE PRECISION,
    "neck" DOUBLE PRECISION,
    "bmi" DOUBLE PRECISION,
    "bodyFatPercentage" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "body_measurements_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "pinned_exercises_userId_exerciseId_key" ON "pinned_exercises"("userId", "exerciseId");
CREATE INDEX "pinned_exercises_userId_createdAt_idx" ON "pinned_exercises"("userId", "createdAt");
CREATE INDEX "pinned_exercises_exerciseId_idx" ON "pinned_exercises"("exerciseId");
CREATE INDEX "body_measurements_userId_date_idx" ON "body_measurements"("userId", "date");

ALTER TABLE "pinned_exercises" ADD CONSTRAINT "pinned_exercises_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "pinned_exercises" ADD CONSTRAINT "pinned_exercises_exerciseId_fkey" FOREIGN KEY ("exerciseId") REFERENCES "exercises"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "body_measurements" ADD CONSTRAINT "body_measurements_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
