# HANDOFF #382 — Progresso (gráficos, recordes, conquistas, constância, metas)

Branch `redesign/382-progresso` (worktree `.claude/worktrees/382-progresso`). Não fazer push nem PR.

## Comandos que funcionam

```bash
cd /home/thiago/Documentos/pessoal/fatia/.claude/worktrees/382-progresso
# banco descartável (só troca o nome do banco):
export DATABASE_URL="$(grep '^DATABASE_URL=' /home/thiago/Documentos/pessoal/fatia/.env | cut -d= -f2- | sed -E 's#/fatia(\?|$)#/fatia_t382\1#')"
(cd packages/db && npx prisma migrate deploy && pnpm seed:taco && pnpm seed:exercises)
(cd apps/api && npx jest)            # baseline: 178 suites / 2893 testes
(cd packages/api-client && npx vitest run)
(cd apps/web && npx vitest run)
(cd apps/mobile && npx jest)
pnpm lint && pnpm typecheck
```

Pranchas baixadas do artifact para o scratchpad (fora do git):
`/tmp/claude-1000/-home-thiago-Documentos-pessoal-fatia/0bd027d0-f0c2-42a3-b37f-2f6dd993fad5/scratchpad/canvas/project/Al-G*.dc.html`

## Decisões (do dono e minhas)

- Dono: sequência = dia ativo (≥1 área: refeição, treino, água na meta, passos na meta) em todo
  lugar; um cálculo só (`GET /streak`, Hoje, `get_streak`, conquistas leem do mesmo serviço).
- Dono: catálogo de conquistas fechado em 10 (+ `workouts_100`, "100 treinos"); contador N/10.
- Minha: a tolerância de faltas da #147 continua (é o "não pune dia perdido").
- Minha: as sub-sequências (nutrição, treino em semanas, passos) saem do `StreakSummary`.
- Minha: o desafio `ACTIVE_DAYS` da comunidade NÃO muda (é comparação entre pessoas, regra própria).

## Checklist

- [ ] API: constância (`GET /progress/consistency`) + streak reescrito
- [ ] API: conquista `workouts_100` + migration que concede a quem já tem 100 + avaliação no fim do treino
- [ ] API: recordes com evolução de 1RM estimado e destaque
- [ ] API: meta vencida (derivada) + PATCH com novo prazo volta a `active`
- [ ] MCP: `get_consistency`, `list_personal_records`, `list_achievements`, `update_goal`; docs + SHA
- [ ] api-client: tipos, endpoints e cópia compartilhada
- [ ] Web: G1, G6, G7, G5, G11, G12, G9, G10
- [ ] App: G1, G6, G7, G5, G11, G12, G9, G10
- [ ] Docs: REDESIGN_PROGRESS (decisões do dono #382), MCP_TOOL_SURFACE, MCP.md
- [ ] lint, typecheck, testes api/api-client/web/mobile

## Arquivos tocados

(atualizar a cada camada)

## Próximo passo exato

Camada 1 (API): `apps/api/src/progress/helpers/consistency.ts` + spec vermelho.
