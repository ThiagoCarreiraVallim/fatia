-- Catálogo de exercícios e dicas da equipe (#408): passos, erros comuns, selo
-- "dá para fazer em casa" e padrão no plano no guia da comunidade; favorito da
-- equipe; duração do vídeo lida no confirm.

-- AlterTable
ALTER TABLE "GroupExerciseGuide" ADD COLUMN     "commonMistakes" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "defaultLoadMode" "PlanLoadMode",
ADD COLUMN     "defaultReps" TEXT,
ADD COLUMN     "defaultRestSeconds" INTEGER,
ADD COLUMN     "defaultSets" INTEGER,
ADD COLUMN     "homeFriendly" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "steps" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "MediaFile" ADD COLUMN     "durationMs" INTEGER;

-- CreateTable
CREATE TABLE "GroupExerciseFavorite" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "exerciseId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GroupExerciseFavorite_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GroupExerciseFavorite_exerciseId_idx" ON "GroupExerciseFavorite"("exerciseId");

-- CreateIndex
CREATE UNIQUE INDEX "GroupExerciseFavorite_groupId_exerciseId_key" ON "GroupExerciseFavorite"("groupId", "exerciseId");

-- AddForeignKey
ALTER TABLE "GroupExerciseFavorite" ADD CONSTRAINT "GroupExerciseFavorite_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupExerciseFavorite" ADD CONSTRAINT "GroupExerciseFavorite_exerciseId_fkey" FOREIGN KEY ("exerciseId") REFERENCES "Exercise"("id") ON DELETE CASCADE ON UPDATE CASCADE;

