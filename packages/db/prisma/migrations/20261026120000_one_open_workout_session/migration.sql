-- Uma sessão de treino aberta por pessoa (#350).
--
-- A API aceitava duas sessões abertas ao mesmo tempo: o "+" do app evitava, mas
-- duas abas, o MCP e o treino rápido chegavam ao `start` sem trava. A garantia
-- fica no banco, onde duas chamadas concorrentes não passam juntas.
--
-- Antes do índice, as abertas a mais de cada pessoa são encerradas: fica aberta
-- só a mais recente, que é a que o app mostra (`findActive` ordena por
-- `startedAt` desc). As outras recebem `completedAt = startedAt` — o fim real
-- não é conhecido (a série não guarda horário), e um fim inventado contaminaria
-- duração e volume. Nenhuma série é apagada.
WITH ordenadas AS (
  SELECT id,
         row_number() OVER (PARTITION BY "userId" ORDER BY "startedAt" DESC, id DESC) AS n
  FROM "WorkoutSession"
  WHERE "completedAt" IS NULL
)
UPDATE "WorkoutSession" s
SET "completedAt" = s."startedAt"
FROM ordenadas o
WHERE s.id = o.id AND o.n > 1;

-- Parcial: só a sessão aberta conta. O Prisma não descreve índice parcial no
-- schema; ele vive aqui, e o `schema.prisma` aponta para esta migration.
CREATE UNIQUE INDEX "WorkoutSession_one_open_per_user"
  ON "WorkoutSession" ("userId")
  WHERE "completedAt" IS NULL;
