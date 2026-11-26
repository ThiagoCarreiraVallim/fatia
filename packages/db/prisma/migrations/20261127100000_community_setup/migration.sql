-- #372: onboarding de quem cria a comunidade. Só aditiva: o subtipo da
-- patrocinada (academia × personal ou nutri) e o estado do checklist de 9
-- passos do dono.

-- CreateEnum
CREATE TYPE "GroupKind" AS ENUM ('GYM', 'COACH');

-- CreateEnum
CREATE TYPE "SetupStep" AS ENUM ('BRAND', 'CATEGORIES', 'TEAM', 'MEMBERS', 'CHALLENGE', 'PLAN', 'EQUIPMENT', 'ACCESS');

-- AlterTable
ALTER TABLE "Group" ADD COLUMN     "kind" "GroupKind",
ADD COLUMN     "setupHiddenAt" TIMESTAMP(3),
ADD COLUMN     "setupRepeatedAt" TIMESTAMP(3),
ADD COLUMN     "setupSteps" "SetupStep"[] DEFAULT ARRAY[]::"SetupStep"[];

-- As patrocinadas de antes eram tratadas como academia (equipamentos, equipe).
UPDATE "Group" SET "kind" = 'GYM' WHERE "type" = 'SPONSORED';

-- As comunidades que já existem não passaram pelo onboarding: a marca conta
-- como feita (o painel não as trava na tela da marca) e o guia nasce
-- escondido. O dono pode abrir com "Repetir o guia".
UPDATE "Group" SET "setupSteps" = ARRAY['BRAND']::"SetupStep"[], "setupHiddenAt" = CURRENT_TIMESTAMP;
