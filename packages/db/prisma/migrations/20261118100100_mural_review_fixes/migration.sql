-- Comunicados (#394, revisão): a âncora das repetições e as tentativas.
ALTER TABLE "GroupAnnouncement" ADD COLUMN "anchorAt" TIMESTAMP(3),
ADD COLUMN "attempts" INTEGER NOT NULL DEFAULT 0;

UPDATE "GroupAnnouncement" SET "anchorAt" = "nextRunAt" WHERE "nextRunAt" IS NOT NULL;

-- Posts automáticos (#394, revisão): um por conteúdo, garantido no banco.
-- Antes do índice, apaga as duplicatas que a corrida possa ter criado (fica a mais antiga).
DELETE FROM "GroupPost" p
USING "GroupPost" q
WHERE p."autoKind" IS NOT NULL
  AND p."groupId" = q."groupId"
  AND p."autoKind" = q."autoKind"
  AND p."autoRefId" = q."autoRefId"
  AND (p."createdAt", p."id") > (q."createdAt", q."id");

CREATE UNIQUE INDEX "GroupPost_groupId_autoKind_autoRefId_key" ON "GroupPost"("groupId", "autoKind", "autoRefId");

-- As comunidades que já existiam não passam a postar sozinhas: começam
-- desligadas e o dono liga na tela do mural. As novas seguem o default.
UPDATE "Group" SET "autoPosts" = ARRAY[]::"AutoPostKind"[];
