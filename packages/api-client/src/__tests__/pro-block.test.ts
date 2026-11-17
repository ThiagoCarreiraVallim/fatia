import { describe, expect, it } from 'vitest';
import { proBlockState, type MyPlan, type ProBlockContext } from '../billing';

const NOW = new Date('2026-11-14T12:00:00Z');

const base: MyPlan = {
  tier: 'FREE',
  source: null,
  reason: 'sem_assinatura',
  degraded: false,
  state: 'FREE',
  status: null,
  interval: null,
  currentPeriodEnd: null,
  graceEndsAt: null,
  cancelAtPeriodEnd: false,
  trialEndsAt: null,
  trialEligible: true,
  trialDays: 7,
  paymentMethod: null,
  paymentUrl: null,
  manageUrl: null,
  paidBy: null,
  groupName: null,
  programName: null,
  requiresPlan: true,
  webCheckout: true,
  prices: { monthlyCents: 1990, yearlyCents: 19900 },
};

const ctx: ProBlockContext = { now: NOW, canPurchase: true };

function state(plan: Partial<MyPlan>, extra: Partial<ProBlockContext> = {}) {
  return proBlockState({ ...base, ...plan }, { ...ctx, ...extra });
}

/** Os 9 estados do bloco PRO (prancha Componentes-plano 1.2). */
describe('proBlockState', () => {
  it('1. Free: oferta de 7 dias grátis', () => {
    expect(state({})).toEqual({ kind: 'free', trialDays: 7 });
  });

  it('2. Teste: N de 7, com os dias que faltam', () => {
    expect(
      state({
        tier: 'PRO',
        source: 'ASAAS',
        reason: 'teste',
        state: 'TRIAL',
        status: 'TRIALING',
        trialEndsAt: '2026-11-17T12:00:00Z',
      }),
    ).toEqual({ kind: 'trial', day: 4, totalDays: 7, daysLeft: 3 });
  });

  it('3. PRO anual, com a renovação', () => {
    expect(
      state({
        tier: 'PRO',
        source: 'ASAAS',
        reason: 'ativa',
        status: 'ACTIVE',
        interval: 'YEARLY',
        currentPeriodEnd: '2026-12-04T00:00:00Z',
      }),
    ).toEqual({ kind: 'pro', interval: 'YEARLY', renewsAt: '2026-12-04T00:00:00Z' });
  });

  it('4. PRO pago pela comunidade', () => {
    expect(
      state({ tier: 'PRO', source: 'GROUP', reason: 'ativa', groupName: 'Academia Demo' }),
    ).toEqual({ kind: 'pro-community', groupName: 'Academia Demo' });
  });

  it('5. PRO até uma data (parceiro/programa), com os dias que faltam', () => {
    expect(
      state({
        tier: 'PRO',
        source: 'MANUAL',
        reason: 'ativa',
        currentPeriodEnd: '2026-11-20T12:00:00Z',
        cancelAtPeriodEnd: true,
      }),
    ).toEqual({ kind: 'pro-until', until: '2026-11-20T12:00:00Z', daysLeft: 6 });
  });

  it('6. IA Lite acabando (≤ 20% da cota)', () => {
    expect(state({}, { lite: { used: 27, limit: 30 } })).toEqual({
      kind: 'lite-ending',
      remaining: 3,
      limit: 30,
    });
  });

  it('quem já usou o teste vê o Free sem dias de teste', () => {
    expect(state({ trialEligible: false })).toEqual({ kind: 'free', trialDays: 0 });
  });

  it('Lite com folga continua Free', () => {
    expect(state({}, { lite: { used: 5, limit: 30 } })?.kind).toBe('free');
  });

  it('7. Free sem compra no app (iOS): libera pela comunidade ou por código', () => {
    expect(state({}, { canPurchase: false })).toEqual({ kind: 'free-no-purchase' });
  });

  it('8. Pagamento pendente com carência', () => {
    expect(
      state({
        tier: 'PRO',
        source: 'ASAAS',
        reason: 'carencia',
        status: 'PAST_DUE',
        graceEndsAt: '2026-11-19T12:00:00Z',
      }),
    ).toEqual({ kind: 'pending-grace', aiUntil: '2026-11-19T12:00:00Z', graceDaysLeft: 5 });
  });

  it.each(['expirada', 'inadimplente', 'cancelada'] as const)(
    '9. PRO venceu (%s): a IA pausa, registro continua',
    (reason) => {
      expect(state({ reason })).toEqual({ kind: 'pro-expired' });
    },
  );

  it('instância sem exigência de plano não mostra bloco', () => {
    expect(state({ requiresPlan: false })).toBeNull();
  });
});
