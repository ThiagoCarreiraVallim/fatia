-- AlterTable
ALTER TABLE "Conversation" ADD COLUMN     "agentGroupId" TEXT;

-- CreateTable
CREATE TABLE "GroupAgent" (
    "groupId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "instructions" TEXT NOT NULL DEFAULT '',
    "avatarFileId" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GroupAgent_pkey" PRIMARY KEY ("groupId")
);

-- CreateIndex
CREATE UNIQUE INDEX "GroupAgent_avatarFileId_key" ON "GroupAgent"("avatarFileId");

-- CreateIndex
CREATE INDEX "Conversation_agentGroupId_idx" ON "Conversation"("agentGroupId");

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_agentGroupId_fkey" FOREIGN KEY ("agentGroupId") REFERENCES "Group"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupAgent" ADD CONSTRAINT "GroupAgent_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupAgent" ADD CONSTRAINT "GroupAgent_avatarFileId_fkey" FOREIGN KEY ("avatarFileId") REFERENCES "MediaFile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

