-- CreateEnum
CREATE TYPE "InviteOrigin" AS ENUM ('QR', 'INSTAGRAM', 'SITE', 'REFERRAL', 'EMAIL_LIST', 'OTHER');

-- AlterTable
ALTER TABLE "GroupInvite" ADD COLUMN     "acceptedAt" TIMESTAMP(3),
ADD COLUMN     "acceptedById" TEXT,
ADD COLUMN     "accompaniedById" TEXT,
ADD COLUMN     "declinedAt" TIMESTAMP(3),
ADD COLUMN     "giveSeat" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "label" TEXT,
ADD COLUMN     "origin" "InviteOrigin",
ADD COLUMN     "sendCount" INTEGER NOT NULL DEFAULT 0,
ALTER COLUMN "expiresAt" DROP NOT NULL;

-- AlterTable
ALTER TABLE "GroupMembership" ADD COLUMN     "accompaniedById" TEXT,
ADD COLUMN     "joinedViaInviteId" TEXT;

-- CreateTable
CREATE TABLE "GroupAuditLog" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "targetCount" INTEGER NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GroupAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GroupAuditLog_groupId_createdAt_idx" ON "GroupAuditLog"("groupId", "createdAt");

-- CreateIndex
CREATE INDEX "GroupAuditLog_actorId_idx" ON "GroupAuditLog"("actorId");

-- CreateIndex
CREATE INDEX "GroupInvite_acceptedById_idx" ON "GroupInvite"("acceptedById");

-- CreateIndex
CREATE INDEX "GroupInvite_accompaniedById_idx" ON "GroupInvite"("accompaniedById");

-- CreateIndex
CREATE INDEX "GroupMembership_joinedViaInviteId_idx" ON "GroupMembership"("joinedViaInviteId");

-- CreateIndex
CREATE INDEX "GroupMembership_accompaniedById_idx" ON "GroupMembership"("accompaniedById");

-- AddForeignKey
ALTER TABLE "GroupMembership" ADD CONSTRAINT "GroupMembership_joinedViaInviteId_fkey" FOREIGN KEY ("joinedViaInviteId") REFERENCES "GroupInvite"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupMembership" ADD CONSTRAINT "GroupMembership_accompaniedById_fkey" FOREIGN KEY ("accompaniedById") REFERENCES "GroupMembership"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupInvite" ADD CONSTRAINT "GroupInvite_acceptedById_fkey" FOREIGN KEY ("acceptedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupInvite" ADD CONSTRAINT "GroupInvite_accompaniedById_fkey" FOREIGN KEY ("accompaniedById") REFERENCES "GroupMembership"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupAuditLog" ADD CONSTRAINT "GroupAuditLog_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupAuditLog" ADD CONSTRAINT "GroupAuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Convites por e-mail já enviados contam um envio no teto de reenvios.
UPDATE "GroupInvite" SET "sendCount" = 1 WHERE "email" IS NOT NULL AND "lastSentAt" IS NOT NULL;
