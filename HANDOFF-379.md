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
- [ ] Serviço de ofertas (aluno): listar, ver, aceitar, recusar, desfazer, aceitar atualização, manter versão
- [ ] Endpoint mínimo do profissional: enviar / atualizar oferta (exige ProfessionalLink ativo)
- [ ] Materializar o aceite: WorkoutPlan com fromOfferId; CALENDAR gera PlannedSession
- [ ] Agenda: listar semana, remarcar (hoje..fim do plano), flexível = próxima sessão calculada
- [ ] Notificações: envio, atualização (aluno); aceite, recusa (equipe)
- [ ] user-isolation.spec.ts: aluno A não vê oferta de B
- [ ] LGPD: export inclui ofertas, versões, agenda; exclusão apaga; docs/DATA_RETENTION.md
- [ ] Seed demo: uma oferta pendente para o usuário demo

### MCP

- [x] `create_training_block` aceita `weeks` 3..6
- [ ] `list_plan_offers`, `accept_plan_offer`, `decline_plan_offer`, agenda listar/remarcar
- [ ] docs/MCP_TOOL_SURFACE.md, docs/MCP.md, testes de fingerprint

### api-client / web / app

- [ ] api-client: tipos e chamadas
- [ ] Aviso de plano recebido no Treino (TODO(#379) em workout-home.tsx e app/(app)/workout/index.tsx)
- [ ] Al-T2 / Al-T2b plano recebido (aceitar, recusar, desfazer, atualização com o que mudou)
- [ ] Al-T23 Modelos (T6 e T19 passam a abrir esta tela)
- [ ] Al-T12 Periodização 3 a 6 semanas
- [ ] Al-T24 / T24b / T24c Agenda

### Docs

- [ ] REDESIGN_PROGRESS: "Decisões do dono" #379 (4 decisões do briefing)

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

Ler docs (CLAUDE.md, ADR 014/019/042, DADOS_REDESIGN, REDESIGN_PROGRESS) e o módulo `apps/api/src/sharing` (plan-snapshot, adoção de group plans) e escrever o serviço de ofertas do aluno com testes vermelhos primeiro.
