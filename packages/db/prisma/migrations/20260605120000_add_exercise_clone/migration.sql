-- Adiciona Exercise.clonedFromId: cópia editável de um exercício base.
-- A cópia (custom do usuário) referencia o base de origem; a base é escondida
-- das listagens do usuário quando existe uma cópia.

ALTER TABLE "Exercise" ADD COLUMN "clonedFromId" INTEGER;

CREATE INDEX "Exercise_clonedFromId_idx" ON "Exercise"("clonedFromId");

ALTER TABLE "Exercise" ADD CONSTRAINT "Exercise_clonedFromId_fkey" FOREIGN KEY ("clonedFromId") REFERENCES "Exercise"("id") ON DELETE SET NULL ON UPDATE CASCADE;
