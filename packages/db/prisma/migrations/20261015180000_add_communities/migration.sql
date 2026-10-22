-- CreateEnum
CREATE TYPE "GroupVisibility" AS ENUM ('PUBLIC', 'PRIVATE');

-- CreateEnum
CREATE TYPE "JoinPolicy" AS ENUM ('OPEN', 'APPROVAL', 'INVITE_ONLY');

-- AlterTable
ALTER TABLE "Group" ADD COLUMN     "description" TEXT,
ADD COLUMN     "joinPolicy" "JoinPolicy" NOT NULL DEFAULT 'APPROVAL',
ADD COLUMN     "timezone" TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
ADD COLUMN     "visibility" "GroupVisibility" NOT NULL DEFAULT 'PRIVATE';

-- AlterTable
ALTER TABLE "GroupMembership" ADD COLUMN     "consentAt" TIMESTAMP(3),
ADD COLUMN     "consentScopes" "ShareScope"[] DEFAULT ARRAY[]::"ShareScope"[],
ADD COLUMN     "statsOptIn" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "GroupInvite" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "email" TEXT,
    "role" "GroupRole" NOT NULL,
    "createdById" TEXT,
    "maxUses" INTEGER,
    "uses" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "lastSentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GroupInvite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GroupSeatPool" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "seats" INTEGER NOT NULL,
    "nextPeriodSeats" INTEGER,
    "unitPriceCents" INTEGER NOT NULL,
    "status" "SubscriptionStatus" NOT NULL,
    "providerRef" TEXT,
    "currentPeriodEnd" TIMESTAMP(3),
    "graceEndsAt" TIMESTAMP(3),
    "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
    "canceledAt" TIMESTAMP(3),
    "paymentUrl" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GroupSeatPool_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GroupSeatAssignment" (
    "id" TEXT NOT NULL,
    "poolId" TEXT NOT NULL,
    "membershipId" TEXT NOT NULL,
    "assignedById" TEXT,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "GroupSeatAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GroupSeatAdjustment" (
    "id" TEXT NOT NULL,
    "poolId" TEXT NOT NULL,
    "fromSeats" INTEGER NOT NULL,
    "toSeats" INTEGER NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "providerChargeId" TEXT,
    "status" "SubscriptionStatus" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GroupSeatAdjustment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GroupInvite_tokenHash_key" ON "GroupInvite"("tokenHash");

-- CreateIndex
CREATE INDEX "GroupInvite_groupId_revokedAt_idx" ON "GroupInvite"("groupId", "revokedAt");

-- CreateIndex
CREATE INDEX "GroupInvite_createdById_idx" ON "GroupInvite"("createdById");

-- CreateIndex
CREATE UNIQUE INDEX "GroupSeatPool_groupId_key" ON "GroupSeatPool"("groupId");

-- CreateIndex
CREATE UNIQUE INDEX "GroupSeatPool_providerRef_key" ON "GroupSeatPool"("providerRef");

-- CreateIndex
CREATE INDEX "GroupSeatAssignment_poolId_revokedAt_idx" ON "GroupSeatAssignment"("poolId", "revokedAt");

-- CreateIndex
CREATE INDEX "GroupSeatAssignment_membershipId_revokedAt_idx" ON "GroupSeatAssignment"("membershipId", "revokedAt");

-- CreateIndex
CREATE UNIQUE INDEX "GroupSeatAdjustment_providerChargeId_key" ON "GroupSeatAdjustment"("providerChargeId");

-- CreateIndex
CREATE INDEX "GroupSeatAdjustment_poolId_idx" ON "GroupSeatAdjustment"("poolId");

-- AddForeignKey
ALTER TABLE "GroupInvite" ADD CONSTRAINT "GroupInvite_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupInvite" ADD CONSTRAINT "GroupInvite_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupSeatPool" ADD CONSTRAINT "GroupSeatPool_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupSeatAssignment" ADD CONSTRAINT "GroupSeatAssignment_poolId_fkey" FOREIGN KEY ("poolId") REFERENCES "GroupSeatPool"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupSeatAssignment" ADD CONSTRAINT "GroupSeatAssignment_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "GroupMembership"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupSeatAdjustment" ADD CONSTRAINT "GroupSeatAdjustment_poolId_fkey" FOREIGN KEY ("poolId") REFERENCES "GroupSeatPool"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- No máximo um assento ativo por membership (ADR 025). Índice parcial: o
-- Prisma não declara `WHERE`, então ele vive só aqui.
CREATE UNIQUE INDEX "GroupSeatAssignment_membershipId_active_key" ON "GroupSeatAssignment"("membershipId") WHERE "revokedAt" IS NULL;
