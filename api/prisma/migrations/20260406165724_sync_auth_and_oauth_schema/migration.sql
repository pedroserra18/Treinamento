/*
  Warnings:

  - You are about to drop the column `category` on the `exercises` table. All the data in the column will be lost.
  - You are about to drop the column `createdById` on the `exercises` table. All the data in the column will be lost.
  - You are about to drop the column `deletedAt` on the `exercises` table. All the data in the column will be lost.
  - You are about to drop the column `description` on the `exercises` table. All the data in the column will be lost.
  - You are about to drop the column `isPublic` on the `exercises` table. All the data in the column will be lost.
  - You are about to drop the column `updatedById` on the `exercises` table. All the data in the column will be lost.
  - You are about to drop the column `version` on the `exercises` table. All the data in the column will be lost.
  - Made the column `equipment` on table `exercises` required. This step will fail if there are existing NULL values in that column.

*/
-- CreateEnum
CREATE TYPE "UserSex" AS ENUM ('MALE', 'FEMALE', 'OTHER');

-- CreateEnum
CREATE TYPE "ExerciseDifficulty" AS ENUM ('BEGINNER', 'INTERMEDIATE', 'ADVANCED');

-- CreateEnum
CREATE TYPE "GenderFocus" AS ENUM ('UNISEX', 'FEMALE', 'MALE');

-- CreateEnum
CREATE TYPE "ExerciseScope" AS ENUM ('GLOBAL', 'PRIVATE');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "MuscleGroup" ADD VALUE 'BICEPS';
ALTER TYPE "MuscleGroup" ADD VALUE 'TRICEPS';
ALTER TYPE "MuscleGroup" ADD VALUE 'ABDOMEN';
ALTER TYPE "MuscleGroup" ADD VALUE 'FOREARM';
ALTER TYPE "MuscleGroup" ADD VALUE 'CALVES';

-- DropForeignKey
ALTER TABLE "exercises" DROP CONSTRAINT "exercises_createdById_fkey";

-- DropForeignKey
ALTER TABLE "exercises" DROP CONSTRAINT "exercises_updatedById_fkey";

-- DropIndex
DROP INDEX "exercises_category_primaryMuscleGroup_idx";

-- DropIndex
DROP INDEX "exercises_createdById_idx";

-- DropIndex
DROP INDEX "exercises_isPublic_isActive_idx";

-- AlterTable
ALTER TABLE "exercises" DROP COLUMN "category",
DROP COLUMN "createdById",
DROP COLUMN "deletedAt",
DROP COLUMN "description",
DROP COLUMN "isPublic",
DROP COLUMN "updatedById",
DROP COLUMN "version",
ADD COLUMN     "difficulty" "ExerciseDifficulty" NOT NULL DEFAULT 'INTERMEDIATE',
ADD COLUMN     "genderFocus" "GenderFocus" NOT NULL DEFAULT 'UNISEX',
ADD COLUMN     "isCompound" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "ownerUserId" TEXT,
ADD COLUMN     "scope" "ExerciseScope" NOT NULL DEFAULT 'GLOBAL',
ADD COLUMN     "secondaryMuscleGroup" "MuscleGroup",
ADD COLUMN     "thumbnailUrl" TEXT,
ADD COLUMN     "videoUrl" TEXT,
ALTER COLUMN "equipment" SET NOT NULL,
ALTER COLUMN "instructions" SET DATA TYPE TEXT;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "sex" "UserSex" NOT NULL DEFAULT 'OTHER';

-- CreateIndex
CREATE INDEX "exercises_scope_isActive_idx" ON "exercises"("scope", "isActive");

-- CreateIndex
CREATE INDEX "exercises_ownerUserId_scope_idx" ON "exercises"("ownerUserId", "scope");

-- CreateIndex
CREATE INDEX "exercises_primaryMuscleGroup_idx" ON "exercises"("primaryMuscleGroup");

-- CreateIndex
CREATE INDEX "exercises_secondaryMuscleGroup_idx" ON "exercises"("secondaryMuscleGroup");

-- CreateIndex
CREATE INDEX "exercises_difficulty_idx" ON "exercises"("difficulty");

-- CreateIndex
CREATE INDEX "exercises_genderFocus_idx" ON "exercises"("genderFocus");

-- CreateIndex
CREATE INDEX "exercises_isActive_idx" ON "exercises"("isActive");

-- AddForeignKey
ALTER TABLE "exercises" ADD CONSTRAINT "exercises_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
