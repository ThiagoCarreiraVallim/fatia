# HANDOFF #394 — correções da revisão adversarial

Worktree `.claude/worktrees/394-mural`, branch `redesign/394-mural`. Banco de teste: `fatia_t394`
(env no scratchpad `t394.env`; se sumiu, recriar com o DATABASE_URL do `.env` da raiz trocando
`/fatia` por `/fatia_t394`). Testes da api: `cd apps/api && set -a && . <env> && set +a && npx jest <path>`.

## Itens

- [x] 1. Enquete: % só com total-1 >= 5 para quem votou; voto não se apaga (só troca); UI web/app/MCP
- [x] 2. Corrida no teto de 3 fixados (advisory lock por grupo) + reorder tolera > 3
- [x] 3. Recorrência no fuso do grupo, mensal ancorada no dia original
- [x] 4. Atrasados: avança até passar de now, publica uma vez
- [x] 5. Erro transitório tenta de novo com contador; só cancela autor inativo/sem permissão
- [x] 6. Papel perdido: confere no disparo; cancela agendados ao mudar papel/banir/sair
- [x] 7. Testes: bloqueado sem aviso de verdade; runDue em paralelo
- [x] 8. Para você: respeita ocultar; próprio comunicado não é não lido
- [x] 9. Posts automáticos: unique + P2002; existentes desligados (migration 20261118100100)
- [ ] 10. Prévia do chat: opcaoDaEnquete com filtro de bloqueio
- [ ] 11. lint, typecheck, testes; REDESIGN_PROGRESS; apagar HANDOFF

## Próximo passo

Item 10 (opcaoDaEnquete com filtro de bloqueio); depois docs e verificação final.

## Notas

- Migration nova `20261118100100_mural_review_fixes` (anchorAt, attempts). O item 9 acrescenta
  o unique dos automáticos e desliga os automáticos dos grupos existentes nela mesma; aplicar no
  `fatia_t394` à mão (psql) ou recriar o banco e rodar `prisma migrate deploy`.
- Testes novos de comunicado olham o post do próprio comunicado (`saidos`), não o retorno do
  `runDue`, que conta sobras de outros testes.
