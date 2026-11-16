-- #379: plano recebido da equipe (oferta e versões), agenda de treinos e bloco
-- de 3 a 6 semanas. Só acrescenta: tabelas novas, uma coluna opcional em
-- WorkoutPlan e uma CHECK que os blocos de 4 semanas já cumprem.

-- CreateEnum
CREATE TYPE "PlanOfferStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "PlanSchedule" AS ENUM ('CALENDAR', 'FLEXIBLE');

-- CreateEnum
CREATE TYPE "PlannedSessionStatus" AS ENUM ('PLANNED', 'RESCHEDULED');

-- AlterTable
ALTER TABLE "WorkoutPlan" ADD COLUMN     "fromOfferId" TEXT;

-- CreateTable
CREATE TABLE "PlanOffer" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "authorId" TEXT,
    "groupId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlanOffer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlanOfferVersion" (
    "id" TEXT NOT NULL,
    "offerId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "status" "PlanOfferStatus" NOT NULL DEFAULT 'PENDING',
    "title" TEXT NOT NULL,
    "snapshot" JSONB NOT NULL,
    "snapshotVersion" INTEGER NOT NULL,
    "schedule" "PlanSchedule" NOT NULL,
    "startDate" TEXT,
    "weeks" INTEGER,
    "weekdays" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "note" TEXT,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "respondedAt" TIMESTAMP(3),

    CONSTRAINT "PlanOfferVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlannedSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "offerVersionId" TEXT,
    "date" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "status" "PlannedSessionStatus" NOT NULL DEFAULT 'PLANNED',
    "originalDate" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlannedSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PlanOffer_userId_idx" ON "PlanOffer"("userId");

-- CreateIndex
CREATE INDEX "PlanOffer_authorId_idx" ON "PlanOffer"("authorId");

-- CreateIndex
CREATE INDEX "PlanOffer_groupId_idx" ON "PlanOffer"("groupId");

-- CreateIndex
CREATE INDEX "PlanOfferVersion_offerId_status_idx" ON "PlanOfferVersion"("offerId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "PlanOfferVersion_offerId_version_key" ON "PlanOfferVersion"("offerId", "version");

-- CreateIndex
CREATE INDEX "PlannedSession_userId_date_idx" ON "PlannedSession"("userId", "date");

-- CreateIndex
CREATE INDEX "PlannedSession_planId_date_idx" ON "PlannedSession"("planId", "date");

-- CreateIndex
CREATE INDEX "WorkoutPlan_fromOfferId_idx" ON "WorkoutPlan"("fromOfferId");

-- AddForeignKey
ALTER TABLE "WorkoutPlan" ADD CONSTRAINT "WorkoutPlan_fromOfferId_fkey" FOREIGN KEY ("fromOfferId") REFERENCES "PlanOffer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanOffer" ADD CONSTRAINT "PlanOffer_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanOffer" ADD CONSTRAINT "PlanOffer_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanOffer" ADD CONSTRAINT "PlanOffer_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanOfferVersion" ADD CONSTRAINT "PlanOfferVersion_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "PlanOffer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlannedSession" ADD CONSTRAINT "PlannedSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlannedSession" ADD CONSTRAINT "PlannedSession_planId_fkey" FOREIGN KEY ("planId") REFERENCES "WorkoutPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- O bloco vai de 3 a 6 semanas (a última é deload). Os de antes têm 4.
ALTER TABLE "TrainingBlock" ADD CONSTRAINT "TrainingBlock_weeksTotal_range" CHECK ("weeksTotal" BETWEEN 3 AND 6);
