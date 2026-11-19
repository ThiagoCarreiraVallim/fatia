-- DropIndex
DROP INDEX "PlanOffer_groupId_idx";

-- AlterTable
ALTER TABLE "PlanOffer" ADD COLUMN     "endedAt" TIMESTAMP(3),
ADD COLUMN     "position" INTEGER,
ADD COLUMN     "removedAt" TIMESTAMP(3),
ADD COLUMN     "sourceTemplateId" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "plansOrderedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "WorkoutPlan" ADD COLUMN     "position" INTEGER;

-- CreateTable
CREATE TABLE "MemberNote" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "subjectUserId" TEXT NOT NULL,
    "authorId" TEXT,
    "text" TEXT NOT NULL,
    "visibleToSubject" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MemberNote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MemberNote_groupId_subjectUserId_createdAt_idx" ON "MemberNote"("groupId", "subjectUserId", "createdAt");

-- CreateIndex
CREATE INDEX "MemberNote_subjectUserId_idx" ON "MemberNote"("subjectUserId");

-- CreateIndex
CREATE INDEX "MemberNote_authorId_idx" ON "MemberNote"("authorId");

-- CreateIndex
CREATE INDEX "PlanOffer_groupId_userId_idx" ON "PlanOffer"("groupId", "userId");

-- CreateIndex
CREATE INDEX "PlanOffer_sourceTemplateId_idx" ON "PlanOffer"("sourceTemplateId");

-- AddForeignKey
ALTER TABLE "PlanOffer" ADD CONSTRAINT "PlanOffer_sourceTemplateId_fkey" FOREIGN KEY ("sourceTemplateId") REFERENCES "GroupPlanTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemberNote" ADD CONSTRAINT "MemberNote_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemberNote" ADD CONSTRAINT "MemberNote_subjectUserId_fkey" FOREIGN KEY ("subjectUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemberNote" ADD CONSTRAINT "MemberNote_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

