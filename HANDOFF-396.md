# HANDOFF #396 — rodada de correções da revisão

Branch `redesign/396-conteudo-equipe`; só commits novos (sem rebase). Banco `fatia_t396` (env no scratchpad `env396.sh`).

## Itens (coordenador)

1. [ ] upsertWithHistory(db, userId, dto, origin) — onboarding (manual) e plano da IA (nutrition_plan); teste vermelho cada.
2. [ ] histórico em $transaction com SELECT … FOR UPDATE; teste concorrente = 1 linha.
3. [ ] upsert devolve { goals, previous, historyWritten }; adotar usa; mensagem só com historyWritten; sem leitura dupla.
4. [ ] aviso "ficam no histórico" só com metas atuais (web e app).
5. [ ] "Dica de {nome}" (web e app).
6. [ ] authorRole em lote por lista.
7. [ ] web: guia com vídeo mostra a 1ª foto ao tocar nela.
8. [ ] testes PENDING/BANNED em getTipForMember/getForMember/equipmentForMember; "sem mudança" sem atalho do mock.

Fim: merge de origin/redesign/393-comunidades se existir; lint, typecheck, testes; apagar este arquivo.
