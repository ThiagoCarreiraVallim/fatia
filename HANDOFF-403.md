# HANDOFF #403 — assentos, faturas, programas e ofertas

Branch `redesign/403-assentos-faturas` (de origin/main 78cf7527). Retomar: ler isto + `git log`.
Decisões (orquestrador): R$ 14,90; carência por graceEndsAt; nomes Programa/Ofertas; ALL_MEMBERS/Lite
adiado; venda Asaas desligada por flag (`OFFERS_SALES_ENABLED`); paymentUrl do Asaas; app nunca vende.

## Ambiente

- Banco de teste: `export $(cat ~/.cache/fatia-vis/403/t403.env)` (fatia_t403). Apagar no fim.
- `.canvas` no worktree é symlink para o do checkout principal (não commitar; nunca `git add -A`).
- Pranchas renderizadas: `node scripts/_dbg403.mjs ~/.cache/fatia-vis/403 Pn-07-Assentos ...`
  (script temporário, apagar antes do fim).
- `pnpm --filter @fatia/design build` antes do typecheck da api.

## Desenho

- Migration `20261120300000_programs_and_offers`: GroupSeatAssignment(programId, startsAt, endsAt);
  GroupProgram; GroupOffer + GroupOfferPurchase; SeatInvoiceKind PROGRAM; GroupSeatInvoice(seats,
  proRataDays, overdueNotifiedAt); GroupSeatAdjustment.proRataDays; ReviewKind PLAN_ENDED.
- Assento de programa NÃO conta nos seats do pool (filtro `programId: null` em toda conta do pool).
- Direito: atribuição fora de [startsAt, endsAt) não dá PRO (leitura). Programa mostra
  paidBy PROGRAM + programName + fim.
- Preço do programa: seats × unit × ceil(dias/31). Cobrança avulsa na assinatura (como aumento);
  vencida põe o pool em PAST_DUE com carência (mesma regra do ajuste).
- Pn-30: planos da comunidade (PlanOffer) com datas; progresso só com Treino liberado; terminou → PLAN_ENDED no Para revisar.
- Ofertas: CRUD/publicar/encerrar/duplicar; vendas, receita, ativaram 48h; falhou + reenviar link.
  Checkout público é #421 (fora).
- E-mail Ex-04: só ao dono, valores da fatura real; job em BillingReminderJob.

## Passos

- [x] 0. Explorar, baixar pranchas
- [x] 1. Schema + migration
- [x] 2. Direito por janela (red-first)
- [x] 3. Overview de assentos: graceDaysLeft, faturas com seats, programas
- [x] 4. Programas API (create/list; sem editar turma depois — fora)
- [x] 5. E-mail Ex-04
- [x] 6. Pn-30 API + PLAN_ENDED (GET groups/:id/plan-programs)
- [x] 7. Ofertas API (groups/:id/offers) + webhook (offer-purchase-webhook.ts) + export LGPD (offerPurchases, seatAssignments com programa)
- [x] 8. get_me: campo `pro` (ai/pro-status.ts, AiAccessService.proStatus); descrição da tool intacta (linha de base da superfície)
- [x] 9. api-client + web (seats, programs, offers) + menu + rotas; mobile só rótulo de fatura PROGRAM
- [ ] 10. Docs (BILLING, PERMISSIONS, REDESIGN_PROGRESS, env)
- [ ] 11. Passada visual
- [ ] 12. merge origin/main, verdes, apagar HANDOFF e banco
