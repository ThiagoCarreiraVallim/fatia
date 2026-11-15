-- CreateEnum
CREATE TYPE "AvatarVisibility" AS ENUM ('COMMUNITIES', 'TEAM_ONLY');

-- CreateEnum
CREATE TYPE "LoadUnit" AS ENUM ('KG', 'LB');

-- CreateEnum
CREATE TYPE "DistanceUnit" AS ENUM ('KM', 'M', 'MI');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "avatarFileId" TEXT,
ADD COLUMN     "avatarVisibility" "AvatarVisibility" NOT NULL DEFAULT 'COMMUNITIES',
ADD COLUMN     "bio" TEXT,
ADD COLUMN     "distanceUnit" "DistanceUnit" NOT NULL DEFAULT 'KM',
ADD COLUMN     "keepMealPhotos" BOOLEAN,
ADD COLUMN     "loadUnit" "LoadUnit" NOT NULL DEFAULT 'KG',
ADD COLUMN     "nickname" TEXT,
ADD COLUMN     "whatsapp" TEXT,
ADD COLUMN     "whatsappOptIn" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "UserNewsRead" (
    "userId" TEXT NOT NULL,
    "newsId" TEXT NOT NULL,
    "readAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserNewsRead_pkey" PRIMARY KEY ("userId","newsId")
);

-- CreateTable
CREATE TABLE "UserTutorialSeen" (
    "userId" TEXT NOT NULL,
    "tutorialId" TEXT NOT NULL,
    "seenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserTutorialSeen_pkey" PRIMARY KEY ("userId","tutorialId")
);

-- CreateTable
CREATE TABLE "FeedbackIdea" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FeedbackIdea_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DataExport" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "downloadedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DataExport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FeedbackIdea_userId_createdAt_idx" ON "FeedbackIdea"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "DataExport_tokenHash_key" ON "DataExport"("tokenHash");

-- CreateIndex
CREATE INDEX "DataExport_userId_createdAt_idx" ON "DataExport"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "DataExport_expiresAt_idx" ON "DataExport"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "User_avatarFileId_key" ON "User"("avatarFileId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_avatarFileId_fkey" FOREIGN KEY ("avatarFileId") REFERENCES "MediaFile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserNewsRead" ADD CONSTRAINT "UserNewsRead_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserTutorialSeen" ADD CONSTRAINT "UserTutorialSeen_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedbackIdea" ADD CONSTRAINT "FeedbackIdea_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DataExport" ADD CONSTRAINT "DataExport_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

