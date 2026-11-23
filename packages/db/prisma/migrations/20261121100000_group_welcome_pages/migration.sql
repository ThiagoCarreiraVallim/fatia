-- Páginas de boas-vindas da comunidade (#410). Só aditiva.
-- Os CHECKs de título e texto são teto de segurança em pontos de código: o
-- limite de verdade (80 e 300 grafemas, como o aluno vê) fica na API.

-- CreateEnum
CREATE TYPE "GroupWelcomeKind" AS ENUM ('COVER', 'PLAIN');

-- AlterTable
ALTER TABLE "Group" ADD COLUMN "welcomePublishedAt" TIMESTAMP(3),
ADD COLUMN "welcomeShowOnJoin" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "GroupWelcomePage" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "kind" "GroupWelcomeKind" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "showTeam" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GroupWelcomePage_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "GroupWelcomePage_position_check" CHECK ("position" BETWEEN 1 AND 3),
    CONSTRAINT "GroupWelcomePage_title_check" CHECK (char_length("title") BETWEEN 1 AND 600),
    CONSTRAINT "GroupWelcomePage_body_check" CHECK (char_length("body") <= 2000)
);

-- CreateIndex
CREATE UNIQUE INDEX "GroupWelcomePage_groupId_position_key" ON "GroupWelcomePage"("groupId", "position");

-- AddForeignKey
ALTER TABLE "GroupWelcomePage" ADD CONSTRAINT "GroupWelcomePage_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;
