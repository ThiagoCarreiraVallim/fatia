# HANDOFF #394 — correções da revisão adversarial

Worktree `.claude/worktrees/394-mural`, branch `redesign/394-mural`. Banco de teste: `fatia_t394`
(env no scratchpad `t394.env`; se sumiu, recriar com o DATABASE_URL do `.env` da raiz trocando
`/fatia` por `/fatia_t394`). Testes da api: `cd apps/api && set -a && . <env> && set +a && npx jest <path>`.

## Itens

- [x] 1. Enquete: % só com total-1 >= 5 para quem votou; voto não se apaga (só troca); UI web/app/MCP
- [x] 2. Corrida no teto de 3 fixados (advisory lock por grupo) + reorder tolera > 3
- [ ] 3. Recorrência no fuso do grupo, mensal ancorada no dia original
- [ ] 4. Atrasados: avança até passar de now, publica uma vez
- [ ] 5. Erro transitório tenta de novo com contador; só cancela autor inativo/sem permissão
- [ ] 6. Papel perdido: confere no disparo; cancela agendados ao mudar papel/banir/sair
- [ ] 7. Testes: bloqueado sem aviso de verdade; runDue em paralelo
- [ ] 8. Para você: respeita ocultar; próprio comunicado não é não lido
- [ ] 9. Posts automáticos: unique + P2002; existentes desligados (migration 20261118100100)
- [ ] 10. Prévia do chat: opcaoDaEnquete com filtro de bloqueio
- [ ] 11. lint, typecheck, testes; REDESIGN_PROGRESS; apagar HANDOFF

## Próximo passo

Item 3 (recorrência no fuso do grupo).
