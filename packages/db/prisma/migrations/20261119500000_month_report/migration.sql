-- #400: relatório do mês (meta da equipe e e-mail mensal) e origens dos convites.

-- AlterTable
ALTER TABLE "Group" ADD COLUMN     "reportEmailEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "reportEmailMonth" TEXT,
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
