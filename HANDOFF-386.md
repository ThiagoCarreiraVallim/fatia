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

- [ ] DB: migration (TRIALING, trialEndsAt, paymentMethod, User.proTrialUsedAt, BillingReminder, GroupAiMode no pool, programName, NotificationKind BILLING)
- [ ] API: direito (TRIALING, ALL_MEMBERS, programa) + testes
- [ ] API: GET /billing/plan com estado, paidBy, teste, forma de pagamento
- [ ] API: checkout com forma de pagamento e teste de 7 dias
- [ ] API: RevenueCat lê teste (period_type TRIAL)
- [ ] API: job de lembretes (push + e-mail Ex-03), idempotente
- [ ] API: billing:grant-group
- [ ] API: isolamento (user-isolation.spec.ts)
- [ ] api-client: tipos e visão pura das telas (regra das lojas) + testes
- [ ] App: Al-M1 (chat bloqueado), Al-M2/M3 (assinar, teste), M5, M13/b/c/d
- [ ] Web: idem, com Asaas
- [ ] Site: Si-04
- [ ] Envs em docker-compose.prod.yml e .env.example
- [ ] Docs: BILLING.md, REDESIGN_PROGRESS.md
- [ ] lint, typecheck, testes

## Decisões

(preencher)

## Próximo passo

Migration do schema.
