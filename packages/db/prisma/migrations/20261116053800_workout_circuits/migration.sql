-- Circuitos (#380): só acréscimos. Plano ganha o tipo (padrão STRENGTH, então
-- todo plano que existe continua igual), a configuração do circuito fica numa
-- tabela 1:1, e a sessão guarda o circuito em JSON versionado.

-- CreateEnum
CREATE TYPE "WorkoutPlanKind" AS ENUM ('STRENGTH', 'CIRCUIT');

-- CreateEnum
CREATE TYPE "CircuitFormat" AS ENUM ('AMRAP', 'EMOM', 'TABATA', 'FOR_TIME');

-- AlterTable
ALTER TABLE "WorkoutPlan" ADD COLUMN "kind" "WorkoutPlanKind" NOT NULL DEFAULT 'STRENGTH';

-- AlterTable
ALTER TABLE "WorkoutSession" ADD COLUMN "circuit" JSONB;

-- CreateTable
CREATE TABLE "CircuitConfig" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "format" "CircuitFormat" NOT NULL,
    "durationSeconds" INTEGER,
    "workSeconds" INTEGER,
    "restSeconds" INTEGER,
    "intervals" INTEGER,
    "rounds" INTEGER,
    "restBetweenRoundsSeconds" INTEGER,

    CONSTRAINT "CircuitConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CircuitConfig_planId_key" ON "CircuitConfig"("planId");

-- AddForeignKey
ALTER TABLE "CircuitConfig" ADD CONSTRAINT "CircuitConfig_planId_fkey" FOREIGN KEY ("planId") REFERENCES "WorkoutPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
