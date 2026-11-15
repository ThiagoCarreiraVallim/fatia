-- AlterTable
ALTER TABLE "Food" ADD COLUMN     "barcode" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Food_createdByUserId_barcode_key" ON "Food"("createdByUserId", "barcode");

