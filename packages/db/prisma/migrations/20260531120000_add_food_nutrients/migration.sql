-- AlterTable: micronutrientes do catálogo (por 100g), para derivar MealItem.nutrients (ADR 009)
ALTER TABLE "Food" ADD COLUMN "nutrients" JSONB;
