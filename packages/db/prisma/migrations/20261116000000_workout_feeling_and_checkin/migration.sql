-- AlterTable
ALTER TABLE "WorkoutSession" ADD COLUMN     "feeling" INTEGER;

-- CreateTable
CREATE TABLE "WorkoutCheckin" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "skipped" BOOLEAN NOT NULL DEFAULT false,
    "difficulty" INTEGER,
    "fatigue" INTEGER,
    "pain" BOOLEAN,
    "painLocation" TEXT,
    "motivation" INTEGER,
    "note" TEXT,
    "answeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkoutCheckin_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WorkoutCheckin_sessionId_key" ON "WorkoutCheckin"("sessionId");

-- CreateIndex
CREATE INDEX "WorkoutCheckin_userId_answeredAt_idx" ON "WorkoutCheckin"("userId", "answeredAt");

-- AddForeignKey
ALTER TABLE "WorkoutCheckin" ADD CONSTRAINT "WorkoutCheckin_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "WorkoutSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkoutCheckin" ADD CONSTRAINT "WorkoutCheckin_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "SessionSet" ADD COLUMN     "clientKey" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "SessionSet_sessionId_clientKey_key" ON "SessionSet"("sessionId", "clientKey");

-- Faixas das escalas (#377). O Prisma não descreve CHECK: ficam só aqui.
ALTER TABLE "WorkoutSession" ADD CONSTRAINT "WorkoutSession_feeling_range"
  CHECK ("feeling" IS NULL OR "feeling" BETWEEN 1 AND 5);
ALTER TABLE "WorkoutCheckin" ADD CONSTRAINT "WorkoutCheckin_scales_range"
  CHECK (
    ("difficulty" IS NULL OR "difficulty" BETWEEN 1 AND 5) AND
    ("fatigue" IS NULL OR "fatigue" BETWEEN 1 AND 5) AND
    ("motivation" IS NULL OR "motivation" BETWEEN 1 AND 5)
  );
