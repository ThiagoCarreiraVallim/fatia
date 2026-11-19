-- #402 (revisão): a trilha guarda a comunidade da leitura, e a abertura da
-- ficha entra sem categoria.
ALTER TABLE "ProfessionalAccessLog" ADD COLUMN "groupId" TEXT;
ALTER TABLE "ProfessionalAccessLog" ALTER COLUMN "scope" DROP NOT NULL;
CREATE INDEX "ProfessionalAccessLog_subjectUserId_groupId_at_idx" ON "ProfessionalAccessLog"("subjectUserId", "groupId", "at");
