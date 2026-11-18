-- CreateEnum
CREATE TYPE "PostKind" AS ENUM ('POST', 'POLL', 'ANNOUNCEMENT', 'AUTO');

-- CreateEnum
CREATE TYPE "PostAuthorAs" AS ENUM ('PERSON', 'GROUP');

-- CreateEnum
CREATE TYPE "AnnouncementRepeat" AS ENUM ('NONE', 'DAILY', 'WEEKLY', 'MONTHLY');

-- CreateEnum
CREATE TYPE "AutoPostKind" AS ENUM ('PLAN', 'TIP', 'EXERCISE', 'CHALLENGE');

-- AlterTable
ALTER TABLE "Group" ADD COLUMN     "autoPosts" "AutoPostKind"[] DEFAULT ARRAY['PLAN', 'TIP', 'EXERCISE', 'CHALLENGE']::"AutoPostKind"[];

-- AlterTable
ALTER TABLE "GroupMembership" ADD COLUMN     "feedSeenAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "GroupPost" ADD COLUMN     "announcementId" TEXT,
ADD COLUMN     "autoKind" "AutoPostKind",
ADD COLUMN     "autoRefId" TEXT,
ADD COLUMN     "kind" "PostKind" NOT NULL DEFAULT 'POST',
ADD COLUMN     "pinOrder" INTEGER,
ADD COLUMN     "pinnedUntil" TIMESTAMP(3),
ADD COLUMN     "publishedAs" "PostAuthorAs" NOT NULL DEFAULT 'PERSON',
ADD COLUMN     "title" TEXT;

-- CreateTable
CREATE TABLE "GroupPostHide" (
    "postId" TEXT NOT NULL,
    "membershipId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GroupPostHide_pkey" PRIMARY KEY ("postId","membershipId")
);

-- CreateTable
CREATE TABLE "GroupPoll" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "closesAt" TIMESTAMP(3) NOT NULL,
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GroupPoll_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GroupPollOption" (
    "id" TEXT NOT NULL,
    "pollId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "order" INTEGER NOT NULL,

    CONSTRAINT "GroupPollOption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GroupPollVote" (
    "id" TEXT NOT NULL,
    "pollId" TEXT NOT NULL,
    "optionId" TEXT NOT NULL,
    "membershipId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GroupPollVote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GroupAnnouncement" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "membershipId" TEXT NOT NULL,
    "publishedAs" "PostAuthorAs" NOT NULL DEFAULT 'GROUP',
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "pin" BOOLEAN NOT NULL DEFAULT false,
    "pinDays" INTEGER,
    "push" BOOLEAN NOT NULL DEFAULT true,
    "repeat" "AnnouncementRepeat" NOT NULL DEFAULT 'NONE',
    "nextRunAt" TIMESTAMP(3),
    "lastRunAt" TIMESTAMP(3),
    "canceledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GroupAnnouncement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserBlock" (
    "id" TEXT NOT NULL,
    "blockerId" TEXT NOT NULL,
    "blockedId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "groupId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserBlock_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GroupPostHide_membershipId_idx" ON "GroupPostHide"("membershipId");

-- CreateIndex
CREATE UNIQUE INDEX "GroupPoll_postId_key" ON "GroupPoll"("postId");

-- CreateIndex
CREATE INDEX "GroupPollOption_pollId_idx" ON "GroupPollOption"("pollId");

-- CreateIndex
CREATE INDEX "GroupPollVote_optionId_idx" ON "GroupPollVote"("optionId");

-- CreateIndex
CREATE INDEX "GroupPollVote_membershipId_idx" ON "GroupPollVote"("membershipId");

-- CreateIndex
CREATE UNIQUE INDEX "GroupPollVote_pollId_membershipId_key" ON "GroupPollVote"("pollId", "membershipId");

-- CreateIndex
CREATE INDEX "GroupAnnouncement_nextRunAt_idx" ON "GroupAnnouncement"("nextRunAt");

-- CreateIndex
CREATE INDEX "GroupAnnouncement_groupId_idx" ON "GroupAnnouncement"("groupId");

-- CreateIndex
CREATE INDEX "UserBlock_blockedId_idx" ON "UserBlock"("blockedId");

-- CreateIndex
CREATE UNIQUE INDEX "UserBlock_blockerId_blockedId_key" ON "UserBlock"("blockerId", "blockedId");

-- CreateIndex
CREATE INDEX "GroupPost_announcementId_idx" ON "GroupPost"("announcementId");

-- AddForeignKey
ALTER TABLE "GroupPost" ADD CONSTRAINT "GroupPost_announcementId_fkey" FOREIGN KEY ("announcementId") REFERENCES "GroupAnnouncement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupPostHide" ADD CONSTRAINT "GroupPostHide_postId_fkey" FOREIGN KEY ("postId") REFERENCES "GroupPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupPostHide" ADD CONSTRAINT "GroupPostHide_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "GroupMembership"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupPoll" ADD CONSTRAINT "GroupPoll_postId_fkey" FOREIGN KEY ("postId") REFERENCES "GroupPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupPollOption" ADD CONSTRAINT "GroupPollOption_pollId_fkey" FOREIGN KEY ("pollId") REFERENCES "GroupPoll"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupPollVote" ADD CONSTRAINT "GroupPollVote_pollId_fkey" FOREIGN KEY ("pollId") REFERENCES "GroupPoll"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupPollVote" ADD CONSTRAINT "GroupPollVote_optionId_fkey" FOREIGN KEY ("optionId") REFERENCES "GroupPollOption"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupPollVote" ADD CONSTRAINT "GroupPollVote_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "GroupMembership"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupAnnouncement" ADD CONSTRAINT "GroupAnnouncement_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupAnnouncement" ADD CONSTRAINT "GroupAnnouncement_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "GroupMembership"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserBlock" ADD CONSTRAINT "UserBlock_blockerId_fkey" FOREIGN KEY ("blockerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserBlock" ADD CONSTRAINT "UserBlock_blockedId_fkey" FOREIGN KEY ("blockedId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserBlock" ADD CONSTRAINT "UserBlock_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Os fixados de antes entram no carrossel na ordem em que apareciam (mais recente primeiro).
UPDATE "GroupPost" p SET "pinOrder" = o.n
FROM (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY "groupId" ORDER BY "pinnedAt" DESC) - 1 AS n
  FROM "GroupPost" WHERE "pinnedAt" IS NOT NULL
) o
WHERE p.id = o.id;
