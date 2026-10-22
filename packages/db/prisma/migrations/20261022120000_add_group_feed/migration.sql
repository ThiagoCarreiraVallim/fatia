-- CreateEnum
CREATE TYPE "PostPolicy" AS ENUM ('ALL_MEMBERS', 'TEAM_ONLY');

-- CreateEnum
CREATE TYPE "PostReactionKind" AS ENUM ('STRONG', 'FIRE', 'CLAP', 'HEART');

-- CreateEnum
CREATE TYPE "ReportReason" AS ENUM ('SPAM', 'OFFENSIVE', 'HARASSMENT', 'MISINFORMATION', 'OTHER');

-- AlterEnum
ALTER TYPE "MembershipStatus" ADD VALUE 'BANNED';

-- AlterTable
ALTER TABLE "Group" ADD COLUMN     "postPolicy" "PostPolicy" NOT NULL DEFAULT 'ALL_MEMBERS';

-- CreateTable
CREATE TABLE "GroupPost" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "membershipId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "pinnedAt" TIMESTAMP(3),
    "removedAt" TIMESTAMP(3),
    "removedById" TEXT,
    "removedReason" "ReportReason",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GroupPost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GroupPostImage" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "fileId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,

    CONSTRAINT "GroupPostImage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GroupPostReaction" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "membershipId" TEXT NOT NULL,
    "kind" "PostReactionKind" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GroupPostReaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GroupPostComment" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "membershipId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "removedAt" TIMESTAMP(3),
    "removedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GroupPostComment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GroupPostReport" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "commentId" TEXT,
    "reporterId" TEXT NOT NULL,
    "reason" "ReportReason" NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "resolvedById" TEXT,
    "resolution" TEXT,

    CONSTRAINT "GroupPostReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GroupPost_groupId_createdAt_idx" ON "GroupPost"("groupId", "createdAt");

-- CreateIndex
CREATE INDEX "GroupPost_groupId_pinnedAt_idx" ON "GroupPost"("groupId", "pinnedAt");

-- CreateIndex
CREATE INDEX "GroupPost_membershipId_idx" ON "GroupPost"("membershipId");

-- CreateIndex
CREATE UNIQUE INDEX "GroupPostImage_fileId_key" ON "GroupPostImage"("fileId");

-- CreateIndex
CREATE INDEX "GroupPostImage_postId_idx" ON "GroupPostImage"("postId");

-- CreateIndex
CREATE INDEX "GroupPostReaction_membershipId_idx" ON "GroupPostReaction"("membershipId");

-- CreateIndex
CREATE UNIQUE INDEX "GroupPostReaction_postId_membershipId_key" ON "GroupPostReaction"("postId", "membershipId");

-- CreateIndex
CREATE INDEX "GroupPostComment_postId_createdAt_idx" ON "GroupPostComment"("postId", "createdAt");

-- CreateIndex
CREATE INDEX "GroupPostComment_membershipId_idx" ON "GroupPostComment"("membershipId");

-- CreateIndex
CREATE INDEX "GroupPostReport_postId_resolvedAt_idx" ON "GroupPostReport"("postId", "resolvedAt");

-- CreateIndex
CREATE INDEX "GroupPostReport_commentId_idx" ON "GroupPostReport"("commentId");

-- CreateIndex
CREATE INDEX "GroupPostReport_reporterId_idx" ON "GroupPostReport"("reporterId");

-- AddForeignKey
ALTER TABLE "GroupPost" ADD CONSTRAINT "GroupPost_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupPost" ADD CONSTRAINT "GroupPost_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "GroupMembership"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupPost" ADD CONSTRAINT "GroupPost_removedById_fkey" FOREIGN KEY ("removedById") REFERENCES "GroupMembership"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupPostImage" ADD CONSTRAINT "GroupPostImage_postId_fkey" FOREIGN KEY ("postId") REFERENCES "GroupPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupPostImage" ADD CONSTRAINT "GroupPostImage_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "MediaFile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupPostReaction" ADD CONSTRAINT "GroupPostReaction_postId_fkey" FOREIGN KEY ("postId") REFERENCES "GroupPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupPostReaction" ADD CONSTRAINT "GroupPostReaction_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "GroupMembership"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupPostComment" ADD CONSTRAINT "GroupPostComment_postId_fkey" FOREIGN KEY ("postId") REFERENCES "GroupPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupPostComment" ADD CONSTRAINT "GroupPostComment_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "GroupMembership"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupPostComment" ADD CONSTRAINT "GroupPostComment_removedById_fkey" FOREIGN KEY ("removedById") REFERENCES "GroupMembership"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupPostReport" ADD CONSTRAINT "GroupPostReport_postId_fkey" FOREIGN KEY ("postId") REFERENCES "GroupPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupPostReport" ADD CONSTRAINT "GroupPostReport_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "GroupPostComment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupPostReport" ADD CONSTRAINT "GroupPostReport_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "GroupMembership"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupPostReport" ADD CONSTRAINT "GroupPostReport_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "GroupMembership"("id") ON DELETE SET NULL ON UPDATE CASCADE;

