# HANDOFF #402 — Painel: ficha da pessoa

Branch `redesign/402-ficha-pessoa`. Banco de testes `fatia_t402` (o `.env` do worktree já aponta para ele).
Pranchas em `.canvas/project/Pn-05*.dc.html` (baixadas do artifact).

## Decisões (orquestrador)

- MemberNote: visível à pessoa ("O aluno vê estas anotações"), apagada ao sair da comunidade, `visibleToSubject = true`, app só leitura, sem etiquetas, entra no export e na retenção.
- Ordem: equipe define a inicial (`PlanOffer.position`, aplicada à cópia enquanto a pessoa não reordenou), a pessoa reordena no app (`WorkoutPlan.position`, `User.plansOrderedAt`).
- Resumo de IA → #411. Agenda: só treino planejado (+ pesagem feita com Corpo); eventos "Vou" → #397. Visitas → #390.

## Desenho (reuso do que existe)

- `PlanOffer`/`PlanOfferVersion` (#379) já existem para treino; `NutritionPlan` (#376) para alimentação. Não criei tabela nova de oferta: acrescentei `position`, `sourceTemplateId`, `endedAt`, `removedAt` em `PlanOffer`.
- Rotas novas em `groups/:groupId/members/:membershipId/...` (file, agenda, plans, plans/order, plans/:offerId DELETE, notes).
- Pessoa: `GET groups/:groupId/notes/mine`, `GET/PATCH users/me/plans/order`.

## Feito

- DB: migration `20261119300000_member_file` (MemberNote; PlanOffer.position/sourceTemplateId/endedAt/removedAt; WorkoutPlan.position; User.plansOrderedAt).
- API: `MemberFileService` (ficha + agenda), `MemberNoteService`, `PlanOfferService.sendToMember/removeForMember/reorderForMember`,
  `WorkoutPlanService.order/reorder` (`GET/PUT workout/plans/order`), controllers `MemberFileController` e `MyMemberNotesController`
  (`GET groups/:groupId/my-notes`). Permissões `member.file|plans|note`. Export e saída da comunidade. Isolamento (#402 no user-isolation).
- Testes: `member-file.integration.spec.ts` (16) e bloco #402 em `user-isolation.spec.ts` (5).

## Falta

- api-client (tipos + funções), web (ficha com abas), mobile (notas em Sobre; reordenar planos), docs (REDESIGN_PROGRESS Etapa 8), MCP (origem/status em list_workout_plans?).
