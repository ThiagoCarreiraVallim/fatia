-- #400: relatório do mês (meta da equipe e e-mail mensal) e origens dos convites.

-- AlterTable
ALTER TABLE "Group" ADD COLUMN     "reportEmailEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "reportEmailMonth" TEXT,
ADD COLUMN     "reportEmailClaimedAt" TIMESTAMP(3),
ADD COLUMN     "weeklySessionsGoal" INTEGER;

-- AlterTable
ALTER TABLE "GroupMembership" ADD COLUMN     "reportEmail" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "reportEmailOptOutAt" TIMESTAMP(3);

-- A meta é de sessões por semana da comunidade inteira: positiva e com teto.
ALTER TABLE "Group" ADD CONSTRAINT "Group_weeklySessionsGoal_check"
  CHECK ("weeklySessionsGoal" IS NULL OR ("weeklySessionsGoal" BETWEEN 1 AND 100000));

-- O mês mandado é sempre YYYY-MM: a comparação de texto ordena como data.
ALTER TABLE "Group" ADD CONSTRAINT "Group_reportEmailMonth_check"
  CHECK ("reportEmailMonth" IS NULL OR "reportEmailMonth" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$');

-- CreateTable
CREATE TABLE "MonthReportSnapshot" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MonthReportSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MonthReportSnapshot_groupId_month_key" ON "MonthReportSnapshot"("groupId", "month");

-- AddForeignKey
ALTER TABLE "MonthReportSnapshot" ADD CONSTRAINT "MonthReportSnapshot_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MonthReportSnapshot" ADD CONSTRAINT "MonthReportSnapshot_month_check"
  CHECK ("month" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$');

-- As comunidades que já existem no deploy começam no mês anterior: o 1º
-- e-mail é o do mês do deploy, no 1º dia útil do mês seguinte, e nada sai
-- no meio do mês.
UPDATE "Group"
  SET "reportEmailMonth" = to_char((now() AT TIME ZONE 'America/Sao_Paulo') - interval '1 month', 'YYYY-MM');
