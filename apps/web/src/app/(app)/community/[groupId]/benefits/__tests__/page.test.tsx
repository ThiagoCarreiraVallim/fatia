import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MemberBenefit } from '@fatia/api-client';

vi.mock('next/navigation', () => ({
  useParams: () => ({ groupId: 'g1' }),
}));
const toast = vi.hoisted(() => vi.fn());
vi.mock('sonner', () => ({ toast }));
vi.mock('@fatia/api-client', async () => {
  const actual = await vi.importActual<typeof import('@fatia/api-client')>('@fatia/api-client');
  return {
    ...actual,
    groupsApi: { get: vi.fn() },
    benefitsApi: { list: vi.fn() },
  };
});

import { benefitsApi, groupsApi, type MyGroup } from '@fatia/api-client';
import CommunityBenefitsPage from '../page';

const b = (p: Partial<MemberBenefit>): MemberBenefit => ({
  id: 'b1',
  partnerName: 'Suplementa',
  logoUrl: null,
  discountText: '15% em suplementos',
  kind: 'COUPON',
  couponCode: 'DEMO15',
  url: null,
  validUntil: '2026-12-31',
  expired: false,
  ...p,
});

function renderPage(list: MemberBenefit[]) {
  vi.mocked(groupsApi.get).mockResolvedValue({ id: 'g1', name: 'Academia Demo' } as MyGroup);
  vi.mocked(benefitsApi.list).mockResolvedValue(list);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <CommunityBenefitsPage />
    </QueryClientProvider>,
  );
}

describe('/community/[groupId]/benefits (Cm-22)', () => {
  afterEach(() => vi.clearAllMocks());

  it('cupom copia e avisa; link abre fora; vencido apagado e sem ação', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    renderPage([
      b({}),
      b({
        id: 'b2',
        partnerName: 'Fisio Movimento',
        discountText: '1ª avaliação grátis',
        kind: 'LINK',
        couponCode: null,
        url: 'https://fisio.example.com/demo',
        validUntil: '2026-11-30',
      }),
      b({
        id: 'b3',
        partnerName: 'Corre+ Tênis',
        couponCode: null,
        validUntil: '2026-10-31',
        expired: true,
      }),
    ]);
    expect(
      await screen.findByText('Descontos que a Academia Demo combinou com parceiros.'),
    ).toBeInTheDocument();

    const sup = await screen.findByRole('listitem', { name: 'Suplementa' });
    expect(within(sup).getByText('até 31 dez')).toBeInTheDocument();
    await userEvent.click(within(sup).getByRole('button', { name: 'Copiar código' }));
    expect(writeText).toHaveBeenCalledWith('DEMO15');
    expect(toast).toHaveBeenCalledWith('Código DEMO15 copiado');
    expect(within(sup).getByRole('button', { name: 'Copiado' })).toBeInTheDocument();

    const fisio = screen.getByRole('listitem', { name: 'Fisio Movimento' });
    const site = within(fisio).getByRole('link', { name: 'Visitar o site' });
    expect(site).toHaveAttribute('href', 'https://fisio.example.com/demo');
    expect(site).toHaveAttribute('target', '_blank');
    expect(site).toHaveAttribute('rel', 'noopener noreferrer');

    const corre = screen.getByRole('listitem', { name: 'Corre+ Tênis' });
    expect(within(corre).getByText('venceu')).toBeInTheDocument();
    const nota = within(corre).getByText('Venceu em 31 out. Sai da lista amanhã.');
    // Contraste: o apagado é só logo e título; a nota fica legível.
    expect(nota.closest('[class*="opacity-"]')).toBeNull();
    expect(within(corre).getByText('Corre+ Tênis').closest('[class*="opacity-"]')).not.toBeNull();
    expect(within(corre).queryByRole('button')).not.toBeInTheDocument();
    expect(within(corre).queryByRole('link')).not.toBeInTheDocument();

    expect(screen.getByText(/O Fatia não recebe dado da compra/)).toBeInTheDocument();
  });

  it('ação na cor da comunidade, monograma do parceiro neutro e um título só (Cm-22)', async () => {
    renderPage([
      b({}),
      b({
        id: 'b2',
        partnerName: 'Fisio Movimento',
        kind: 'LINK',
        couponCode: null,
        url: 'https://f.example.com',
      }),
    ]);
    const sup = await screen.findByRole('listitem', { name: 'Suplementa' });
    // O parceiro não é a academia: a cor dela fica no botão, não no logo do parceiro.
    expect(within(sup).getByText('SU').className).not.toMatch(/bg-brand/);
    expect(within(sup).getByRole('button', { name: 'Copiar código' }).className).toMatch(
      /bg-brand/,
    );
    const fisio = screen.getByRole('listitem', { name: 'Fisio Movimento' });
    expect(within(fisio).getByRole('link', { name: 'Visitar o site' }).className).toMatch(
      /bg-brand/,
    );
    // O título já está na barra do topo.
    expect(screen.queryByRole('heading', { name: 'Benefícios' })).not.toBeInTheDocument();
  });

  it('sem benefício, diz que não há', async () => {
    renderPage([]);
    expect(await screen.findByText('Nenhum benefício agora')).toBeInTheDocument();
  });
});
