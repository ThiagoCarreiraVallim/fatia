-- CreateEnum
CREATE TYPE "TrainingBlockKind" AS ENUM ('strength', 'hypertrophy');

-- CreateEnum
CREATE TYPE "TrainingBlockStatus" AS ENUM ('active', 'completed', 'abandoned');

-- CreateTable
CREATE TABLE "TrainingBlock" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "planId" TEXT,
    "kind" "TrainingBlockKind" NOT NULL DEFAULT 'hypertrophy',
    "startDate" TEXT NOT NULL,
    "weeksTotal" INTEGER NOT NULL DEFAULT 4,
    "status" "TrainingBlockStatus" NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrainingBlock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrainingBlockWeek" (
    "id" TEXT NOT NULL,
    "blockId" TEXT NOT NULL,
    "weekNumber" INTEGER NOT NULL,
    "focus" TEXT NOT NULL,
    "intensityFactor" DOUBLE PRECISION NOT NULL,
    "volumeFactor" DOUBLE PRECISION NOT NULL,
    "weekStart" TEXT NOT NULL,
    "sessionsTarget" INTEGER NOT NULL,

    CONSTRAINT "TrainingBlockWeek_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TrainingBlock_userId_status_idx" ON "TrainingBlock"("userId", "status");

-- CreateIndex
CREATE INDEX "TrainingBlockWeek_blockId_idx" ON "TrainingBlockWeek"("blockId");

-- CreateIndex
CREATE UNIQUE INDEX "TrainingBlockWeek_blockId_weekNumber_key" ON "TrainingBlockWeek"("blockId", "weekNumber");

-- AddForeignKey
ALTER TABLE "TrainingBlock" ADD CONSTRAINT "TrainingBlock_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingBlock" ADD CONSTRAINT "TrainingBlock_planId_fkey" FOREIGN KEY ("planId") REFERENCES "WorkoutPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingBlockWeek" ADD CONSTRAINT "TrainingBlockWeek_blockId_fkey" FOREIGN KEY ("blockId") REFERENCES "TrainingBlock"("id") ON DELETE CASCADE ON UPDATE CASCADE;

