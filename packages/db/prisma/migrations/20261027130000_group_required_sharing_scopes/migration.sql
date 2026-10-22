-- Escopos que a comunidade exige de quem entra como membro.
--
-- Default vazio: as comunidades que já existem seguem sem exigência, e ninguém
-- que já está dentro passa a dever nada — a regra vale para entradas novas e
-- para não tirar o que já se compartilha.
ALTER TABLE "Group" ADD COLUMN "requiredSharingScopes" "ShareScope"[] DEFAULT ARRAY[]::"ShareScope"[];
