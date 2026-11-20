-- #403: programas (PRO por período para turma ou desafio), ofertas vendidas
-- e o que a página de assentos e faturas precisa. Só acrescenta: nada apaga.

-- CreateEnum
CREATE TYPE "ProgramKind" AS ENUM ('CLASS', 'CHALLENGE');

-- CreateEnum
CREATE TYPE "OfferStatus" AS ENUM ('DRAFT', 'ACTIVE', 'CLOSED');

-- CreateEnum
CREATE TYPE "OfferPurchaseStatus" AS ENUM ('PENDING', 'PAID', 'FAILED', 'REFUNDED');

-- AlterEnum
ALTER TYPE "ReviewKind" ADD VALUE 'PLAN_ENDED';

-- AlterEnum
ALTER TYPE "SeatInvoiceKind" ADD VALUE 'PROGRAM';

-- AlterTable
ALTER TABLE "GroupSeatAdjustment" ADD COLUMN     "proRataDays" INTEGER;

-- AlterTable
ALTER TABLE "GroupSeatAssignment" ADD COLUMN     "endsAt" TIMESTAMP(3),
ADD COLUMN     "programId" TEXT,
ADD COLUMN     "startsAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "GroupSeatInvoice" ADD COLUMN     "overdueNotifiedAt" TIMESTAMP(3),
ADD COLUMN     "proRataDays" INTEGER,
ADD COLUMN     "seats" INTEGER;

-- CreateTable
CREATE TABLE "GroupProgram" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "poolId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "note" TEXT,
    "kind" "ProgramKind" NOT NULL,
    "challengeId" TEXT,
    "seats" INTEGER NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "unitPriceCents" INTEGER NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "providerChargeId" TEXT,
    "chargeStatus" "SubscriptionStatus" NOT NULL,
    "canceledAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GroupProgram_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GroupOffer" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "priceCents" INTEGER NOT NULL,
    "spots" INTEGER,
    "startDate" TEXT,
    "endDate" TEXT,
    "grantsEntry" BOOLEAN NOT NULL DEFAULT true,
    "programId" TEXT,
    "planTemplateId" TEXT,
    "extras" TEXT,
    "status" "OfferStatus" NOT NULL DEFAULT 'DRAFT',
    "publishedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GroupOffer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GroupOfferPurchase" (
    "id" TEXT NOT NULL,
    "offerId" TEXT NOT NULL,
    "userId" TEXT,
    "buyerName" TEXT NOT NULL,
    "buyerEmail" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "status" "OfferPurchaseStatus" NOT NULL DEFAULT 'PENDING',
    "providerPaymentId" TEXT,
    "paymentUrl" TEXT,
    "paidAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "linkResentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GroupOfferPurchase_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GroupProgram_providerChargeId_key" ON "GroupProgram"("providerChargeId");

-- CreateIndex
CREATE INDEX "GroupProgram_groupId_endsAt_idx" ON "GroupProgram"("groupId", "endsAt");

-- CreateIndex
CREATE INDEX "GroupProgram_challengeId_idx" ON "GroupProgram"("challengeId");

-- CreateIndex
CREATE INDEX "GroupOffer_groupId_status_idx" ON "GroupOffer"("groupId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "GroupOffer_groupId_slug_key" ON "GroupOffer"("groupId", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "GroupOfferPurchase_providerPaymentId_key" ON "GroupOfferPurchase"("providerPaymentId");

-- CreateIndex
CREATE INDEX "GroupOfferPurchase_offerId_status_idx" ON "GroupOfferPurchase"("offerId", "status");

-- CreateIndex
CREATE INDEX "GroupOfferPurchase_userId_idx" ON "GroupOfferPurchase"("userId");

-- CreateIndex
CREATE INDEX "GroupSeatAssignment_programId_idx" ON "GroupSeatAssignment"("programId");

-- AddForeignKey
ALTER TABLE "GroupSeatAssignment" ADD CONSTRAINT "GroupSeatAssignment_programId_fkey" FOREIGN KEY ("programId") REFERENCES "GroupProgram"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupProgram" ADD CONSTRAINT "GroupProgram_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupProgram" ADD CONSTRAINT "GroupProgram_poolId_fkey" FOREIGN KEY ("poolId") REFERENCES "GroupSeatPool"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupProgram" ADD CONSTRAINT "GroupProgram_challengeId_fkey" FOREIGN KEY ("challengeId") REFERENCES "GroupChallenge"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupOffer" ADD CONSTRAINT "GroupOffer_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupOffer" ADD CONSTRAINT "GroupOffer_programId_fkey" FOREIGN KEY ("programId") REFERENCES "GroupProgram"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupOffer" ADD CONSTRAINT "GroupOffer_planTemplateId_fkey" FOREIGN KEY ("planTemplateId") REFERENCES "GroupPlanTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupOfferPurchase" ADD CONSTRAINT "GroupOfferPurchase_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "GroupOffer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupOfferPurchase" ADD CONSTRAINT "GroupOfferPurchase_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Um assento comum ativo por membership, como antes; o de programa fica à
-- parte (a pessoa pode ter os dois), um por programa.
DROP INDEX "GroupSeatAssignment_membershipId_active_key";
CREATE UNIQUE INDEX "GroupSeatAssignment_membershipId_active_key" ON "GroupSeatAssignment"("membershipId") WHERE "revokedAt" IS NULL AND "programId" IS NULL;
CREATE UNIQUE INDEX "GroupSeatAssignment_program_membership_active_key" ON "GroupSeatAssignment"("programId", "membershipId") WHERE "revokedAt" IS NULL AND "programId" IS NOT NULL;

ALTER TABLE "GroupProgram" ADD CONSTRAINT "GroupProgram_seats_check" CHECK ("seats" > 0);
ALTER TABLE "GroupProgram" ADD CONSTRAINT "GroupProgram_period_check" CHECK ("endsAt" > "startsAt");
-- Só programa de desafio aponta para desafio (o desafio apagado deixa nulo).
ALTER TABLE "GroupProgram" ADD CONSTRAINT "GroupProgram_challenge_check" CHECK ("kind" = 'CHALLENGE' OR "challengeId" IS NULL);
ALTER TABLE "GroupOffer" ADD CONSTRAINT "GroupOffer_price_check" CHECK ("priceCents" > 0);
ALTER TABLE "GroupOffer" ADD CONSTRAINT "GroupOffer_spots_check" CHECK ("spots" IS NULL OR "spots" > 0);

