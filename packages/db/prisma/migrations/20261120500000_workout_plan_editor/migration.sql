-- Editor de plano de treino da equipe (#406): sessões como planos (sessionIndex e
-- a chave estável sessionKey),
-- circuito dentro da sessão, campos novos da linha, etiquetas e período do modelo
-- e quem escreveu cada versão da oferta.

-- CreateEnum
CREATE TYPE "PlanCircuitFormat" AS ENUM ('AMRAP', 'EMOM', 'TABATA', 'FOR_TIME', 'ROUNDS');

-- AlterEnum
ALTER TYPE "PlanRepUnit" ADD VALUE 'MAX';
ALTER TYPE "PlanRepUnit" ADD VALUE 'METERS';

-- AlterEnum
ALTER TYPE "PlanLoadMode" ADD VALUE 'PERCENT_1RM';
ALTER TYPE "PlanLoadMode" ADD VALUE 'BAND';

-- AlterEnum
ALTER TYPE "CardioTargetKind" ADD VALUE 'CALORIES';

-- AlterTable
ALTER TABLE "WorkoutPlan" ADD COLUMN     "sessionIndex" INTEGER;
ALTER TABLE "WorkoutPlan" ADD COLUMN     "sessionKey" TEXT;

-- AlterTable
ALTER TABLE "WorkoutPlanExercise" ADD COLUMN     "cardioCalories" INTEGER,
ADD COLUMN     "cardioInclinePercent" DOUBLE PRECISION,
ADD COLUMN     "cardioPaceSecondsPerKm" INTEGER,
ADD COLUMN     "cardioRpe" INTEGER,
ADD COLUMN     "cardioZone" INTEGER,
ADD COLUMN     "circuitId" TEXT,
ADD COLUMN     "loadPercent" INTEGER,
ADD COLUMN     "warmupBefore" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "PlanOfferVersion" ADD COLUMN     "authorId" TEXT;

-- AlterTable
ALTER TABLE "GroupPlanTemplate" ADD COLUMN     "endDate" TEXT,
ADD COLUMN     "schedule" "PlanSchedule",
ADD COLUMN     "startDate" TEXT,
ADD COLUMN     "tags" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateTable
CREATE TABLE "WorkoutPlanCircuit" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "name" TEXT,
    "format" "PlanCircuitFormat" NOT NULL,
    "durationSeconds" INTEGER,
    "workSeconds" INTEGER,
    "restSeconds" INTEGER,
    "intervals" INTEGER,
    "rounds" INTEGER,
    "restBetweenRoundsSeconds" INTEGER,
    "timeCapSeconds" INTEGER,

    CONSTRAINT "WorkoutPlanCircuit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WorkoutPlanCircuit_planId_idx" ON "WorkoutPlanCircuit"("planId");

-- CreateIndex
CREATE INDEX "WorkoutPlanExercise_circuitId_idx" ON "WorkoutPlanExercise"("circuitId");

-- AddForeignKey
ALTER TABLE "WorkoutPlanCircuit" ADD CONSTRAINT "WorkoutPlanCircuit_planId_fkey" FOREIGN KEY ("planId") REFERENCES "WorkoutPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkoutPlanExercise" ADD CONSTRAINT "WorkoutPlanExercise_circuitId_fkey" FOREIGN KEY ("circuitId") REFERENCES "WorkoutPlanCircuit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

