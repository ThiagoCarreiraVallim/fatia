# HANDOFF #393 — correções da revisão adversarial

Branch `redesign/393-comunidades`, só commits novos (sem rebase/amend; #395 e #396 partem de 9adc2e5a).
DB de teste: fatia_t393 (URL no scratchpad `turl`).

## Itens

- [x] B1 slug só em comunidade PUBLIC; preview por código sem slug
- [x] I1 throttle real (UserThrottlerGuard) em preview/join + teste 429 + teto no join_group MCP
- [x] I2 proPaidByThisGroup no GroupSummary e nos 4 pontos
- [x] m1 ValidateIf code == null
- [x] m2 maxLength 60 parceiro
- [x] m3 PATCH validUntil só se mudou
- [x] m4 cupom só trim
- [x] m5 proOffer só ALL_MEMBERS; SEATS "pode liberar"
- [x] m6 parseCommunityEntry normaliza espaços, código antes de token
- [x] m7 contraste do vencido
- [x] m8 doc-comment GroupExerciseGuide
- [x] m9 testes maxUses esgotado e corrida

## Próximo passo

docs (REDESIGN_PROGRESS) e checagens finais; apagar o HANDOFF.
