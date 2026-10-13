-- AlterTable
ALTER TABLE "MealItem" ADD COLUMN     "portionLabel" TEXT,
ADD COLUMN     "portionQuantity" DOUBLE PRECISION;

-- CreateTable
CREATE TABLE "FoodPortion" (
    "id" TEXT NOT NULL,
    "foodId" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "grams" DOUBLE PRECISION NOT NULL,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FoodPortion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FoodPortion_foodId_idx" ON "FoodPortion"("foodId");

-- CreateIndex
CREATE INDEX "FoodPortion_createdByUserId_idx" ON "FoodPortion"("createdByUserId");

-- CreateIndex
CREATE UNIQUE INDEX "FoodPortion_foodId_label_createdByUserId_key" ON "FoodPortion"("foodId", "label", "createdByUserId");

-- AddForeignKey
ALTER TABLE "FoodPortion" ADD CONSTRAINT "FoodPortion_foodId_fkey" FOREIGN KEY ("foodId") REFERENCES "Food"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FoodPortion" ADD CONSTRAINT "FoodPortion_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
