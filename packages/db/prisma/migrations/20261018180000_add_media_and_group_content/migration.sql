-- Mídia da comunidade (ADR 028) e conteúdo da comunidade (Fase 7a). Só cria; nada é apagado.

-- CreateEnum
CREATE TYPE "MediaKind" AS ENUM ('IMAGE', 'VIDEO');

-- CreateEnum
CREATE TYPE "MediaStatus" AS ENUM ('PENDING', 'READY');

-- CreateEnum
CREATE TYPE "PlanTemplateKind" AS ENUM ('WORKOUT', 'NUTRITION');

-- AlterTable
ALTER TABLE "Group" ADD COLUMN     "avatarFileId" TEXT;

-- AlterTable
ALTER TABLE "MealTemplate" ADD COLUMN     "fromTemplateId" TEXT;

-- AlterTable
ALTER TABLE "WorkoutPlan" ADD COLUMN     "fromTemplateId" TEXT;

-- CreateTable
CREATE TABLE "MediaFile" (
    "id" TEXT NOT NULL,
    "uploaderId" TEXT,
    "groupId" TEXT,
    "purpose" TEXT NOT NULL,
    "kind" "MediaKind" NOT NULL,
    "status" "MediaStatus" NOT NULL DEFAULT 'PENDING',
    "key" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "bytes" INTEGER NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmedAt" TIMESTAMP(3),

    CONSTRAINT "MediaFile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GroupPlanTemplate" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "authorId" TEXT,
    "kind" "PlanTemplateKind" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "level" TEXT,
    "coverFileId" TEXT,
    "snapshot" JSONB NOT NULL,
    "snapshotVersion" INTEGER NOT NULL,
    "sourcePlanId" TEXT,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GroupPlanTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GroupTip" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "authorId" TEXT,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "imageFileId" TEXT,
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GroupTip_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MediaFile_key_key" ON "MediaFile"("key");

-- CreateIndex
CREATE INDEX "MediaFile_groupId_idx" ON "MediaFile"("groupId");

-- CreateIndex
CREATE INDEX "MediaFile_uploaderId_idx" ON "MediaFile"("uploaderId");

-- CreateIndex
CREATE INDEX "MediaFile_status_createdAt_idx" ON "MediaFile"("status", "createdAt");

-- CreateIndex
CREATE INDEX "GroupPlanTemplate_groupId_publishedAt_idx" ON "GroupPlanTemplate"("groupId", "publishedAt");

-- CreateIndex
CREATE INDEX "GroupTip_groupId_publishedAt_idx" ON "GroupTip"("groupId", "publishedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Group_avatarFileId_key" ON "Group"("avatarFileId");

-- CreateIndex
CREATE INDEX "WorkoutPlan_userId_fromTemplateId_idx" ON "WorkoutPlan"("userId", "fromTemplateId");

-- AddForeignKey
ALTER TABLE "MealTemplate" ADD CONSTRAINT "MealTemplate_fromTemplateId_fkey" FOREIGN KEY ("fromTemplateId") REFERENCES "GroupPlanTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkoutPlan" ADD CONSTRAINT "WorkoutPlan_fromTemplateId_fkey" FOREIGN KEY ("fromTemplateId") REFERENCES "GroupPlanTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Group" ADD CONSTRAINT "Group_avatarFileId_fkey" FOREIGN KEY ("avatarFileId") REFERENCES "MediaFile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaFile" ADD CONSTRAINT "MediaFile_uploaderId_fkey" FOREIGN KEY ("uploaderId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaFile" ADD CONSTRAINT "MediaFile_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupPlanTemplate" ADD CONSTRAINT "GroupPlanTemplate_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupPlanTemplate" ADD CONSTRAINT "GroupPlanTemplate_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupPlanTemplate" ADD CONSTRAINT "GroupPlanTemplate_coverFileId_fkey" FOREIGN KEY ("coverFileId") REFERENCES "MediaFile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupTip" ADD CONSTRAINT "GroupTip_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupTip" ADD CONSTRAINT "GroupTip_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupTip" ADD CONSTRAINT "GroupTip_imageFileId_fkey" FOREIGN KEY ("imageFileId") REFERENCES "MediaFile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

