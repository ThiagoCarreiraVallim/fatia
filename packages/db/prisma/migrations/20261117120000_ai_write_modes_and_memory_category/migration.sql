-- CreateEnum
CREATE TYPE "MemoryCategory" AS ENUM ('PREFERENCE', 'ROUTINE', 'TRAINING', 'HABIT');

-- CreateEnum
CREATE TYPE "AiWriteCategory" AS ENUM ('DAY_LOG', 'WORKOUT', 'GOALS', 'MEMORIES');

-- CreateEnum
CREATE TYPE "AiWriteMode" AS ENUM ('ASK', 'AUTO', 'OFF');

-- AlterTable
ALTER TABLE "UserMemory" ADD COLUMN     "category" "MemoryCategory";

-- CreateTable
CREATE TABLE "AiWriteModeSetting" (
    "userId" TEXT NOT NULL,
    "category" "AiWriteCategory" NOT NULL,
    "mode" "AiWriteMode" NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiWriteModeSetting_pkey" PRIMARY KEY ("userId","category")
);

-- CreateTable
CREATE TABLE "AiAutoWrite" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "toolCallId" TEXT NOT NULL,
    "tool" TEXT NOT NULL,
    "input" JSONB NOT NULL,
    "result" JSONB,
    "before" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "undoneAt" TIMESTAMP(3),

    CONSTRAINT "AiAutoWrite_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AiAutoWrite_conversationId_runId_idx" ON "AiAutoWrite"("conversationId", "runId");

-- CreateIndex
CREATE UNIQUE INDEX "AiAutoWrite_userId_toolCallId_key" ON "AiAutoWrite"("userId", "toolCallId");

-- AddForeignKey
ALTER TABLE "AiWriteModeSetting" ADD CONSTRAINT "AiWriteModeSetting_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiAutoWrite" ADD CONSTRAINT "AiAutoWrite_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiAutoWrite" ADD CONSTRAINT "AiAutoWrite_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

