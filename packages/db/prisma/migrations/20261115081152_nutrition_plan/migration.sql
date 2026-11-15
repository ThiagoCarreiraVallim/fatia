-- CreateEnum
CREATE TYPE "NutritionPlanStatus" AS ENUM ('SENT', 'ACCEPTED', 'SUPERSEDED');

-- CreateTable
CREATE TABLE "NutritionPlan" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "authorId" TEXT,
    "groupId" TEXT,
    "version" INTEGER NOT NULL,
    "status" "NutritionPlanStatus" NOT NULL DEFAULT 'SENT',
    "kcalMin" INTEGER NOT NULL,
    "kcalMax" INTEGER NOT NULL,
    "proteinMinG" INTEGER NOT NULL,
    "proteinMaxG" INTEGER NOT NULL,
    "carbsMinG" INTEGER NOT NULL,
    "carbsMaxG" INTEGER NOT NULL,
    "fatMinG" INTEGER NOT NULL,
    "fatMaxG" INTEGER NOT NULL,
    "applyGoals" BOOLEAN NOT NULL DEFAULT true,
    "note" TEXT,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acceptedAt" TIMESTAMP(3),
    "supersededAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NutritionPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NutritionPlanMeal" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "mealType" "MealType" NOT NULL,
    "name" TEXT NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "NutritionPlanMeal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NutritionPlanOption" (
    "id" TEXT NOT NULL,
    "mealId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "mealTemplateId" TEXT,

    CONSTRAINT "NutritionPlanOption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NutritionPlanItem" (
    "id" TEXT NOT NULL,
    "optionId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "foodId" INTEGER,
    "groupId" INTEGER,
    "foodName" TEXT NOT NULL,
    "grams" DOUBLE PRECISION NOT NULL,
    "kcal" DOUBLE PRECISION NOT NULL,
    "proteinG" DOUBLE PRECISION NOT NULL,
    "carbsG" DOUBLE PRECISION NOT NULL,
    "fatG" DOUBLE PRECISION NOT NULL,
    "nutrients" JSONB,
    "portionLabel" TEXT,
    "portionQuantity" DOUBLE PRECISION,
    "equivalenceGroup" TEXT,

    CONSTRAINT "NutritionPlanItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NutritionPlanEquivalent" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "foodId" INTEGER,
    "groupId" INTEGER,
    "foodName" TEXT NOT NULL,
    "grams" DOUBLE PRECISION NOT NULL,
    "kcal" DOUBLE PRECISION NOT NULL,
    "proteinG" DOUBLE PRECISION NOT NULL,
    "carbsG" DOUBLE PRECISION NOT NULL,
    "fatG" DOUBLE PRECISION NOT NULL,
    "nutrients" JSONB,
    "portionLabel" TEXT,
    "portionQuantity" DOUBLE PRECISION,

    CONSTRAINT "NutritionPlanEquivalent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NutritionPlanLog" (
    "id" TEXT NOT NULL,
    "planMealId" TEXT NOT NULL,
    "optionId" TEXT NOT NULL,
    "mealId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NutritionPlanLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NutritionSwap" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "equivalentId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "foodName" TEXT NOT NULL,
    "grams" DOUBLE PRECISION NOT NULL,
    "kcal" DOUBLE PRECISION NOT NULL,
    "mealItemId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "undoneAt" TIMESTAMP(3),

    CONSTRAINT "NutritionSwap_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "NutritionPlan_userId_status_idx" ON "NutritionPlan"("userId", "status");

-- CreateIndex
CREATE INDEX "NutritionPlan_authorId_idx" ON "NutritionPlan"("authorId");

-- CreateIndex
CREATE INDEX "NutritionPlan_groupId_idx" ON "NutritionPlan"("groupId");

-- CreateIndex
CREATE INDEX "NutritionPlanMeal_planId_idx" ON "NutritionPlanMeal"("planId");

-- CreateIndex
CREATE INDEX "NutritionPlanOption_mealId_idx" ON "NutritionPlanOption"("mealId");

-- CreateIndex
CREATE INDEX "NutritionPlanOption_mealTemplateId_idx" ON "NutritionPlanOption"("mealTemplateId");

-- CreateIndex
CREATE INDEX "NutritionPlanItem_optionId_idx" ON "NutritionPlanItem"("optionId");

-- CreateIndex
CREATE INDEX "NutritionPlanEquivalent_itemId_idx" ON "NutritionPlanEquivalent"("itemId");

-- CreateIndex
CREATE UNIQUE INDEX "NutritionPlanLog_mealId_key" ON "NutritionPlanLog"("mealId");

-- CreateIndex
CREATE INDEX "NutritionPlanLog_planMealId_date_idx" ON "NutritionPlanLog"("planMealId", "date");

-- CreateIndex
CREATE INDEX "NutritionSwap_planId_date_idx" ON "NutritionSwap"("planId", "date");

-- CreateIndex
CREATE INDEX "NutritionSwap_itemId_date_idx" ON "NutritionSwap"("itemId", "date");

-- AddForeignKey
ALTER TABLE "NutritionPlan" ADD CONSTRAINT "NutritionPlan_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NutritionPlan" ADD CONSTRAINT "NutritionPlan_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NutritionPlan" ADD CONSTRAINT "NutritionPlan_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NutritionPlanMeal" ADD CONSTRAINT "NutritionPlanMeal_planId_fkey" FOREIGN KEY ("planId") REFERENCES "NutritionPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NutritionPlanOption" ADD CONSTRAINT "NutritionPlanOption_mealId_fkey" FOREIGN KEY ("mealId") REFERENCES "NutritionPlanMeal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NutritionPlanOption" ADD CONSTRAINT "NutritionPlanOption_mealTemplateId_fkey" FOREIGN KEY ("mealTemplateId") REFERENCES "MealTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NutritionPlanItem" ADD CONSTRAINT "NutritionPlanItem_optionId_fkey" FOREIGN KEY ("optionId") REFERENCES "NutritionPlanOption"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NutritionPlanItem" ADD CONSTRAINT "NutritionPlanItem_foodId_fkey" FOREIGN KEY ("foodId") REFERENCES "Food"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NutritionPlanEquivalent" ADD CONSTRAINT "NutritionPlanEquivalent_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "NutritionPlanItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NutritionPlanEquivalent" ADD CONSTRAINT "NutritionPlanEquivalent_foodId_fkey" FOREIGN KEY ("foodId") REFERENCES "Food"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NutritionPlanLog" ADD CONSTRAINT "NutritionPlanLog_planMealId_fkey" FOREIGN KEY ("planMealId") REFERENCES "NutritionPlanMeal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NutritionPlanLog" ADD CONSTRAINT "NutritionPlanLog_optionId_fkey" FOREIGN KEY ("optionId") REFERENCES "NutritionPlanOption"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NutritionPlanLog" ADD CONSTRAINT "NutritionPlanLog_mealId_fkey" FOREIGN KEY ("mealId") REFERENCES "Meal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NutritionSwap" ADD CONSTRAINT "NutritionSwap_planId_fkey" FOREIGN KEY ("planId") REFERENCES "NutritionPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NutritionSwap" ADD CONSTRAINT "NutritionSwap_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "NutritionPlanItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NutritionSwap" ADD CONSTRAINT "NutritionSwap_equivalentId_fkey" FOREIGN KEY ("equivalentId") REFERENCES "NutritionPlanEquivalent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Um plano em uso por pessoa. O Prisma não descreve índice parcial: a corrida de
-- dois aceites ao mesmo tempo para aqui, e não numa conferência em código.
CREATE UNIQUE INDEX "NutritionPlan_one_accepted_per_user" ON "NutritionPlan"("userId") WHERE "status" = 'ACCEPTED';

-- Uma troca valendo por item e dia; as desfeitas ficam como trilha do diário.
CREATE UNIQUE INDEX "NutritionSwap_one_active_per_item_day" ON "NutritionSwap"("itemId", "date") WHERE "undoneAt" IS NULL;
