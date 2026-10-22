-- Reordenar e tirar exercícios durante o treino, só naquela sessão.
--
-- A sessão projeta os exercícios do plano ao vivo (`plannedExercises`), então
-- mudar a ordem ou remover no plano mudaria todos os treinos seguintes. Estas
-- duas colunas guardam o ajuste na própria sessão; vazias, vale o plano.
ALTER TABLE "WorkoutSession"
  ADD COLUMN "exerciseOrder" INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[],
  ADD COLUMN "removedExerciseIds" INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[];
