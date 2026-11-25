-- Foto do prato nunca é obrigatória (#413): a API recusa ao criar e ao marcar.
-- Comunidade criada antes da trava sai dela; quem já compartilha segue
-- compartilhando, porque o consentimento de cada membro não muda aqui.
UPDATE "Group"
SET "requiredSharingScopes" = array_remove("requiredSharingScopes", 'MEAL_PHOTOS'::"ShareScope")
WHERE 'MEAL_PHOTOS' = ANY("requiredSharingScopes");
