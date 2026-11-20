# HANDOFF #404 — correções da revisão adversarial

Branch `redesign/404-equipe-papeis`, base feat 62fd8001. Não dar push.
Ponto de partida: rascunho do revisor em scratchpad `zz-review404.integration.spec.ts`
→ `apps/api/src/sharing/__tests__/team-review.integration.spec.ts`.

Itens (cada um: commit test vermelho, depois fix):

1. A1 narrowReceiverOps TOCTOU (update condicional revokedAt null) — todos os caminhos revoga+recria
2. A2 specialty zera em endMembership/activationOps; teamMemberLinksOps com specialty em activationOps/changeRole/transfer; CHECK na migration 20261120100000
3. A3 só OWNER concede PROFESSIONAL/CREATOR; admin só MEMBER/RECEPTION; requiredSharingScopes só dono
4. A4 revogar convites de equipe pendentes criados por quem perde papel/sai
5. A5 setRiskDays exige panel.review ou insights.read
6. A6 audit approve com papel de equipe, transfer, zeramento specialty; pro_see_only_assigned na mesma transação
7. A7 unban com canManageMember
8. Doc: fila de check-ins ignora proSeeOnlyAssigned (ADR 044)
   Fim: fetch + merge origin/main, migrate deploy em banco recriado, lint, typecheck, testes.

## Estado

- test vermelho A1–A7 commitado (team-review.integration.spec.ts, 9 its)
- fix A1–A7 feitos e verdes (api 4018, web 1212, mobile 582, api-client 1155). Falta: REDESIGN_PROGRESS (item 8 + bloco), merge origin/main, migrate deploy em banco novo, validação final.
