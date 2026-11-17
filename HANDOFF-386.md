# HANDOFF #386 — Plano e assinatura

Worktree: `.claude/worktrees/386-plano`, branch `redesign/386-plano` (de `origin/main` ced73a8a).
Não fazer push nem PR. Apagar este arquivo no commit final.

## Comandos que funcionam

```bash
cd .claude/worktrees/386-plano
export DATABASE_URL=$(grep -E '^DATABASE_URL=' ../../../.env | cut -d= -f2- | sed -E 's#/fatia(\?|$)#/fatia_t386\1#')
(cd packages/db && npx prisma migrate deploy && npx prisma generate)
(cd apps/api && npx jest src/billing)
```

Pranchas baixadas do artifact em `.canvas/project/` (fora do git) neste worktree.

## Checklist

- [x] DB: migration (TRIALING, trialEndsAt, paymentMethod, User.proTrialUsedAt, BillingReminder, GroupAiMode no pool, programName, NotificationKind BILLING)
- [x] API: direito (TRIALING, ALL_MEMBERS, programa) + testes
- [x] API: GET /billing/plan com estado, paidBy, teste, forma de pagamento
- [x] API: checkout com forma de pagamento e teste de 7 dias
- [x] API: RevenueCat lê teste (period_type TRIAL)
- [x] API: job de lembretes (push + e-mail Ex-03), idempotente
- [x] API: billing:grant-group
- [ ] API: isolamento (user-isolation.spec.ts)
- [ ] api-client: tipos e visão pura das telas (regra das lojas) + testes
- [ ] App: Al-M1 (chat bloqueado), Al-M2/M3 (assinar, teste), M5, M13/b/c/d
- [ ] Web: idem, com Asaas
- [ ] Site: Si-04
- [x] Envs em docker-compose.prod.yml e .env.example
- [ ] Docs: BILLING.md, REDESIGN_PROGRESS.md
- [ ] lint, typecheck, testes

## Decisões

- Teste na web: automático no primeiro checkout de quem é elegível (nunca teve teste nem PRO pessoal);
  `TRIALING` com `trialEndsAt` = `currentPeriodEnd`; a primeira cobrança do Asaas vence no fim do teste.
  Teste sem pagamento volta ao Free sem carência (`teste_acabou`), com 24 h de folga.
- Loja: `period_type: TRIAL` → `TRIALING`; marca `User.proTrialStartedAt`.
- ALL_MEMBERS: modo no `GroupSeatPool` (`mode`), só papel MEMBER; programa = `programName` + `currentPeriodEnd` + `cancelAtPeriodEnd`.
- Avisos: `BillingReminderJob` de hora em hora, a partir das 9h no fuso da pessoa; `BillingReminder` com unique (sub, kind, dueDate) gravado antes do envio.
  Push sem preço/Pix/link (regra das lojas); e-mail Ex-03 leva a `${WEB_ORIGIN}/plan`. Loja: só STORE_BILLING_ISSUE e TRIAL_ENDING.
- `NotificationKind.BILLING` (sem chave na tela; entra na central).

## Próximo passo

api-client: tipos novos de MyPlan (state, trialEndsAt, trialEligible, trialDays, paymentMethod, paidBy, programName), `BILLING` em NotificationKind, e a visão pura das telas (regra das lojas).
