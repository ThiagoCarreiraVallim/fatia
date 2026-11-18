-- #395, correções da revisão: edição de água e passos (editedAt), o fim da sessão
-- pelo relógio do servidor (serverCompletedAt; as sessões antigas ficam nulas e
-- não liberam check-in) e um treino valendo um só check-in por desafio.

-- AlterTable
ALTER TABLE "StepLog" ADD COLUMN     "editedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "WaterLog" ADD COLUMN     "editedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "WorkoutSession" ADD COLUMN     "serverCompletedAt" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "ChallengeCheckin_participantId_workoutSessionId_key" ON "ChallengeCheckin"("participantId", "workoutSessionId");

