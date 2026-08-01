-- Nome normalizado para busca, em Food e Exercise.
--
-- Motivo: a busca era `contains` direto no `name`, então "feijao" não achava
-- "Feijão tropeiro" e "supino" trazia "Arremesso Supino" antes de "Supino Reto".
-- Ver apps/api/src/common/search-text.ts.
--
-- A coluna é mantida pela aplicação (FoodService / ExerciseService) e pelos
-- seeds, e não por coluna gerada do Postgres: o Prisma 5 não modela
-- `GENERATED ALWAYS AS`, e a divergência entre migration e datamodel faria o job
-- `Prisma Checks` do CI acusar drift a cada execução.

ALTER TABLE "Food" ADD COLUMN "searchName" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Exercise" ADD COLUMN "searchName" TEXT NOT NULL DEFAULT '';

-- Backfill do catálogo já semeado (597 alimentos, 869 exercícios).
--
-- `translate` cobre os diacríticos do português e é IMMUTABLE, o que dispensa a
-- extensão `unaccent` — que existe no Postgres oficial mas exige superusuário
-- para instalar e não é garantida em todo ambiente gerenciado.
--
-- A pontuação vira espaço e os espaços são colapsados, espelhando o
-- `normalizeSearchText` do TypeScript. Os nomes da TACO são segmentados por
-- vírgula ("Arroz, tipo 1, cozido"): sem isso, "arroz tipo 1" não casaria.
CREATE OR REPLACE FUNCTION fatia_normalize_search(input TEXT)
RETURNS TEXT AS $$
  SELECT btrim(
    regexp_replace(
      lower(
        translate(
          input,
          'áàâãäåéèêëíìîïóòôõöúùûüçñýÿÁÀÂÃÄÅÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑÝ',
          'aaaaaaeeeeiiiiooooouuuucnyyAAAAAAEEEEIIIIOOOOOUUUUCNY'
        )
      ),
      '[^a-z0-9]+', ' ', 'g'
    )
  );
$$ LANGUAGE SQL IMMUTABLE;

UPDATE "Food" SET "searchName" = fatia_normalize_search("name");
UPDATE "Exercise" SET "searchName" = fatia_normalize_search("name");

-- A função existe só para o backfill; a aplicação normaliza em TypeScript.
-- Mantê-la seria uma segunda definição da mesma regra, livre para divergir.
DROP FUNCTION fatia_normalize_search(TEXT);

CREATE INDEX "Food_searchName_idx" ON "Food"("searchName");
CREATE INDEX "Exercise_searchName_idx" ON "Exercise"("searchName");
