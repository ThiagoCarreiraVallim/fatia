-- CreateEnum
CREATE TYPE "ChallengeMetric" AS ENUM ('WORKOUT_SESSIONS', 'STEPS', 'WATER_ML', 'ACTIVE_DAYS', 'KCAL_IN_RANGE_DAYS', 'PROTEIN_TARGET_DAYS', 'STREAK_DAYS');

-- AlterTable
ALTER TABLE "GroupMembership" ADD COLUMN     "displayName" TEXT;

-- CreateTable
CREATE TABLE "GroupChallenge" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "authorId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "metric" "ChallengeMetric" NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "timezone" TEXT NOT NULL,
    "endedEarlyAt" TIMESTAMP(3),
    "scoredAt" TIMESTAMP(3),
    "finalizedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GroupChallenge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GroupChallengeParticipant" (
    "id" TEXT NOT NULL,
    "challengeId" TEXT NOT NULL,
    "membershipId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "score" INTEGER NOT NULL DEFAULT 0,
    "finalRank" INTEGER,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GroupChallengeParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GroupChallenge_groupId_endsAt_idx" ON "GroupChallenge"("groupId", "endsAt");

-- CreateIndex
CREATE INDEX "GroupChallenge_finalizedAt_endsAt_idx" ON "GroupChallenge"("finalizedAt", "endsAt");

-- CreateIndex
CREATE INDEX "GroupChallengeParticipant_membershipId_idx" ON "GroupChallengeParticipant"("membershipId");

-- CreateIndex
CREATE UNIQUE INDEX "GroupChallengeParticipant_challengeId_membershipId_key" ON "GroupChallengeParticipant"("challengeId", "membershipId");

-- AddForeignKey
ALTER TABLE "GroupChallenge" ADD CONSTRAINT "GroupChallenge_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupChallenge" ADD CONSTRAINT "GroupChallenge_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupChallengeParticipant" ADD CONSTRAINT "GroupChallengeParticipant_challengeId_fkey" FOREIGN KEY ("challengeId") REFERENCES "GroupChallenge"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupChallengeParticipant" ADD CONSTRAINT "GroupChallengeParticipant_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "GroupMembership"("id") ON DELETE CASCADE ON UPDATE CASCADE;

