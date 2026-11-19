-- #398 (revisão): o limite semanal de avisos conta num registro próprio, que não some com o post.
-- DropIndex
DROP INDEX "GroupPost_groupId_notifiedAt_idx";

-- AlterTable
ALTER TABLE "GroupPost" DROP COLUMN "notifiedAt";

-- CreateTable
CREATE TABLE "AnnouncementDispatch" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "announcementId" TEXT,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "push" BOOLEAN NOT NULL,
    "email" BOOLEAN NOT NULL,

    CONSTRAINT "AnnouncementDispatch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AnnouncementDispatch_groupId_at_idx" ON "AnnouncementDispatch"("groupId", "at");

-- CreateIndex
CREATE INDEX "AnnouncementDispatch_announcementId_idx" ON "AnnouncementDispatch"("announcementId");

-- AddForeignKey
ALTER TABLE "AnnouncementDispatch" ADD CONSTRAINT "AnnouncementDispatch_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnnouncementDispatch" ADD CONSTRAINT "AnnouncementDispatch_announcementId_fkey" FOREIGN KEY ("announcementId") REFERENCES "GroupAnnouncement"("id") ON DELETE SET NULL ON UPDATE CASCADE;
