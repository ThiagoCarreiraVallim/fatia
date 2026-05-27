-- Adds WaterLog table and UserGoals.dailyWaterTargetMl.

ALTER TABLE "UserGoals" ADD COLUMN "dailyWaterTargetMl" INTEGER NOT NULL DEFAULT 2500;

CREATE TABLE "WaterLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "ml" INTEGER NOT NULL,
    "loggedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,

    CONSTRAINT "WaterLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "WaterLog_userId_date_idx" ON "WaterLog"("userId", "date");
CREATE INDEX "WaterLog_userId_loggedAt_idx" ON "WaterLog"("userId", "loggedAt");

ALTER TABLE "WaterLog" ADD CONSTRAINT "WaterLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
