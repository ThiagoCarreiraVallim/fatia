-- #378: configuração do exercício no plano (descanso, técnica, carga inicial,
-- meta de cardio, bi-set, série por série) e favorito de exercício.
-- Sem perda: as colunas novas são nulas ou têm padrão. O único por
-- (planId, exerciseId) continua: a sessão agrupa as séries por exercício.

-- CreateEnum
CREATE TYPE "PlanRepUnit" AS ENUM ('REPS', 'SECONDS');

-- CreateEnum
CREATE TYPE "PlanLoadMode" AS ENUM ('WEIGHT', 'BODYWEIGHT');

-- CreateEnum
CREATE TYPE "PlanTechnique" AS ENUM ('NORMAL', 'DROP_SET', 'TO_FAILURE');

-- CreateEnum
CREATE TYPE "PlanSetKind" AS ENUM ('WARMUP', 'NORMAL', 'DROP');

-- CreateEnum
CREATE TYPE "CardioTargetKind" AS ENUM ('TIME', 'DISTANCE');

-- CreateEnum
CREATE TYPE "CardioIntensity" AS ENUM ('LIGHT', 'MODERATE', 'VIGOROUS');

-- AlterTable
ALTER TABLE "WorkoutPlanExercise" ADD COLUMN     "biSetWithNext" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "cardioDistanceMeters" DOUBLE PRECISION,
ADD COLUMN     "cardioDurationSeconds" INTEGER,
ADD COLUMN     "cardioIntensity" "CardioIntensity",
ADD COLUMN     "cardioTarget" "CardioTargetKind",
ADD COLUMN     "loadMode" "PlanLoadMode" NOT NULL DEFAULT 'WEIGHT',
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "repUnit" "PlanRepUnit" NOT NULL DEFAULT 'REPS',
ADD COLUMN     "restSeconds" INTEGER,
ADD COLUMN     "startLoadKg" DOUBLE PRECISION,
ADD COLUMN     "technique" "PlanTechnique" NOT NULL DEFAULT 'NORMAL';

-- CreateTable
CREATE TABLE "WorkoutPlanExerciseSet" (
    "id" TEXT NOT NULL,
    "planExerciseId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "kind" "PlanSetKind" NOT NULL DEFAULT 'NORMAL',
    "reps" INTEGER NOT NULL,
    "loadKg" DOUBLE PRECISION,

    CONSTRAINT "WorkoutPlanExerciseSet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FavoriteExercise" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "exerciseId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FavoriteExercise_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WorkoutPlanExerciseSet_planExerciseId_order_key" ON "WorkoutPlanExerciseSet"("planExerciseId", "order");

-- CreateIndex
CREATE INDEX "FavoriteExercise_userId_createdAt_idx" ON "FavoriteExercise"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "FavoriteExercise_userId_exerciseId_key" ON "FavoriteExercise"("userId", "exerciseId");

-- AddForeignKey
ALTER TABLE "WorkoutPlanExerciseSet" ADD CONSTRAINT "WorkoutPlanExerciseSet_planExerciseId_fkey" FOREIGN KEY ("planExerciseId") REFERENCES "WorkoutPlanExercise"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FavoriteExercise" ADD CONSTRAINT "FavoriteExercise_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FavoriteExercise" ADD CONSTRAINT "FavoriteExercise_exerciseId_fkey" FOREIGN KEY ("exerciseId") REFERENCES "Exercise"("id") ON DELETE CASCADE ON UPDATE CASCADE;
