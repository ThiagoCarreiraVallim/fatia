-- #398: origem da entrada, e-mail e contas de entrega do comunicado, limite semanal de push e descadastro por link.
-- CreateEnum
CREATE TYPE "JoinVia" AS ENUM ('INVITE', 'CODE', 'PAGE');

-- AlterTable
ALTER TABLE "GroupAnnouncement" ADD COLUMN     "alsoEmail" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "emailSent" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "pushDelivered" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "pushSent" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "GroupMembership" ADD COLUMN     "joinVia" "JoinVia";

-- AlterTable
ALTER TABLE "GroupPost" ADD COLUMN     "notifiedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "PushTicket" ADD COLUMN     "announcementId" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "announcementEmailOptOutAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "GroupPost_groupId_notifiedAt_idx" ON "GroupPost"("groupId", "notifiedAt");

