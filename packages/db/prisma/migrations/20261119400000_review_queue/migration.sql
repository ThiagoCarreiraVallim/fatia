-- #399: fila "Para revisar" (visto por pessoa da equipe), "Em risco" e a reação e o comentário da equipe no treino feito.

-- CreateEnum
CREATE TYPE "ReviewKind" AS ENUM ('WORKOUT', 'GOAL', 'PLAN_RESPONSE');

-- CreateEnum
CREATE TYPE "SessionReaction" AS ENUM ('STRONG', 'FIRE', 'CLAP', 'HEART');

-- AlterTable
ALTER TABLE "Group" ADD COLUMN     "riskDays" INTEGER NOT NULL DEFAULT 7;

-- AlterTable
ALTER TABLE "GroupMembership" ADD COLUMN     "riskDigest" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "riskDigestOn" TEXT;

-- CreateTable
CREATE TABLE "ReviewSeen" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "subjectUserId" TEXT NOT NULL,
    "kind" "ReviewKind" NOT NULL,
    "refId" TEXT NOT NULL,
    "seenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReviewSeen_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SessionFeedback" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "authorId" TEXT,
    "reaction" "SessionReaction",
    "body" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SessionFeedback_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ReviewSeen_groupId_subjectUserId_idx" ON "ReviewSeen"("groupId", "subjectUserId");

-- CreateIndex
CREATE INDEX "ReviewSeen_subjectUserId_idx" ON "ReviewSeen"("subjectUserId");

-- CreateIndex
CREATE UNIQUE INDEX "ReviewSeen_userId_groupId_kind_refId_key" ON "ReviewSeen"("userId", "groupId", "kind", "refId");

-- CreateIndex
CREATE INDEX "SessionFeedback_groupId_idx" ON "SessionFeedback"("groupId");

-- CreateIndex
CREATE INDEX "SessionFeedback_authorId_idx" ON "SessionFeedback"("authorId");

-- CreateIndex
CREATE UNIQUE INDEX "SessionFeedback_sessionId_authorId_key" ON "SessionFeedback"("sessionId", "authorId");

-- AddForeignKey
ALTER TABLE "ReviewSeen" ADD CONSTRAINT "ReviewSeen_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewSeen" ADD CONSTRAINT "ReviewSeen_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewSeen" ADD CONSTRAINT "ReviewSeen_subjectUserId_fkey" FOREIGN KEY ("subjectUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionFeedback" ADD CONSTRAINT "SessionFeedback_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "WorkoutSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionFeedback" ADD CONSTRAINT "SessionFeedback_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionFeedback" ADD CONSTRAINT "SessionFeedback_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Limite do "Em risco": de 3 a 60 dias.
ALTER TABLE "Group" ADD CONSTRAINT "Group_riskDays_range" CHECK ("riskDays" BETWEEN 3 AND 60);

-- O comentário é curto e a linha nunca nasce vazia: reação, texto ou os dois.
ALTER TABLE "SessionFeedback" ADD CONSTRAINT "SessionFeedback_body_length" CHECK ("body" IS NULL OR char_length("body") BETWEEN 1 AND 500);
ALTER TABLE "SessionFeedback" ADD CONSTRAINT "SessionFeedback_not_empty" CHECK ("reaction" IS NOT NULL OR "body" IS NOT NULL);
