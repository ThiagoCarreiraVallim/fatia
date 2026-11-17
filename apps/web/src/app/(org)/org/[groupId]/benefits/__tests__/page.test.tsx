import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MyGroup, TeamBenefit } from '@fatia/api-client';

const ctx = vi.hoisted(() => ({
  group: { id: 'g1', name: 'Academia Demo', role: 'OWNER', timezone: 'America/Sao_Paulo' },
}));
vi.mock('@/components/org/org-shell', () => ({ useOrgGroup: () => ctx.group as MyGroup }));
vi.mock('sonner', () => ({ toast: vi.fn() }));
vi.mock('@fatia/api-client', async () => {
  const actual = await vi.importActual<typeof import('@fatia/api-client')>('@fatia/api-client');
  return {
    ...actual,
    benefitsApi: { manage: vi.fn(), create: vi.fn(), update: vi.fn(), remove: vi.fn() },
  };
});

import { benefitsApi } from '@fatia/api-client';
import OrgBenefitsPage from '../page';

const tb = (p: Partial<TeamBenefit> = {}): TeamBenefit => ({
  id: 'b1',
  partnerName: 'Suplementa',
  logoUrl: null,
  logoFileId: null,
  discountText: '15% em suplementos',
  kind: 'COUPON',
  couponCode: 'DEMO15',
  url: null,
  validUntil: '2099-12-31',
  status: 'active',
  createdAt: '2026-11-01T00:00:00Z',
  updatedAt: '2026-11-01T00:00:00Z',
  ...p,
});

function renderPage(list: TeamBenefit[]) {
  vi.mocked(benefitsApi.manage).mockResolvedValue(list);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <OrgBenefitsPage />
    </QueryClientProvider>,
  );
}

describe('/org/[groupId]/benefits (Pn-28)', () => {
  afterEach(() => vi.clearAllMocks());

  it('vazio: chama para adicionar e cadastra um cupom', async () => {
    vi.mocked(benefitsApi.create).mockResolvedValue(tb());
    renderPage([]);
    await userEvent.click(await screen.findByRole('button', { name: /Adicionar benefício/ }));
    const form = screen.getByRole('form', { name: 'Benefício de parceiro' });
    await userEvent.type(within(form).getByLabelText('Parceiro'), 'Suplementa');
    await userEvent.type(within(form).getByLabelText('Desconto'), '15% em suplementos');
    await userEvent.type(within(form).getByLabelText('Código do cupom'), 'demo15');
    await userEvent.clear(within(form).getByLabelText('Validade'));
    await userEvent.type(within(form).getByLabelText('Validade'), '2099-12-31');
    // A prévia mostra o que o membro vai ver.
    expect(within(form).getByText('Copiar código DEMO15')).toBeInTheDocument();
    await userEvent.click(within(form).getByRole('button', { name: 'Salvar' }));
    await waitFor(() =>
      expect(benefitsApi.create).toHaveBeenCalledWith('g1', {
        partnerName: 'Suplementa',
        discountText: '15% em suplementos',
        kind: 'COUPON',
        couponCode: 'DEMO15',
        url: null,
        validUntil: '2099-12-31',
        logoFileId: null,
      }),
    );
  });

  it('link sem https não salva e diz por quê', async () => {
    renderPage([]);
    await userEvent.click(await screen.findByRole('button', { name: /Adicionar benefício/ }));
    const form = screen.getByRole('form', { name: 'Benefício de parceiro' });
    await userEvent.type(within(form).getByLabelText('Parceiro'), 'Fisio');
    await userEvent.type(within(form).getByLabelText('Desconto'), '1ª avaliação grátis');
    await userEvent.click(within(form).getByRole('radio', { name: 'Link' }));
    await userEvent.type(within(form).getByLabelText('Link do parceiro'), 'http://fisio.com');
    await userEvent.click(within(form).getByRole('button', { name: 'Salvar' }));
    expect(within(form).getByText('O link precisa começar com https://')).toBeInTheDocument();
    expect(benefitsApi.create).not.toHaveBeenCalled();
  });

  it('a tabela mostra ativo e expirado; editar abre o painel e remover confirma', async () => {
    vi.mocked(benefitsApi.remove).mockResolvedValue({ id: 'b1' });
    renderPage([
      tb(),
      tb({
        id: 'b2',
        partnerName: 'Corre+ Tênis',
        couponCode: 'CORRE10',
        validUntil: '2026-10-31',
        status: 'expired',
      }),
    ]);
    const tabela = await screen.findByRole('table');
    expect(within(tabela).getByText('ativo')).toBeInTheDocument();
    expect(within(tabela).getByText('expirado')).toBeInTheDocument();
    expect(within(tabela).getByText('venceu')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Editar Suplementa' }));
    const form = screen.getByRole('form', { name: 'Benefício de parceiro' });
    expect(within(form).getByLabelText('Parceiro')).toHaveValue('Suplementa');
    await userEvent.click(within(form).getByRole('button', { name: 'Remover' }));
    expect(benefitsApi.remove).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Remover' }));
    await waitFor(() => expect(benefitsApi.remove).toHaveBeenCalledWith('g1', 'b1'));
  });
});
