# HANDOFF #395 — rodada "passos fechados + merge da main"

Pedido do coordenador (depois de 488f8927):

1. Bloquear criar desafio STEPS e item `steps` em POINTS até existir sync de saúde
   (API 400 com mensagem clara, painel web, painel app, MCP). STEPS existentes
   continuam aparecendo e editáveis mantendo passos. ADR 047 + REDESIGN_PROGRESS:
   "libera junto com a sync de saúde". Teste vermelho primeiro (commit separado).
2. Merge de origin/main (a #393 entrou por squash, #446), sem rebase. Migrations
   3000xx continuam as últimas depois de 20261118100000_community_entry_code_benefits.
   Regenerar MCP pelos specs; lint, typecheck, testes no fatia_t395. Sem push.

Plano da API: `assertStepsOpen` no ChallengeService (create e update), usando
`STEPS_SYNC_AVAILABLE=false` em social/challenge-days.ts; update aceita manter
passos se a linha já usava. Testes criam desafio de passos direto no banco
(emAndamento do spec de check-in usa normalizeRules + prisma.update).
Client: STEPS_SYNC_AVAILABLE, CREATABLE_CHALLENGE_KINDS e CREATABLE_POINT_ITEMS.
MCP: não há tool que crie desafio; só a descrição do list avisa.

Estado: (atualizar a cada commit)

- [x] testes vermelhos API (ffe58798)
- [x] fix API (assertStepsOpen)
- [x] client+web+app (testes 6e71c007, fix no commit seguinte)
- [x] MCP descrição e docs (d4485829)
- [x] merge origin/main (base 9adc2e5a via merge-tree; só conflitos de MCP, lado da #395)
- [ ] regenerar MCP, lint/typecheck/testes (recriar fatia_t395: a migration da 393 mudou de nome)
