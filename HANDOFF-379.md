# HANDOFF #379 — plano recebido, modelos, bloco de semanas, agenda

Worktree: `/home/thiago/Documentos/pessoal/fatia/.claude/worktrees/agent-aeec611435f73084e`
Branch: `redesign/379-plano-recebido-agenda`. Não dar push nem abrir PR.

## Checklist da issue

Legenda: [x] feito · [~] em andamento · [ ] não começado

### API e banco

- [x] Schema: `PlanOffer`, `PlanOfferVersion` (status PENDING/ACCEPTED/DECLINED/SUPERSEDED, schedule CALENDAR/FLEXIBLE), `PlannedSession`, `WorkoutPlan.fromOfferId`; migração `20261116020000_plan_offers_and_agenda` (só aditiva + CHECK weeksTotal 3..6)
- [x] Bloco 3 a 6 semanas: `blockTemplate(n)`, `weekLabel`, `describeWeek(week, total)`, DTO `weeks`, `GET /workout/blocks/preview`, `GET /workout/blocks/latest`
- [x] Helper puro do diff ("o que mudou"): `apps/api/src/sharing/plan-offer-diff.ts`
- [x] Helper puro da agenda: `apps/api/src/workout/helpers/planned-schedule.ts`
- [x] Serviço de ofertas (aluno): `sharing/plan-offer.service.ts` + `plan-offer.controller.ts` (/plan-offers)
- [x] Endpoint mínimo do profissional: POST /professional/students/:membershipId/plan-offers (+ /:offerId/versions)
- [x] Materializar o aceite: `materializeOffer` / `rematerialize`; CALENDAR gera PlannedSession
- [x] Agenda: `workout/agenda.service.ts`, GET /workout/agenda?from&to, PATCH /workout/agenda/:id
- [x] Notificações: `sharing/plan-offer-notices.ts`
- [x] user-isolation.spec.ts: bloco #379 (mutação conferida: tirar userId deixa vermelho)
- [x] LGPD: export (account.service) + DATA_RETENTION; exclusão por cascade
- [x] Seed demo: `seedPlanOffer` em seed-demo.ts
- [x] Hoje: receivedPlan + todo plan_offer (dashboard.service)
- [x] Modelos: GET /groups/templates (ContentService.listWorkoutTemplatesForMe)

### MCP

- [x] `create_training_block` aceita `weeks` 3..6
- [x] `list_plan_offers`, `accept_plan_offer`, `decline_plan_offer`, `list_planned_sessions`, `reschedule_planned_session`
- [x] docs/MCP_TOOL_SURFACE.md, docs/MCP.md, fingerprint (151 tools)

### api-client / web / app

- [x] api-client: tipos e chamadas (a16a4a63)
- [x] Aviso de plano recebido no Treino (TODO(#379) em workout-home.tsx e app/(app)/workout/index.tsx)
- [x] Al-T2 / Al-T2b plano recebido (aceitar, recusar, desfazer, atualização com o que mudou)
- [x] Al-T23 Modelos (T6 e T19 passam a abrir esta tela)
- [x] Al-T12 Periodização 3 a 6 semanas
- [x] Al-T24 / T24b / T24c Agenda

### Docs

- [x] REDESIGN_PROGRESS: "Decisões do dono" #379 (4 decisões do briefing) + PERMISSIONS.md
- [x] Cartão de confirmação do chat (rotulos.ts/previa): offerId, versionId, sessão da agenda, weeks (o rotulos.spec pegou na suíte completa)

## Arquivos tocados

- `packages/db/prisma/schema.prisma`, migração `20261116020000_plan_offers_and_agenda` — tabelas novas
- `apps/api/src/workout/helpers/block-template.ts` (+spec) — bloco de N semanas
- `apps/api/src/workout/training-block.service.ts` (+spec), `dto/training-block.dto.ts`, `workout.controller.ts`, `mcp/create-training-block.tool.ts`
- `apps/api/src/sharing/plan-offer-diff.ts` (+spec), `apps/api/src/workout/helpers/planned-schedule.ts` (+spec)

## Decisões e julgamentos

- Bloco de N semanas: pico = floor((N-1)/2), resto acúmulo, última deload; com N=4 reproduz `BLOCK_TEMPLATE` (testado número por número). 5 semanas = acúmulo×2, pico×2, deload.
- Status do bloco no `present`: encerrado gravado (completed/abandoned) prevalece sobre a reconciliação.
- Diff por chave de exercício (catalog:id / group:id / custom:nome); trocar ordem não conta.
- Agenda: done/missed não são gravados, saem das sessões concluídas (ADR 019/042).
- Testes vermelhos comprovados: block-template e training-block spec falham contra o código de HEAD (exports inexistentes); diff e schedule eram módulos novos.

## Comandos que funcionam

```sh
# DB descartável (já migrado; refazer se precisar)
cd packages/db
export DATABASE_URL=$(grep ^DATABASE_URL /home/thiago/Documentos/pessoal/fatia/.env | cut -d= -f2- | tr -d '"' | sed 's#/fatia$#/fatia_t379#')
npx prisma migrate deploy && pnpm seed:taco && pnpm seed:exercises
npx prisma migrate diff --from-url "$DATABASE_URL" --to-schema-datamodel prisma/schema.prisma --script   # vazio = sem drift
# testes de unidade da api
cd apps/api && npx jest <caminho>
```

## Próximo passo exato

Tudo implementado e commitado. Falta só o que é do dono/coordenador: passada visual contra as pranchas (web e app), apagar este arquivo e abrir a PR (`Closes #379`).

Verificação final (2026-11-15): `pnpm lint` e `pnpm typecheck` verdes; api 2869/2869 (178 suítes, DATABASE_URL do `fatia_t379`), api-client 736, web 888, mobile 485.

Diferenças entre web e app a decidir: no web, recusar não pede confirmação (o "Desfazer" cobre); no app, pede. O cartão "plano terminou" leva a "Ver o histórico" no web e a "Ver o plano" no app (não existe tela de resumo do bloco).

## Notas

- `invite-email-retention.spec.ts` falhou uma vez rodando o diretório inteiro em paralelo e passou sozinho e na segunda rodada: flaky pré-existente, não tocado.
- Avisos à equipe usam `NotificationKind.COMMUNITY` (não há tipo de equipe) e levam ao painel `/org/:groupId/members`.
- "Desfazer" no MCP = `accept_plan_offer` sobre a versão recusada (accept aceita PENDING ou DECLINED se for a última).
