-- AlterTable
ALTER TABLE "MediaFile" ADD COLUMN     "chatMessageId" TEXT,
ADD COLUMN     "chatPosition" INTEGER;

-- CreateIndex
CREATE INDEX "MediaFile_chatMessageId_idx" ON "MediaFile"("chatMessageId");

-- AddForeignKey
ALTER TABLE "MediaFile" ADD CONSTRAINT "MediaFile_chatMessageId_fkey" FOREIGN KEY ("chatMessageId") REFERENCES "Message"("id") ON DELETE SET NULL ON UPDATE CASCADE;

