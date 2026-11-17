-- #381 (review): a sessão guarda o retrato do plano ao começar, e o plano
-- guarda a sessão de onde veio. Só acrescenta: duas colunas em WorkoutSession,
-- uma em WorkoutPlan, um índice único e uma FK que vira nula.

-- Retrato do plano: apagar o plano zera `planId` (ON DELETE SET NULL), e sem
-- isto a sessão passava a "Treino livre" no histórico.
ALTER TABLE "WorkoutSession" ADD COLUMN     "fromPlan" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "planName" TEXT;

-- Preenche as sessões que ainda apontam para o plano. As de planos já apagados
-- não têm mais de onde tirar o nome e seguem como treino livre.
UPDATE "WorkoutSession" AS s
SET "fromPlan" = true, "planName" = p."name"
FROM "WorkoutPlan" AS p
WHERE s."planId" = p."id";

-- "Salvar como plano" idempotente: um plano por sessão, por pessoa.
ALTER TABLE "WorkoutPlan" ADD COLUMN     "fromSessionId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "WorkoutPlan_userId_fromSessionId_key" ON "WorkoutPlan"("userId", "fromSessionId");

-- AddForeignKey
ALTER TABLE "WorkoutPlan" ADD CONSTRAINT "WorkoutPlan_fromSessionId_fkey" FOREIGN KEY ("fromSessionId") REFERENCES "WorkoutSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;
