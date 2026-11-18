-- CreateEnum
CREATE TYPE "PartnerBenefitKind" AS ENUM ('COUPON', 'LINK');

-- AlterTable
ALTER TABLE "GroupInvite" ADD COLUMN     "code" TEXT;

-- AlterTable
ALTER TABLE "GroupMembership" ADD COLUMN     "feedSeenAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "GroupPartnerBenefit" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "partnerName" TEXT NOT NULL,
    "logoFileId" TEXT,
    "discountText" TEXT NOT NULL,
    "kind" "PartnerBenefitKind" NOT NULL,
    "couponCode" TEXT,
    "url" TEXT,
    "validUntil" DATE NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GroupPartnerBenefit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GroupPartnerBenefit_logoFileId_key" ON "GroupPartnerBenefit"("logoFileId");

-- CreateIndex
CREATE INDEX "GroupPartnerBenefit_groupId_validUntil_idx" ON "GroupPartnerBenefit"("groupId", "validUntil");

-- CreateIndex
CREATE UNIQUE INDEX "GroupInvite_code_key" ON "GroupInvite"("code");

-- AddForeignKey
ALTER TABLE "GroupPartnerBenefit" ADD CONSTRAINT "GroupPartnerBenefit_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupPartnerBenefit" ADD CONSTRAINT "GroupPartnerBenefit_logoFileId_fkey" FOREIGN KEY ("logoFileId") REFERENCES "MediaFile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupPartnerBenefit" ADD CONSTRAINT "GroupPartnerBenefit_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

