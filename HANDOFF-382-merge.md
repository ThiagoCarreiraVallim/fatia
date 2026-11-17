# HANDOFF #382 merge com main (#381) + passe visual

## Feito

- Conflitos resolvidos (ainda não commitado o merge):
  - listPersonalRecords: cardio somado por sessão (#381) + monthEvolution só concluídas (#382); id da sessão vem de `s.sessionId` (tirado `session.id` do select).
  - workout-session.service: imports dos dois lados (hooks + history/cursor).
  - SHA_ENTIDADE regenerado (2af00531...), payload 138,6 k / 115,6 k, 153 tools em README/ARCHITECTURE/SUBMISSION_CHECKLIST/site/MCP docs; 83 tools de escrita com exemplo (inalterado, medido).
  - REDESIGN_PROGRESS: Etapa 5 com #381 e #382 (pendências da #382 movidas para dentro da Etapa 5).
- migrate deploy + db:generate no banco dev; fatia_t382 migrado.

## Próximo passo

- lint, typecheck, testes (api com DATABASE_URL de fatia_t382), commitar o merge.
- Depois: passe visual (docs/VISUAL_CHECK.md), 8 pranchas.

## Prints

- ~/.cache/fatia-vis/382/{board,web,app}/
