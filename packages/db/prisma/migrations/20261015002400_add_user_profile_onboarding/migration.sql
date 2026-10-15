-- CreateEnum
CREATE TYPE "BiologicalSex" AS ENUM ('FEMALE', 'MALE');

-- CreateEnum
CREATE TYPE "ActivityLevel" AS ENUM ('SEDENTARY', 'LIGHT', 'MODERATE', 'ACTIVE', 'VERY_ACTIVE');

-- CreateEnum
CREATE TYPE "BodyObjective" AS ENUM ('LOSE', 'MAINTAIN', 'GAIN');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "activityLevel" "ActivityLevel",
ADD COLUMN     "birthDate" DATE,
ADD COLUMN     "objective" "BodyObjective",
ADD COLUMN     "onboardedAt" TIMESTAMP(3),
ADD COLUMN     "sex" "BiologicalSex";

-- Quem já tem metas já passou da primeira vez: não vê o assistente.
UPDATE "User" u
SET "onboardedAt" = g."updatedAt"
FROM "UserGoals" g
WHERE g."userId" = u."id" AND u."onboardedAt" IS NULL;
