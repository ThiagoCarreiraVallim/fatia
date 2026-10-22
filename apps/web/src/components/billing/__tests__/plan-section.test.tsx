import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { MyPlan } from '@fatia/api-client';

const plan = vi.fn();
vi.mock('@fatia/api-client', async (importOriginal) => {
  const real = await importOriginal<typeof import('@fatia/api-client')>();
  return { ...real, billingApi: { ...real.billingApi, plan: () => plan() } };
});

import { PlanSection } from '../plan-section';

/** O plano no perfil: selo, uma linha de resumo e a porta para "Meu plano". */
const BASE: MyPlan = {
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
  prices: { monthlyCents: 1990, yearlyCents: 17900 },
};

function renderSection() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <PlanSection />
    </QueryClientProvider>,
  );
}

describe('PlanSection', () => {
  beforeEach(() => plan.mockReset());

  it('no Free, convida para o PRO e leva a /plan', async () => {
    plan.mockResolvedValue(BASE);
    renderSection();
    const link = await screen.findByRole('link', { name: /meu plano: free/i });
    expect(link).toHaveAttribute('href', '/plan');
    expect(link).toHaveTextContent('FREE');
    expect(link).toHaveTextContent(/assine o pro/i);
  });

  it('no PRO, mostra o selo e o resumo da assinatura', async () => {
    plan.mockResolvedValue({
      ...BASE,
      tier: 'PRO',
      source: 'ASAAS',
      reason: 'ativa',
      status: 'ACTIVE',
      interval: 'MONTHLY',
      currentPeriodEnd: '2026-11-15T12:00:00.000Z',
    });
    renderSection();
    const link = await screen.findByRole('link', { name: /meu plano: pro mensal/i });
    expect(link).toHaveTextContent('PRO');
  });

  it('some na instância que não exige plano', async () => {
    plan.mockResolvedValue({ ...BASE, tier: 'PRO', source: 'INSTANCE', requiresPlan: false });
    const { container } = renderSection();
    await vi.waitFor(() => expect(plan).toHaveBeenCalled());
    await vi.waitFor(() => expect(container).toBeEmptyDOMElement());
  });
});
