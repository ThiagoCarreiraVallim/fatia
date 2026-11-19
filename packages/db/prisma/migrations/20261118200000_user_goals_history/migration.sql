-- #396: as metas do dia anteriores a cada troca (plano da comunidade ou à mão).
-- CreateTable
CREATE TABLE "UserGoalsHistory" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kcalMin" INTEGER NOT NULL,
    "kcalMax" INTEGER NOT NULL,
    "proteinMinG" INTEGER NOT NULL,
    "proteinMaxG" INTEGER NOT NULL,
    "carbsMinG" INTEGER NOT NULL,
    "carbsMaxG" INTEGER NOT NULL,
    "fatMinG" INTEGER NOT NULL,
    "fatMaxG" INTEGER NOT NULL,
    "weeklyWorkouts" INTEGER NOT NULL,
    "dailyStepsTarget" INTEGER NOT NULL,
    "dailyWaterTargetMl" INTEGER NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "templateId" TEXT,
    "templateTitle" TEXT,
    "replacedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserGoalsHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UserGoalsHistory_userId_replacedAt_idx" ON "UserGoalsHistory"("userId", "replacedAt");

-- CreateIndex
CREATE INDEX "UserGoalsHistory_templateId_idx" ON "UserGoalsHistory"("templateId");

-- AddForeignKey
ALTER TABLE "UserGoalsHistory" ADD CONSTRAINT "UserGoalsHistory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserGoalsHistory" ADD CONSTRAINT "UserGoalsHistory_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "GroupPlanTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

