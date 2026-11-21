-- Editor de plano alimentar da equipe (#407): horário e chave estável da refeição,
-- chave do item e do grupo de equivalentes, os grupos do editor e quem salvou a
-- versão pela cópia do aluno. Só colunas novas, todas opcionais.

-- AlterTable
ALTER TABLE "NutritionPlan" ADD COLUMN     "editedById" TEXT,
ADD COLUMN     "equivalenceGroups" JSONB;

-- AlterTable
ALTER TABLE "NutritionPlanItem" ADD COLUMN     "groupKey" TEXT,
ADD COLUMN     "key" TEXT;

-- AlterTable
ALTER TABLE "NutritionPlanMeal" ADD COLUMN     "key" TEXT,
ADD COLUMN     "time" TEXT;

-- CreateIndex
CREATE INDEX "NutritionPlan_editedById_idx" ON "NutritionPlan"("editedById");

-- AddForeignKey
ALTER TABLE "NutritionPlan" ADD CONSTRAINT "NutritionPlan_editedById_fkey" FOREIGN KEY ("editedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

