-- #395: tipos de desafio, check-in com foto, fila de revisão, pontos por dia e "Me avise".
-- As sessões de treino antigas ganham `createdAt` = instante da migration (só vale para check-ins novos).

-- CreateEnum
CREATE TYPE "ChallengeKind" AS ENUM ('METRIC', 'PHOTO', 'WATER', 'STEPS', 'NUTRITION', 'POINTS');

-- CreateEnum
CREATE TYPE "ChallengeCheckinType" AS ENUM ('PHOTO', 'WATER', 'STEPS');

-- CreateEnum
CREATE TYPE "ChallengeCheckinStatus" AS ENUM ('VALID', 'FLAGGED', 'VOIDED');

-- CreateEnum
CREATE TYPE "ChallengeFlagSource" AS ENUM ('SYSTEM', 'MEMBER');

-- AlterTable
ALTER TABLE "GroupChallenge" ADD COLUMN     "allowedStepSources" "StepSource"[] DEFAULT ARRAY[]::"StepSource"[],
ADD COLUMN     "dailyCap" INTEGER,
ADD COLUMN     "kind" "ChallengeKind" NOT NULL DEFAULT 'METRIC',
ADD COLUMN     "maxPointsPerDay" INTEGER,
ADD COLUMN     "photosPurgedAt" TIMESTAMP(3),
ADD COLUMN     "pointsTable" JSONB,
ADD COLUMN     "startNotifiedAt" TIMESTAMP(3),
ADD COLUMN     "stepsGoal" INTEGER,
ADD COLUMN     "waterGoalMl" INTEGER;

-- AlterTable
ALTER TABLE "GroupChallengeParticipant" ADD COLUMN     "photoConsentAt" TIMESTAMP(3),
ADD COLUMN     "photoConsentVersion" TEXT,
ADD COLUMN     "streak" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "WorkoutSession" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateTable
CREATE TABLE "ChallengeCheckin" (
    "id" TEXT NOT NULL,
    "participantId" TEXT NOT NULL,
    "type" "ChallengeCheckinType" NOT NULL,
    "date" TEXT NOT NULL,
    "workoutSessionId" TEXT,
    "workoutFingerprint" TEXT,
    "photoFileId" TEXT,
    "photoHash" TEXT,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "caption" TEXT,
    "status" "ChallengeCheckinStatus" NOT NULL DEFAULT 'VALID',
    "flagSource" "ChallengeFlagSource",
    "flagReason" TEXT,
    "flaggedAt" TIMESTAMP(3),
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChallengeCheckin_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChallengeCheckinFlag" (
    "id" TEXT NOT NULL,
    "checkinId" TEXT NOT NULL,
    "membershipId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChallengeCheckinFlag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChallengeDayScore" (
    "id" TEXT NOT NULL,
    "participantId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "points" INTEGER NOT NULL,
    "parts" TEXT[] DEFAULT ARRAY[]::TEXT[],

    CONSTRAINT "ChallengeDayScore_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GroupChallengeWatcher" (
    "challengeId" TEXT NOT NULL,
    "membershipId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GroupChallengeWatcher_pkey" PRIMARY KEY ("challengeId","membershipId")
);

-- CreateIndex
CREATE UNIQUE INDEX "ChallengeCheckin_photoFileId_key" ON "ChallengeCheckin"("photoFileId");

-- CreateIndex
CREATE INDEX "ChallengeCheckin_status_idx" ON "ChallengeCheckin"("status");

-- CreateIndex
CREATE INDEX "ChallengeCheckin_workoutSessionId_idx" ON "ChallengeCheckin"("workoutSessionId");

-- CreateIndex
CREATE UNIQUE INDEX "ChallengeCheckin_participantId_type_date_key" ON "ChallengeCheckin"("participantId", "type", "date");

-- CreateIndex
CREATE INDEX "ChallengeCheckinFlag_membershipId_createdAt_idx" ON "ChallengeCheckinFlag"("membershipId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ChallengeCheckinFlag_checkinId_membershipId_key" ON "ChallengeCheckinFlag"("checkinId", "membershipId");

-- CreateIndex
CREATE UNIQUE INDEX "ChallengeDayScore_participantId_date_key" ON "ChallengeDayScore"("participantId", "date");

-- CreateIndex
CREATE INDEX "GroupChallengeWatcher_membershipId_idx" ON "GroupChallengeWatcher"("membershipId");

-- AddForeignKey
ALTER TABLE "ChallengeCheckin" ADD CONSTRAINT "ChallengeCheckin_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "GroupChallengeParticipant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChallengeCheckin" ADD CONSTRAINT "ChallengeCheckin_workoutSessionId_fkey" FOREIGN KEY ("workoutSessionId") REFERENCES "WorkoutSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChallengeCheckin" ADD CONSTRAINT "ChallengeCheckin_photoFileId_fkey" FOREIGN KEY ("photoFileId") REFERENCES "MediaFile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChallengeCheckin" ADD CONSTRAINT "ChallengeCheckin_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChallengeCheckinFlag" ADD CONSTRAINT "ChallengeCheckinFlag_checkinId_fkey" FOREIGN KEY ("checkinId") REFERENCES "ChallengeCheckin"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChallengeCheckinFlag" ADD CONSTRAINT "ChallengeCheckinFlag_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "GroupMembership"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChallengeDayScore" ADD CONSTRAINT "ChallengeDayScore_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "GroupChallengeParticipant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupChallengeWatcher" ADD CONSTRAINT "GroupChallengeWatcher_challengeId_fkey" FOREIGN KEY ("challengeId") REFERENCES "GroupChallenge"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupChallengeWatcher" ADD CONSTRAINT "GroupChallengeWatcher_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "GroupMembership"("id") ON DELETE CASCADE ON UPDATE CASCADE;

