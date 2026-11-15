# Handoff: correções da revisão da #379

Worktree: `.claude/worktrees/379-review-fixes`, branch `redesign/379-review-fixes` (base c23744f0).
Banco de teste: `fatia_t379f` (`source /tmp/t379f/env.sh` monta o DATABASE_URL a partir do `.env`
da raiz; se `/tmp` sumiu, recrie: DATABASE_URL do `.env` com `/fatia` → `/fatia_t379f`, depois
`npx prisma migrate deploy`, `pnpm seed:taco`, `pnpm seed:exercises` em `packages/db`).

## Checklist

- [x] 1. Diff "o que mudou" cobre todos os campos do exercício + agenda (API e api-client)
- [x] 2. Remarcar usa o fim da versão ACEITA atual; recusa FLEXIBLE/sem versão
- [x] 3. Remarcar recusa sessão já feita (409)
- [ ] 4. Falha parcial no aceite não deixa duas ACCEPTED; leitores pegam a maior ACCEPTED
- [ ] 5. Oferta exige ProfessionalLink ativo (aceitar/recusar/desfazer, lista, Hoje, aviso)
- [ ] 6. Corrida: claim exige que não haja versão maior (409)
- [ ] Final: lint, typecheck, testes api/api-client/web/mobile; apagar este arquivo

## Próximo passo

Item 4: `accept` em `plan-offer.service.ts`: claim + materializar + supersede/agenda numa falha só;
leitores (`versionsOf().accepted`, `AgendaService.acceptedPlans`) pegam a ACCEPTED de maior número.
Teste no `plan-offer.integration.spec.ts` (falha forçada no `createMany` da agenda).

## Notas

- Item 1: ordem trocada agora conta como mudança da versão (`diff.version: order`), sem marcar
  exercício. Antes "só a ordem não conta"; o pedido diz nunca "sem mudança" com retratos diferentes.
- Itens 2 e 3 saíram num commit só (mesmo método e mesmo arquivo de teste).
