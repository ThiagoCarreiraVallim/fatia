-- AlterTable
ALTER TABLE "Exercise" ADD COLUMN     "groupId" TEXT,
ADD COLUMN     "groupOwned" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Group" ADD COLUMN     "equipment" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateTable
CREATE TABLE "GroupExerciseGuide" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "exerciseId" INTEGER NOT NULL,
    "authorId" TEXT,
    "videoFileId" TEXT,
    "tips" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GroupExerciseGuide_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GroupExerciseGuidePhoto" (
    "id" TEXT NOT NULL,
    "guideId" TEXT NOT NULL,
    "fileId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,

    CONSTRAINT "GroupExerciseGuidePhoto_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GroupExerciseGuide_videoFileId_key" ON "GroupExerciseGuide"("videoFileId");

-- CreateIndex
CREATE INDEX "GroupExerciseGuide_exerciseId_idx" ON "GroupExerciseGuide"("exerciseId");

-- CreateIndex
CREATE UNIQUE INDEX "GroupExerciseGuide_groupId_exerciseId_key" ON "GroupExerciseGuide"("groupId", "exerciseId");

-- CreateIndex
CREATE UNIQUE INDEX "GroupExerciseGuidePhoto_fileId_key" ON "GroupExerciseGuidePhoto"("fileId");

-- CreateIndex
CREATE INDEX "GroupExerciseGuidePhoto_guideId_idx" ON "GroupExerciseGuidePhoto"("guideId");

-- CreateIndex
CREATE INDEX "Exercise_groupId_idx" ON "Exercise"("groupId");

-- CreateIndex
CREATE UNIQUE INDEX "Exercise_name_groupId_key" ON "Exercise"("name", "groupId");

-- AddForeignKey
ALTER TABLE "Exercise" ADD CONSTRAINT "Exercise_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupExerciseGuide" ADD CONSTRAINT "GroupExerciseGuide_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupExerciseGuide" ADD CONSTRAINT "GroupExerciseGuide_exerciseId_fkey" FOREIGN KEY ("exerciseId") REFERENCES "Exercise"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupExerciseGuide" ADD CONSTRAINT "GroupExerciseGuide_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupExerciseGuide" ADD CONSTRAINT "GroupExerciseGuide_videoFileId_fkey" FOREIGN KEY ("videoFileId") REFERENCES "MediaFile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupExerciseGuidePhoto" ADD CONSTRAINT "GroupExerciseGuidePhoto_guideId_fkey" FOREIGN KEY ("guideId") REFERENCES "GroupExerciseGuide"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupExerciseGuidePhoto" ADD CONSTRAINT "GroupExerciseGuidePhoto_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "MediaFile"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Guardas do catálogo da comunidade (ADR 030), que o Prisma não modela.
-- Exercício da comunidade nunca tem dono pessoa, e só exercício da comunidade
-- aponta para uma comunidade. É o que impede uma linha sem dono e sem
-- `groupOwned` de nascer apontando para um grupo, ou de cair no catálogo
-- público quando o `groupId` vira NULL.
ALTER TABLE "Exercise" ADD CONSTRAINT "Exercise_group_owned_has_no_user"
  CHECK (NOT "groupOwned" OR "createdByUserId" IS NULL);
ALTER TABLE "Exercise" ADD CONSTRAINT "Exercise_group_only_if_group_owned"
  CHECK ("groupId" IS NULL OR "groupOwned");
