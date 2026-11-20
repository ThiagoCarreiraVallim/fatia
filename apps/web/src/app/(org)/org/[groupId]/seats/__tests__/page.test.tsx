import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ApiError,
  type MyGroup,
  type SeatInvoice,
  type SeatProgram,
  type SeatsOverview,
} from '@fatia/api-client';
import { SidePanel, SidePanelProvider } from '@/components/org/side-panel';
import { assentos, grupo, membro, renderWithClient } from '../../__tests__/helpers';

const ctx = vi.hoisted(() => ({ group: null as MyGroup | null }));
vi.mock('@/components/org/org-shell', () => ({ useOrgGroup: () => ctx.group }));
vi.mock('sonner', () => ({ toast: vi.fn() }));
vi.mock('@fatia/api-client', async () => {
  const actual = await vi.importActual<typeof import('@fatia/api-client')>('@fatia/api-client');
  return {
    ...actual,
    orgApi: { members: vi.fn() },
    challengesApi: { list: vi.fn() },
    seatsApi: {
      get: vi.fn(),
      invoices: vi.fn(),
      checkout: vi.fn(),
      update: vi.fn(),
      cancel: vi.fn(),
      unassign: vi.fn(),
    },
    seatProgramsApi: { list: vi.fn(), create: vi.fn() },
  };
});

import { challengesApi, orgApi, seatProgramsApi, seatsApi } from '@fatia/api-client';
import { toast } from 'sonner';
import OrgSeatsPage from '../page';

const fatura = (p: Partial<SeatInvoice> = {}): SeatInvoice => ({
  id: 'f1',
  kind: 'SUBSCRIPTION',
  amountCents: 2980,
  dueDate: '2026-10-17',
  status: 'PAID',
  invoiceUrl: 'https://sandbox.asaas.com/i/1',
  seats: 2,
  proRataDays: null,
  paidAt: '2026-10-17T12:00:00Z',
  createdAt: '2026-10-10T12:00:00Z',
  ...p,
});

const programa: SeatProgram = {
  id: 'p1',
  name: 'Verão 21',
  note: 'turma das 6h · Helena',
  kind: 'CLASS',
  challengeId: null,
  challengeTitle: null,
  seats: 18,
  assigned: 18,
  startDate: '2026-11-01',
  endDate: '2026-11-30',
  amountCents: 26_820,
  chargeStatus: 'ACTIVE',
  status: 'ACTIVE',
};

function abrir(v: SeatsOverview = assentos(), faturas: SeatInvoice[] = [fatura()]) {
  ctx.group = grupo();
  vi.mocked(seatsApi.get).mockResolvedValue(v);
  vi.mocked(orgApi.members).mockResolvedValue([
    membro({ name: 'Carla' }),
    membro({ name: 'Bruno' }),
    membro({ name: 'Dona', role: 'OWNER' }),
  ]);
  vi.mocked(challengesApi.list).mockResolvedValue({ today: '2026-11-14', challenges: [] });
  vi.mocked(seatsApi.invoices).mockResolvedValue(faturas);
  return renderWithClient(
    <SidePanelProvider>
      <OrgSeatsPage />
      <SidePanel />
    </SidePanelProvider>,
  );
}

describe('painel › assentos (Pn-07, #403)', () => {
  afterEach(() => vi.clearAllMocks());

  it('cartões, faturas da prancha e o bloco de programas', async () => {
    abrir(
      assentos({
        nextInvoice: {
          seats: 2,
          unitPriceCents: 1490,
          amountCents: 2980,
          dueAt: '2026-11-17T03:00:00.000Z',
        },
        programs: [programa],
      }),
    );
    expect(await screen.findByRole('heading', { name: 'Assentos PRO' })).toBeInTheDocument();
    expect(screen.getByText('1/2')).toBeInTheDocument();
    expect(screen.getByText('1 livre')).toBeInTheDocument();
    expect(screen.getByText('2 × R$ 14,90 · vence 17 nov')).toBeInTheDocument();
    expect(screen.getByText('Em dia')).toBeInTheDocument();
    const faturas = await screen.findByRole('table', { name: 'Faturas' });
    expect(within(faturas).getByText('Outubro')).toBeInTheDocument();
    expect(within(faturas).getByText('paga')).toBeInTheDocument();
    expect(within(faturas).getByRole('link', { name: /Ver fatura/ })).toHaveAttribute(
      'href',
      'https://sandbox.asaas.com/i/1',
    );
    const programas = screen.getByRole('table', { name: 'Programas' });
    expect(within(programas).getByText('Verão 21')).toBeInTheDocument();
    expect(within(programas).getByText('1 a 30 nov')).toBeInTheDocument();
    expect(within(programas).getByText('em andamento')).toBeInTheDocument();
    // Quem usa continua na tela, com "Tirar".
    expect(screen.getByText('Carla')).toBeInTheDocument();
  });

  it('fatura vencida (Pn-07v): faixa com os dias da carência e "Pagar agora" no Asaas', async () => {
    abrir(
      assentos({
        pool: { ...assentos().pool!, status: 'PAST_DUE', graceDaysLeft: 3 },
        overdueInvoice: fatura({
          id: 'nov',
          status: 'OVERDUE',
          dueDate: '2026-11-10',
          invoiceUrl: 'https://sandbox.asaas.com/i/nov',
        }),
      }),
    );
    expect(
      await screen.findByText('Fatura de novembro vencida · faltam 3 dias'),
    ).toBeInTheDocument();
    expect(screen.getByText(/só a IA para/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Pagar agora' })).toHaveAttribute(
      'href',
      'https://sandbox.asaas.com/i/nov',
    );
    expect(screen.getByText('Vencida')).toBeInTheDocument();
  });

  it('ajustar assentos no painel lateral: mínimo é o que está em uso; erro da API aparece como veio', async () => {
    vi.mocked(seatsApi.update).mockRejectedValue(
      new ApiError('Esta comunidade está com pagamento em atraso.', 409),
    );
    abrir();
    await userEvent.click(await screen.findByRole('button', { name: /Ajustar assentos/ }));
    const campo = await screen.findByLabelText('Assentos');
    await userEvent.clear(campo);
    await userEvent.type(campo, '0');
    expect(screen.getByText('Mínimo 1: o que está em uso.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Salvar' })).toBeDisabled();
    await userEvent.clear(campo);
    await userEvent.type(campo, '4');
    expect(screen.getByText('R$ 59,60 por mês')).toBeInTheDocument();
    expect(screen.getByText(/Vale na hora/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    await waitFor(() => expect(seatsApi.update).toHaveBeenCalledWith('g1', 4));
    expect(toast).toHaveBeenCalledWith('Esta comunidade está com pagamento em atraso.');
  });

  it('novo programa para a turma: escolhe quem, as datas e vê o valor antes', async () => {
    vi.mocked(seatProgramsApi.create).mockResolvedValue(programa);
    abrir();
    await userEvent.click(await screen.findByRole('button', { name: /Novo programa/ }));
    await userEvent.type(await screen.findByLabelText('Nome'), 'Verão 21');
    await userEvent.click(await screen.findByRole('checkbox', { name: 'Carla' }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'Bruno' }));
    // O dono não ganha assento de programa: a lista é de membros.
    expect(screen.queryByRole('checkbox', { name: 'Dona' })).not.toBeInTheDocument();
    const inicio = screen.getByLabelText('Começa');
    const fim = screen.getByLabelText('Termina');
    await userEvent.clear(inicio);
    await userEvent.type(inicio, '2026-11-01');
    await userEvent.clear(fim);
    await userEvent.type(fim, '2026-11-30');
    expect(screen.getByText('2 assentos × R$ 14,90 · R$ 29,80')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Criar programa' }));
    await waitFor(() =>
      expect(seatProgramsApi.create).toHaveBeenCalledWith('g1', {
        name: 'Verão 21',
        kind: 'CLASS',
        seats: 2,
        startDate: '2026-11-01',
        endDate: '2026-11-30',
        membershipIds: ['m-Carla', 'm-Bruno'],
      }),
    );
  });

  it('sem assentos: compra com o documento, sem guardar', async () => {
    vi.mocked(seatsApi.checkout).mockResolvedValue(assentos());
    abrir(assentos({ pool: null, assigned: 0, assignments: [], nextInvoice: null }), []);
    expect(await screen.findByText(/O Fatia não guarda/)).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('CPF ou CNPJ de quem paga'), '11.222.333/0001-81');
    await userEvent.click(screen.getByRole('button', { name: 'Comprar por R$ 74,50/mês' }));
    await waitFor(() => expect(seatsApi.checkout).toHaveBeenCalledWith('g1', 5, '11222333000181'));
  });
});
