-- #382: conquista "100 treinos" (`workouts_100`), a décima do catálogo.
--
-- O catálogo vive em código (`achievement-catalog.ts`) e a avaliação é retroativa, então quem
-- abrir o app ganharia a conquista de qualquer jeito. Esta migration só adianta isso para quem
-- já passou dos 100 treinos concluídos, com a data do 100º — a mesma que a avaliação carimbaria.
-- Aditiva e idempotente: o unique (userId, key) e o ON CONFLICT não duplicam nem reescrevem.
INSERT INTO "UserAchievement" ("id", "userId", "key", "unlockedAt", "context")
SELECT gen_random_uuid(), ranked."userId", 'workouts_100', ranked."completedAt", '{"count": 100}'::jsonb
FROM (
  SELECT "userId", "completedAt",
         ROW_NUMBER() OVER (PARTITION BY "userId" ORDER BY "completedAt" ASC) AS n
  FROM "WorkoutSession"
  WHERE "completedAt" IS NOT NULL
) AS ranked
WHERE ranked.n = 100
ON CONFLICT ("userId", "key") DO NOTHING;
