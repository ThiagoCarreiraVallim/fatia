-- #405: biblioteca e enviar para alunos.
-- Rascunho do modelo (não publica nem envia), "o que mudou" e fim do plano flexível na versão
-- da oferta, e a proveniência do plano alimentar enviado a partir da biblioteca.
-- Nada destrutivo: só colunas novas; os modelos que já existem ficam como estão (draft = false).

-- AlterTable
ALTER TABLE "GroupPlanTemplate" ADD COLUMN     "draft" BOOLEAN NOT NULL DEFAULT false;

-- Rascunho nunca está na comunidade.
ALTER TABLE "GroupPlanTemplate" ADD CONSTRAINT "GroupPlanTemplate_draft_unpublished" CHECK (NOT ("draft" AND "publishedAt" IS NOT NULL));

-- AlterTable
ALTER TABLE "NutritionPlan" ADD COLUMN     "changeNote" TEXT,
ADD COLUMN     "sourceTemplateId" TEXT;

-- AlterTable
ALTER TABLE "PlanOfferVersion" ADD COLUMN     "changeNote" TEXT,
ADD COLUMN     "endDate" TEXT;

-- CreateIndex
CREATE INDEX "NutritionPlan_sourceTemplateId_idx" ON "NutritionPlan"("sourceTemplateId");

-- AddForeignKey
ALTER TABLE "NutritionPlan" ADD CONSTRAINT "NutritionPlan_sourceTemplateId_fkey" FOREIGN KEY ("sourceTemplateId") REFERENCES "GroupPlanTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
