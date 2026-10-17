import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, type MyGroup, type SeatsOverview } from '@fatia/api-client';
import { assentos, grupo, renderWithClient } from '../../__tests__/helpers';

const ctx = vi.hoisted(() => ({ group: null as MyGroup | null }));
vi.mock('@/components/org/org-shell', () => ({ useOrgGroup: () => ctx.group }));
vi.mock('sonner', () => ({ toast: vi.fn() }));
vi.mock('@fatia/api-client', async () => {
  const actual = await vi.importActual<typeof import('@fatia/api-client')>('@fatia/api-client');
  return {
    ...actual,
    orgApi: { members: vi.fn() },
    seatsApi: {
      get: vi.fn(),
      invoices: vi.fn(),
      checkout: vi.fn(),
      update: vi.fn(),
      cancel: vi.fn(),
      unassign: vi.fn(),
    },
  };
});

import { orgApi, seatsApi } from '@fatia/api-client';
import { toast } from 'sonner';
import OrgSeatsPage from '../page';

function abrir(v: SeatsOverview = assentos()) {
  ctx.group = grupo();
  vi.mocked(seatsApi.get).mockResolvedValue(v);
  vi.mocked(orgApi.members).mockResolvedValue([]);
  vi.mocked(seatsApi.invoices).mockResolvedValue([
    {
      id: 'f1',
      kind: 'SUBSCRIPTION',
      amountCents: 2980,
      dueDate: '2026-10-17',
      status: 'PAID',
      invoiceUrl: 'https://sandbox.asaas.com/i/1',
      paidAt: '2026-10-17T12:00:00Z',
      createdAt: '2026-10-10T12:00:00Z',
    },
  ]);
  return renderWithClient(<OrgSeatsPage />);
}

describe('painel › assentos', () => {
  afterEach(() => vi.clearAllMocks());

  it('mostra uso, próxima cobrança, quem usa e as faturas', async () => {
    abrir();
    expect(await screen.findByText('1 de 2 em uso · R$ 29,80/mês')).toBeInTheDocument();
    expect(screen.getByText(/Próxima cobrança em 17 de nov/)).toBeInTheDocument();
    expect(screen.getByText('Carla')).toBeInTheDocument();
    expect(await screen.findByText('Paga')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Ver/ })).toHaveAttribute(
      'href',
      'https://sandbox.asaas.com/i/1',
    );
  });

  it('aumentar explica a cobrança na hora; erro da API aparece como veio', async () => {
    vi.mocked(seatsApi.update).mockRejectedValue(
      new ApiError('Esta comunidade está com pagamento em atraso.', 409),
    );
    abrir();
    const campo = await screen.findByLabelText('Mudar a quantidade');
    await userEvent.clear(campo);
    await userEvent.type(campo, '4');
    expect(screen.getByText(/Vale na hora: a mensalidade passa a R\$ 59,60/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    await waitFor(() => expect(seatsApi.update).toHaveBeenCalledWith('g1', 4));
    expect(toast).toHaveBeenCalledWith('Esta comunidade está com pagamento em atraso.');
  });

  it('sem assentos: compra com o documento, sem guardar', async () => {
    vi.mocked(seatsApi.checkout).mockResolvedValue(assentos());
    abrir(assentos({ pool: null, assigned: 0, assignments: [] }));
    expect(await screen.findByText('Sem assentos · R$ 14,90 por pessoa/mês')).toBeInTheDocument();
    expect(screen.getByText(/O Fatia não guarda/)).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('CPF ou CNPJ de quem paga'), '11.222.333/0001-81');
    await userEvent.click(screen.getByRole('button', { name: 'Comprar por R$ 74,50/mês' }));
    await waitFor(() => expect(seatsApi.checkout).toHaveBeenCalledWith('g1', 5, '11222333000181'));
  });
});
