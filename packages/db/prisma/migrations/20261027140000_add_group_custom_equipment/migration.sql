-- Equipamentos que a academia nomeia por conta própria, fora da lista (Fase 7b).
--
-- Coluna à parte de `equipment`, e não nomes livres misturados nela: `equipment`
-- só guarda chaves da lista, que a API valida e que o filtro "Na minha
-- academia" sabe traduzir para o catálogo. O nome próprio só casa com o
-- equipamento gravado no exercício, e a tela precisa saber quais a academia
-- pode apagar.
ALTER TABLE "Group" ADD COLUMN "customEquipment" TEXT[] DEFAULT ARRAY[]::TEXT[];
