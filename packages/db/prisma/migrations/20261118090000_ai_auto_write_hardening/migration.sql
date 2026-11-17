-- #385, revisão: gravação automática com estado pós-gravação, trava antes da escrita,
-- teto por resposta à mesma mensagem e limpeza das cópias de dado de saúde.
ALTER TABLE "AiAutoWrite" ALTER COLUMN "input" DROP NOT NULL;
ALTER TABLE "AiAutoWrite" ADD COLUMN "answerKey" TEXT;
UPDATE "AiAutoWrite" SET "answerKey" = "runId";
ALTER TABLE "AiAutoWrite" ALTER COLUMN "answerKey" SET NOT NULL;
ALTER TABLE "AiAutoWrite" ADD COLUMN "category" "AiWriteCategory";
ALTER TABLE "AiAutoWrite" ADD COLUMN "after" JSONB;
ALTER TABLE "AiAutoWrite" ADD COLUMN "card" JSONB;
ALTER TABLE "AiAutoWrite" ADD COLUMN "doneAt" TIMESTAMP(3);
UPDATE "AiAutoWrite" SET "doneAt" = "createdAt";
ALTER TABLE "AiAutoWrite" ADD COLUMN "clearedAt" TIMESTAMP(3);

DROP INDEX IF EXISTS "AiAutoWrite_conversationId_runId_idx";
CREATE INDEX "AiAutoWrite_conversationId_answerKey_idx" ON "AiAutoWrite"("conversationId", "answerKey");
CREATE INDEX "AiAutoWrite_createdAt_idx" ON "AiAutoWrite"("createdAt");
