-- AlterTable: micronutrientes opcionais (snapshot) por item de refeição
ALTER TABLE "MealItem" ADD COLUMN "nutrients" JSONB;

-- CreateTable: metas de nutrientes personalizadas (ADR 009)
CREATE TABLE "NutrientTarget" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "nutrientKey" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "min" DOUBLE PRECISION,
    "max" DOUBLE PRECISION,
    "period" TEXT NOT NULL DEFAULT 'daily',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NutrientTarget_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "NutrientTarget_userId_idx" ON "NutrientTarget"("userId");
CREATE UNIQUE INDEX "NutrientTarget_userId_nutrientKey_key" ON "NutrientTarget"("userId", "nutrientKey");

ALTER TABLE "NutrientTarget" ADD CONSTRAINT "NutrientTarget_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
