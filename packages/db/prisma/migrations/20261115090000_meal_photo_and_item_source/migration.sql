-- #374 (ADR 038): foto da refeição guardada, origem do item e a categoria de
-- compartilhamento "Fotos das refeições". Nada destrutivo: colunas novas com
-- padrão e um valor novo de enum, que nenhum consentimento antigo inclui.

-- CreateEnum
CREATE TYPE "MealItemSource" AS ENUM ('MANUAL', 'AI', 'PLAN', 'BARCODE');

-- AlterEnum
ALTER TYPE "ShareScope" ADD VALUE 'MEAL_PHOTOS';

-- AlterTable
ALTER TABLE "Meal" ADD COLUMN     "photoFileId" TEXT;

-- AlterTable
ALTER TABLE "MealItem" ADD COLUMN     "source" "MealItemSource" NOT NULL DEFAULT 'MANUAL';

-- CreateIndex
CREATE UNIQUE INDEX "Meal_photoFileId_key" ON "Meal"("photoFileId");

-- AddForeignKey
ALTER TABLE "Meal" ADD CONSTRAINT "Meal_photoFileId_fkey" FOREIGN KEY ("photoFileId") REFERENCES "MediaFile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

