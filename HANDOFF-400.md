# HANDOFF #400 — relatório do mês e origens dos convites

Branch `redesign/400-relatorio` (worktree `.claude/worktrees/400-relatorio`). Banco de teste `fatia_t400`.
Pranchas baixadas em `/home/thiago/Documentos/pessoal/fatia/.canvas/project/` (Pn-03, Pn-25, 25b, 25c, Ex-02).

## Desenho

- Schema (migration `20261119500000_month_report`): `Group.weeklySessionsGoal Int?`, `Group.reportEmailEnabled Boolean @default(true)`,
  `Group.reportEmailMonth String?` (último mês mandado, reivindicado com `updateMany`), `GroupMembership.reportEmail Boolean @default(false)`,
  `User.reportEmailOptOutAt DateTime?` (descadastro, mesmo token HMAC da #398 com propósito `report`).
- API (`apps/api/src/sharing/`): `report.service.ts` (`GET groups/:id/report?month=YYYY-MM`, `GET groups/:id/invites/origins?days=7|30`,
  settings e destinatários), `report.controller.ts`, `report-email.service.ts` (job a cada 30 min, 1º dia útil, feriados nacionais),
  `business-day.ts` (puro). Permissão: `insights.read` (só OWNER) para ler; `group.update` para mudar meta, e-mail e destinatários.
- api-client: `month-report.ts` (tipos, `reportApi`, textos); seções `report` e `origins` no menu (`panel-shell`, `community-panel`).
- web: `/org/[groupId]/report` (cartões, gráficos, desafios, origem resumida, Baixar PDF = `window.print()` + `@media print`),
  `/org/[groupId]/origins` (7/30 dias, tabela, vazio, amostra pequena), `?novo=link` no Convites abre o painel de link.
- mobile: `MOBILE_MISSING_SECTIONS` ganha `report` e `origins`.

## Estado

- [x] schema + migration
- [x] testes vermelhos (api)
- [x] api
- [x] api-client
- [x] web
- [x] mobile filtro
- [x] docs
- [ ] lint/typecheck/testes

## Próximo passo

Docs (REDESIGN_PROGRESS bloco #400, PERMISSIONS, DATA_RETENTION, AGGREGATION_POLICY) e verificação final (lint/typecheck/testes de api, api-client, web, mobile).
