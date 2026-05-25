-- Adds dynamic personal goals (Goal) and User.heightCm.

-- User.heightCm (optional)
ALTER TABLE "User" ADD COLUMN "heightCm" DOUBLE PRECISION;

-- GoalKind enum
CREATE TYPE "GoalKind" AS ENUM ('weight', 'body_fat', 'workout_frequency', 'step_count', 'custom');

-- GoalStatus enum
CREATE TYPE "GoalStatus" AS ENUM ('active', 'completed', 'expired', 'archived');

-- Goal table
CREATE TABLE "Goal" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" "GoalKind" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "startValue" DOUBLE PRECISION NOT NULL,
    "targetValue" DOUBLE PRECISION NOT NULL,
    "unit" TEXT NOT NULL,
    "lastReportedValue" DOUBLE PRECISION,
    "deadline" TIMESTAMP(3),
    "status" "GoalStatus" NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "Goal_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Goal_userId_status_idx" ON "Goal"("userId", "status");
CREATE INDEX "Goal_userId_kind_idx" ON "Goal"("userId", "kind");

ALTER TABLE "Goal" ADD CONSTRAINT "Goal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
