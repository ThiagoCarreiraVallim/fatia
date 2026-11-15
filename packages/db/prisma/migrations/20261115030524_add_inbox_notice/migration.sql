-- CreateTable
CREATE TABLE "InboxNotice" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" "NotificationKind" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InboxNotice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InboxNotice_userId_createdAt_idx" ON "InboxNotice"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "InboxNotice_userId_readAt_idx" ON "InboxNotice"("userId", "readAt");

-- AddForeignKey
ALTER TABLE "InboxNotice" ADD CONSTRAINT "InboxNotice_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
