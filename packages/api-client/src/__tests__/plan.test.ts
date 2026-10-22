import { describe, expect, it } from 'vitest';
import type { MyPlan } from '../billing';
import {
  aiLock,
  formatBRL,
  isCpfValid,
  maskCpf,
  planHref,
  planSummary,
  sourceLabel,
  yearlyPerMonthLabel,
  yearlySavingsLabel,
} from '../plan';

const PRECOS = { monthlyCents: 1990, yearlyCents: 17900 };

const plano = (p: Partial<MyPlan>): MyPlan => ({
  tier: 'FREE',
  source: null,
  reason: 'sem_assinatura',
  degraded: false,
  status: null,
  interval: null,
  currentPeriodEnd: null,
  graceEndsAt: null,
  cancelAtPeriodEnd: false,
  paymentUrl: null,
  manageUrl: null,
  groupName: null,
  requiresPlan: true,
  webCheckout: true,
  prices: PRECOS,
  ...p,
});

describe('preços', () => {
  it('formata em reais', () => {
    expect(formatBRL(1990)).toBe('R$ 19,90');
    expect(formatBRL(17900)).toBe('R$ 179,00');
  });

  it('o anual mostra a economia e o valor por mês', () => {
    expect(yearlySavingsLabel(PRECOS)).toBe('economize 25%');
    expect(yearlyPerMonthLabel(PRECOS)).toBe('R$ 14,92/mês');
    expect(yearlySavingsLabel({ monthlyCents: 1000, yearlyCents: 12000 })).toBeNull();
  });
});

describe('planSummary', () => {
  it('Free, pendente e PRO que terminou', () => {
    expect(planSummary(plano({}))).toBe('Free');
    expect(planSummary(plano({ reason: 'pendente' }))).toBe(
      'Free · pagamento aguardando confirmação',
    );
    expect(planSummary(plano({ reason: 'cancelada', degraded: true }))).toBe(
      'Free · seu PRO terminou',
    );
  });

  it('PRO com renovação, cancelado e em carência', () => {
    const pro = { tier: 'PRO' as const, source: 'ASAAS' as const, reason: 'ativa' as const };
    expect(
      planSummary(plano({ ...pro, interval: 'MONTHLY', currentPeriodEnd: '2026-11-15T15:00:00Z' })),
    ).toBe('PRO mensal · renova em 15 de nov');
    expect(
      planSummary(
        plano({
          ...pro,
          interval: 'YEARLY',
          currentPeriodEnd: '2027-10-15T15:00:00Z',
          cancelAtPeriodEnd: true,
        }),
      ),
    ).toBe('PRO anual até 15 de out · cancelado');
    expect(
      planSummary(plano({ ...pro, reason: 'carencia', graceEndsAt: '2026-11-22T15:00:00Z' })),
    ).toBe('Pagamento em atraso · regularize até 22 de nov');
  });

  it('cortesia e instância liberada', () => {
    expect(planSummary(plano({ tier: 'PRO', source: 'MANUAL', reason: 'ativa' }))).toBe(
      'PRO cortesia',
    );
    expect(planSummary(plano({ tier: 'PRO', source: 'INSTANCE', reason: 'instancia' }))).toBe(
      'IA liberada nesta instância',
    );
  });
});

describe('PRO pago pela comunidade (ADR 025)', () => {
  const assento = {
    tier: 'PRO' as const,
    source: 'GROUP' as const,
    reason: 'ativa' as const,
    groupName: 'Academia Demo',
    currentPeriodEnd: '2026-11-15T15:00:00Z',
  };

  it('diz quem paga, sem renovação nem cobrança da própria pessoa', () => {
    expect(planSummary(plano(assento))).toBe('PRO pela comunidade Academia Demo');
    expect(sourceLabel('GROUP', 'Academia Demo')).toBe('pela comunidade Academia Demo');
    expect(sourceLabel('GROUP')).toBe('pela comunidade');
  });

  it('a carência é da comunidade, e não pede à pessoa para regularizar', () => {
    expect(
      planSummary(plano({ ...assento, reason: 'carencia', graceEndsAt: '2026-11-22T15:00:00Z' })),
    ).toBe('PRO pela comunidade Academia Demo · pagamento da comunidade em atraso');
  });

  it('assentos cancelados valem até o fim do período', () => {
    expect(planSummary(plano({ ...assento, cancelAtPeriodEnd: true }))).toBe(
      'PRO pela comunidade Academia Demo até 15 de nov',
    );
  });
});

describe('CPF', () => {
  it('mascara enquanto digita', () => {
    expect(maskCpf('529')).toBe('529');
    expect(maskCpf('5299822')).toBe('529.982.2');
    expect(maskCpf('52998224725')).toBe('529.982.247-25');
    expect(maskCpf('529.982.247-25999')).toBe('529.982.247-25');
  });

  it('valida pelos dígitos verificadores', () => {
    expect(isCpfValid('529.982.247-25')).toBe(true);
    expect(isCpfValid('529.982.247-24')).toBe(false);
    expect(isCpfValid('111.111.111-11')).toBe(false);
    expect(isCpfValid('123')).toBe(false);
  });
});

describe('aiLock', () => {
  it('esconde o que a instância não tem, tranca o que é do PRO', () => {
    expect(aiLock(undefined)).toBe('hidden');
    expect(aiLock({ available: false, allowed: false, reason: 'not_configured' })).toBe('hidden');
    expect(aiLock({ available: true, allowed: false, reason: 'plan_required' })).toBe('locked');
    expect(aiLock({ available: true, allowed: true, reason: 'ok' })).toBe('open');
    // API antiga, sem `allowed`: o comportamento de antes.
    expect(aiLock({ available: true })).toBe('open');
  });

  it('o link do plano leva o recurso', () => {
    expect(planHref('foto')).toBe('/plan?recurso=foto');
    expect(planHref()).toBe('/plan');
  });
});
