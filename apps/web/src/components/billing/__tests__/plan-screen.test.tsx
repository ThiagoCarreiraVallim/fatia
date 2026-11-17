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
 * "Meu plano" na web (#386; Al-M13, Al-M13b/c, Al-M5 e Si-04): o Free vê o
 * que o PRO acrescenta e assina pelo Asaas (Pix, boleto ou cartão, com o teste
 * de 7 dias para quem nunca teve); o PRO vê o estado e cancela (web), paga a
 * cobrança aberta ou é mandado à loja.
 */
const FREE: MyPlan = {
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
  prices: { monthlyCents: 1990, yearlyCents: 17900 },
};
const JA_TESTOU: MyPlan = { ...FREE, trialEligible: false };
const PENDENTE: MyPlan = {
  ...JA_TESTOU,
  source: 'ASAAS',
  reason: 'pendente',
  state: 'PENDING',
  status: 'PENDING',
  interval: 'MONTHLY',
  paymentMethod: 'BOLETO',
  paymentUrl: 'https://sandbox.asaas.com/i/abc',
};
const PRO_WEB: MyPlan = {
  ...JA_TESTOU,
  tier: 'PRO',
  source: 'ASAAS',
  reason: 'ativa',
  state: 'ACTIVE',
  status: 'ACTIVE',
  interval: 'MONTHLY',
  paymentMethod: 'CREDIT_CARD',
  paidBy: 'PERSONAL',
  currentPeriodEnd: '2099-11-15T12:00:00.000Z',
};
const PRO_LOJA: MyPlan = {
  ...PRO_WEB,
  source: 'APPLE',
  paymentMethod: null,
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

  it('Free: o que o PRO acrescenta, os dois períodos com preço e o teste de 7 dias', async () => {
    plan.mockResolvedValue(FREE);
    renderScreen();

    expect(await screen.findByRole('heading', { name: /o pro acrescenta/i })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /anual/i })).toBeChecked();
    expect(screen.getByText(/R\$\s179,00\/ano/)).toBeInTheDocument();
    expect(screen.getByText(/R\$\s19,90\/mês/)).toBeInTheDocument();
    expect(screen.getByText('−25%')).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Pix' })).toBeChecked();
    expect(screen.getByRole('button', { name: 'Começar 7 dias grátis' })).toBeInTheDocument();
    expect(screen.getByText(/a primeira cobrança vence no fim do teste/)).toBeInTheDocument();
  });

  it('quem já testou vê "Assinar PRO", sem prometer teste', async () => {
    plan.mockResolvedValue(JA_TESTOU);
    renderScreen();

    expect(await screen.findByRole('button', { name: 'Assinar PRO' })).toBeInTheDocument();
    expect(screen.queryByText(/dias grátis/)).not.toBeInTheDocument();
  });

  it('o site (Si-04) escolhe o período e a forma de pagamento pela URL', async () => {
    busca = new URLSearchParams('periodo=MONTHLY&pagamento=BOLETO');
    plan.mockResolvedValue(FREE);
    renderScreen();

    expect(await screen.findByRole('radio', { name: /mensal/i })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Boleto' })).toBeChecked();
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
    await user.click(screen.getByRole('button', { name: 'Começar 7 dias grátis' }));

    expect(screen.getByText(/cpf inválido/i)).toBeInTheDocument();
    expect(screen.getByLabelText('CPF')).toHaveAttribute('aria-invalid', 'true');
    expect(checkout).not.toHaveBeenCalled();
  });

  it('o teste começa sem abrir pagamento: nada é cobrado hoje', async () => {
    const user = userEvent.setup();
    plan.mockResolvedValue(FREE);
    checkout.mockResolvedValue({
      ...FREE,
      tier: 'PRO',
      source: 'ASAAS',
      reason: 'teste',
      state: 'TRIAL',
      status: 'TRIALING',
      interval: 'YEARLY',
      paymentMethod: 'PIX',
      trialEligible: false,
      trialEndsAt: '2099-11-20T12:00:00.000Z',
      currentPeriodEnd: '2099-11-20T12:00:00.000Z',
      paymentUrl: 'https://sandbox.asaas.com/i/teste',
      paidBy: 'PERSONAL',
    });
    const open = vi.spyOn(window, 'open');
    renderScreen();

    await user.type(await screen.findByLabelText('CPF'), '52998224725');
    await user.click(screen.getByRole('button', { name: 'Começar 7 dias grátis' }));

    expect(checkout).toHaveBeenCalledWith({
      interval: 'YEARLY',
      cpf: '529.982.247-25',
      paymentMethod: 'PIX',
    });
    expect(await screen.findByText(/Teste grátis até/)).toBeInTheDocument();
    expect(open).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Cancelar o teste' })).toBeInTheDocument();
    open.mockRestore();
  });

  it('assinar manda período, CPF e forma de pagamento, leva a aba ao pagamento e fica aguardando', async () => {
    const user = userEvent.setup();
    plan.mockResolvedValue(JA_TESTOU);
    checkout.mockResolvedValue(PENDENTE);
    const aba = { location: { href: '' }, opener: {}, close: vi.fn() };
    const open = vi.spyOn(window, 'open').mockReturnValue(aba as unknown as Window);
    renderScreen();

    await user.click(await screen.findByRole('radio', { name: /mensal/i }));
    await user.click(screen.getByRole('radio', { name: 'Boleto' }));
    await user.type(screen.getByLabelText('CPF'), '52998224725');
    expect(screen.getByLabelText('CPF')).toHaveValue('529.982.247-25');
    await user.click(screen.getByRole('button', { name: 'Assinar PRO' }));

    expect(checkout).toHaveBeenCalledWith({
      interval: 'MONTHLY',
      cpf: '529.982.247-25',
      paymentMethod: 'BOLETO',
    });
    // A aba abre no clique (antes da resposta), senão o bloqueador de pop-up a barra.
    expect(open).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(aba.location.href).toBe(PENDENTE.paymentUrl));
    expect(aba.opener).toBeNull();
    expect(await screen.findByText('Aguardando o pagamento')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /abrir página de pagamento/i })).toHaveAttribute(
      'href',
      PENDENTE.paymentUrl,
    );
    expect(screen.getByText('Pix cai na hora · boleto em até 2 dias úteis')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Trocar a forma de pagamento' })).toBeInTheDocument();
    open.mockRestore();
  });

  it('erro no checkout fecha a aba aberta e mostra a mensagem', async () => {
    const user = userEvent.setup();
    plan.mockResolvedValue(JA_TESTOU);
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
    cancel.mockResolvedValue({ ...PRO_WEB, state: 'CANCELED', cancelAtPeriodEnd: true });
    renderScreen();

    expect(await screen.findByText('Ativa')).toBeInTheDocument();
    expect(screen.getByText('Web · cartão')).toBeInTheDocument();
    expect(screen.queryByLabelText('CPF')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Cancelar assinatura' }));
    const dialogo = await screen.findByRole('dialog');
    await user.click(
      Array.from(dialogo.querySelectorAll('button')).find((b) =>
        /cancelar assinatura/i.test(b.textContent ?? ''),
      )!,
    );

    expect(cancel).toHaveBeenCalled();
    expect(await screen.findByText('Cancelada')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cancelar assinatura' })).not.toBeInTheDocument();
  });

  it('carência da web: paga pelo link do Asaas', async () => {
    plan.mockResolvedValue({
      ...PRO_WEB,
      reason: 'carencia',
      state: 'PAST_DUE',
      status: 'PAST_DUE',
      paymentMethod: 'PIX',
      currentPeriodEnd: '2020-01-01T03:00:00.000Z',
      graceEndsAt: '2099-01-08T03:00:00.000Z',
      paymentUrl: 'https://sandbox.asaas.com/i/atraso',
    });
    renderScreen();

    expect(await screen.findByRole('link', { name: /pagar com pix/i })).toHaveAttribute(
      'href',
      'https://sandbox.asaas.com/i/atraso',
    );
  });

  it('PRO pela loja: sem cancelar aqui, com o link da loja', async () => {
    plan.mockResolvedValue(PRO_LOJA);
    renderScreen();

    expect(
      await screen.findByRole('link', { name: /cancelar nas assinaturas da loja/i }),
    ).toHaveAttribute('href', PRO_LOJA.manageUrl);
    expect(screen.queryByRole('button', { name: 'Cancelar assinatura' })).not.toBeInTheDocument();
  });

  it('loja sem conseguir cobrar (M13d): atualizar na loja, sem Pix nem boleto', async () => {
    plan.mockResolvedValue({
      ...PRO_LOJA,
      reason: 'carencia',
      state: 'PAST_DUE',
      status: 'PAST_DUE',
      graceEndsAt: '2099-01-08T03:00:00.000Z',
    });
    renderScreen();

    expect(await screen.findByText('A loja não conseguiu cobrar')).toBeInTheDocument();
    expect(screen.getByText('Por que não dá para pagar aqui?')).toBeInTheDocument();
    expect(screen.queryByText(/pix/i)).not.toBeInTheDocument();
  });

  it('PRO pela comunidade (M5): diz quem paga, sem cancelar nem cobrar a pessoa', async () => {
    plan.mockResolvedValue({
      ...JA_TESTOU,
      tier: 'PRO',
      source: 'GROUP',
      reason: 'ativa',
      state: 'ACTIVE',
      paidBy: 'PROGRAM',
      programName: 'Programa Verão 21',
      currentPeriodEnd: '2099-11-30T12:00:00.000Z',
      groupName: 'Academia Demo',
    });
    renderScreen();

    expect(
      await screen.findByRole('heading', { name: 'Seu PRO é pago pela Academia Demo' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Durante o Programa Verão 21')).toBeInTheDocument();
    expect(screen.getByText('PRO até 30/11')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Abrir a IA' })).toHaveAttribute('href', '/chat');
    expect(screen.queryByRole('button', { name: 'Cancelar assinatura' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('CPF')).not.toBeInTheDocument();
  });

  it('instância sem exigência de plano não vende nada', async () => {
    plan.mockResolvedValue({ ...FREE, tier: 'PRO', source: 'INSTANCE', requiresPlan: false });
    renderScreen();

    expect(await screen.findByText(/liberada para todos/i)).toBeInTheDocument();
    expect(screen.queryByLabelText('CPF')).not.toBeInTheDocument();
  });
});
