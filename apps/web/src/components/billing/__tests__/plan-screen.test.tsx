import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { MyPlan } from '@fatia/api-client';

const plan = vi.fn();
const checkout = vi.fn();
const cancel = vi.fn();
vi.mock('@fatia/api-client', async (importOriginal) => {
  const real = await importOriginal<typeof import('@fatia/api-client')>();
  return {
    ...real,
    billingApi: {
      plan: () => plan(),
      checkout: (i: unknown) => checkout(i),
      cancel: () => cancel(),
      revenueCatSync: vi.fn(),
    },
  };
});

let busca = new URLSearchParams();
vi.mock('next/navigation', () => ({ useSearchParams: () => busca }));

import { PlanScreen } from '../plan-screen';

/**
 * "Meu plano" na web (ADR 024): o Free vê o que o PRO acrescenta e assina pelo
 * Asaas; o PRO vê a origem e cancela (web) ou é mandado à loja.
 */
const FREE: MyPlan = {
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
const PENDENTE: MyPlan = {
  ...FREE,
  source: 'ASAAS',
  reason: 'pendente',
  status: 'PENDING',
  interval: 'YEARLY',
  paymentUrl: 'https://sandbox.asaas.com/i/abc',
};
const PRO_WEB: MyPlan = {
  ...FREE,
  tier: 'PRO',
  source: 'ASAAS',
  reason: 'ativa',
  status: 'ACTIVE',
  interval: 'MONTHLY',
  currentPeriodEnd: '2026-11-15T12:00:00.000Z',
};
const PRO_LOJA: MyPlan = {
  ...PRO_WEB,
  source: 'APPLE',
  manageUrl: 'https://apps.apple.com/account/subscriptions',
};

function renderScreen() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <PlanScreen />
    </QueryClientProvider>,
  );
}

describe('PlanScreen', () => {
  beforeEach(() => {
    plan.mockReset();
    checkout.mockReset();
    cancel.mockReset();
    busca = new URLSearchParams();
  });

  it('Free: mostra o selo, o que o PRO acrescenta e os dois períodos com preço', async () => {
    plan.mockResolvedValue(FREE);
    renderScreen();

    expect(await screen.findByText('FREE')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /o pro acrescenta/i })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /anual/i })).toBeChecked();
    expect(screen.getByText(/R\$\s179,00\/ano/)).toBeInTheDocument();
    expect(screen.getByText(/R\$\s19,90\/mês/)).toBeInTheDocument();
    expect(screen.getByText(/economize 25%/)).toBeInTheDocument();
  });

  it('destaca o recurso que trouxe a pessoa até aqui', async () => {
    busca = new URLSearchParams('recurso=chat');
    plan.mockResolvedValue(FREE);
    renderScreen();

    const item = (await screen.findByText('Chat com a IA')).closest('li');
    expect(item?.className).toMatch(/bg-primary/);
  });

  it('CPF inválido não chama o checkout', async () => {
    const user = userEvent.setup();
    plan.mockResolvedValue(FREE);
    renderScreen();

    await user.type(await screen.findByLabelText('CPF'), '11111111111');
    await user.click(screen.getByRole('button', { name: 'Assinar PRO' }));

    expect(screen.getByText(/cpf inválido/i)).toBeInTheDocument();
    expect(screen.getByLabelText('CPF')).toHaveAttribute('aria-invalid', 'true');
    expect(checkout).not.toHaveBeenCalled();
  });

  it('assinar manda período e CPF, leva a aba ao pagamento e fica aguardando', async () => {
    const user = userEvent.setup();
    plan.mockResolvedValue(FREE);
    checkout.mockResolvedValue(PENDENTE);
    const aba = { location: { href: '' }, opener: {}, close: vi.fn() };
    const open = vi.spyOn(window, 'open').mockReturnValue(aba as unknown as Window);
    renderScreen();

    await user.click(await screen.findByRole('radio', { name: /mensal/i }));
    await user.type(screen.getByLabelText('CPF'), '52998224725');
    expect(screen.getByLabelText('CPF')).toHaveValue('529.982.247-25');
    await user.click(screen.getByRole('button', { name: 'Assinar PRO' }));

    expect(checkout).toHaveBeenCalledWith({ interval: 'MONTHLY', cpf: '529.982.247-25' });
    // A aba abre no clique (antes da resposta), senão o bloqueador de pop-up a barra.
    expect(open).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(aba.location.href).toBe(PENDENTE.paymentUrl));
    expect(aba.opener).toBeNull();
    expect(await screen.findByText(/aguardando a confirmação do pagamento/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /abrir página de pagamento/i })).toHaveAttribute(
      'href',
      PENDENTE.paymentUrl,
    );
    open.mockRestore();
  });

  it('erro no checkout fecha a aba aberta e mostra a mensagem', async () => {
    const user = userEvent.setup();
    plan.mockResolvedValue(FREE);
    checkout.mockRejectedValue(new Error('Assinatura indisponível agora.'));
    const aba = { location: { href: '' }, opener: {}, close: vi.fn() };
    const open = vi.spyOn(window, 'open').mockReturnValue(aba as unknown as Window);
    renderScreen();

    await user.type(await screen.findByLabelText('CPF'), '52998224725');
    await user.click(screen.getByRole('button', { name: 'Assinar PRO' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Assinatura indisponível agora.');
    expect(aba.close).toHaveBeenCalled();
    open.mockRestore();
  });

  it('PRO pela web: cancela com confirmação e passa a mostrar até quando vale', async () => {
    const user = userEvent.setup();
    plan.mockResolvedValue(PRO_WEB);
    cancel.mockResolvedValue({ ...PRO_WEB, cancelAtPeriodEnd: true });
    renderScreen();

    expect(await screen.findByText('PRO')).toBeInTheDocument();
    expect(screen.queryByLabelText('CPF')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Cancelar assinatura' }));
    const dialogo = await screen.findByRole('dialog');
    await user.click(
      Array.from(dialogo.querySelectorAll('button')).find((b) =>
        /cancelar assinatura/i.test(b.textContent ?? ''),
      )!,
    );

    expect(cancel).toHaveBeenCalled();
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Cancelar assinatura' })).not.toBeInTheDocument(),
    );
  });

  it('PRO pela loja: sem cancelar aqui, com o link da loja', async () => {
    plan.mockResolvedValue(PRO_LOJA);
    renderScreen();

    expect(await screen.findByRole('link', { name: /gerenciar na loja/i })).toHaveAttribute(
      'href',
      PRO_LOJA.manageUrl,
    );
    expect(screen.queryByRole('button', { name: 'Cancelar assinatura' })).not.toBeInTheDocument();
  });

  it('PRO pela comunidade: diz quem paga, sem cancelar nem cobrar a pessoa', async () => {
    plan.mockResolvedValue({
      ...FREE,
      tier: 'PRO',
      source: 'GROUP',
      reason: 'carencia',
      status: 'PAST_DUE',
      groupName: 'Academia Demo',
    });
    renderScreen();

    expect(
      await screen.findByRole('heading', { name: /PRO pela comunidade Academia Demo/ }),
    ).toBeInTheDocument();
    expect(screen.getByText(/A comunidade Academia Demo paga seu PRO/)).toBeInTheDocument();
    expect(screen.queryByText(/Pague a cobrança em aberto/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Assinatura pela/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cancelar assinatura' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Assinar PRO' })).not.toBeInTheDocument();
  });

  it('instância sem exigência de plano não vende nada', async () => {
    plan.mockResolvedValue({ ...FREE, tier: 'PRO', source: 'INSTANCE', requiresPlan: false });
    renderScreen();

    expect(await screen.findByText(/liberada para todos/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Assinar PRO' })).not.toBeInTheDocument();
  });
});
