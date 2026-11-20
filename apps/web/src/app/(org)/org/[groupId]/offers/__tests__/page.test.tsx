import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MyGroup, OffersList, OfferView } from '@fatia/api-client';
import { SidePanel, SidePanelProvider } from '@/components/org/side-panel';
import { grupo, renderWithClient } from '../../__tests__/helpers';

const ctx = vi.hoisted(() => ({ group: null as MyGroup | null }));
vi.mock('@/components/org/org-shell', () => ({ useOrgGroup: () => ctx.group }));
vi.mock('sonner', () => ({ toast: vi.fn() }));
vi.mock('@fatia/api-client', async () => {
  const actual = await vi.importActual<typeof import('@fatia/api-client')>('@fatia/api-client');
  return {
    ...actual,
    offersApi: {
      list: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      publish: vi.fn(),
      close: vi.fn(),
      duplicate: vi.fn(),
      resendLink: vi.fn(),
    },
    contentApi: { plans: vi.fn() },
    seatProgramsApi: { list: vi.fn() },
  };
});

import { contentApi, offersApi, seatProgramsApi } from '@fatia/api-client';
import { toast } from 'sonner';
import OrgOffersPage from '../page';

const oferta = (p: Partial<OfferView> = {}): OfferView => ({
  id: 'o1',
  slug: 'verao-21',
  title: 'Verão 21',
  description: '21 dias de treino e alimentação com a Helena.',
  priceCents: 14_900,
  spots: 30,
  startDate: '2026-12-01',
  endDate: '2026-12-21',
  grantsEntry: true,
  program: null,
  planTemplate: { id: 't1', title: 'Inferior v2' },
  extras: 'questionário de início',
  status: 'ACTIVE',
  publishedAt: '2026-11-10T12:00:00Z',
  closedAt: null,
  saleUrl: 'https://fat.ia.br/academia-demo/verao-21',
  stats: { sales: 18, spotsLeft: 12, revenueCents: 268_200, netCents: 241_380, activated48h: 15 },
  failed: [],
  ...p,
});

function abrir(lista: Partial<OffersList> = {}) {
  ctx.group = grupo();
  vi.mocked(offersApi.list).mockResolvedValue({
    salesEnabled: false,
    platformFeePercent: 10,
    offers: [oferta()],
    ...lista,
  });
  vi.mocked(contentApi.plans).mockResolvedValue([]);
  vi.mocked(seatProgramsApi.list).mockResolvedValue([]);
  return renderWithClient(
    <SidePanelProvider>
      <OrgOffersPage />
      <SidePanel />
    </SidePanelProvider>,
  );
}

describe('painel › ofertas (Pn-37, Pn-37b, #403)', () => {
  afterEach(() => vi.clearAllMocks());

  it('a oferta ativa: preço, vendas, receita, ativaram e o link de venda', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    abrir();
    expect(await screen.findByRole('heading', { name: 'Ofertas' })).toBeInTheDocument();
    const card = screen.getByRole('article', { name: 'Verão 21' });
    expect(within(card).getByText('R$ 149')).toBeInTheDocument();
    expect(within(card).getByText('1 a 21 dez · até 30 vagas')).toBeInTheDocument();
    expect(within(card).getByText('18')).toBeInTheDocument();
    expect(within(card).getByText('de 30 vagas')).toBeInTheDocument();
    expect(within(card).getByText('R$ 2.682')).toBeInTheDocument();
    expect(within(card).getByText('R$ 2.413,80 depois da taxa de 10%')).toBeInTheDocument();
    expect(within(card).getByText('15')).toBeInTheDocument();
    expect(
      within(card).getByText(/Plano Inferior v2 · questionário de início/),
    ).toBeInTheDocument();
    expect(screen.getByText('fat.ia.br/academia-demo/verao-21')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Copiar link' }));
    expect(writeText).toHaveBeenCalledWith('https://fat.ia.br/academia-demo/verao-21');
    // A venda pelo Asaas ainda não está ligada nesta instância.
    expect(screen.getByText(/A venda ainda não está ligada/)).toBeInTheDocument();
  });

  it('pagamento falhou (Pn-37b): quem e desde quando; reenviar o link', async () => {
    vi.mocked(offersApi.resendLink).mockResolvedValue({ sent: true });
    abrir({
      offers: [
        oferta({
          failed: [
            {
              purchaseId: 'p1',
              name: 'Rafa Gomes',
              since: '2026-12-09T15:00:00Z',
              canResend: true,
            },
            {
              purchaseId: 'p2',
              name: 'Lia Torres',
              since: '2026-12-10T15:00:00Z',
              canResend: false,
            },
          ],
        }),
      ],
    });
    const painel = await screen.findByRole('region', { name: 'Pagamento falhou · 2 pessoas' });
    expect(within(painel).getByText('Rafa Gomes')).toBeInTheDocument();
    expect(within(painel).getByText('9 dez')).toBeInTheDocument();
    expect(within(painel).getByText(/não recebem o conteúdo novo até pagar/)).toBeInTheDocument();
    expect(screen.getByText('ativa · 2 pagamentos falharam')).toBeInTheDocument();
    await userEvent.click(
      within(painel).getByRole('button', { name: 'Reenviar link de pagamento a Rafa Gomes' }),
    );
    await waitFor(() => expect(offersApi.resendLink).toHaveBeenCalledWith('g1', 'o1', 'p1'));
    expect(toast).toHaveBeenCalledWith('Link de pagamento reenviado.');
    expect(
      within(painel).getByRole('button', { name: 'Reenviar link de pagamento a Lia Torres' }),
    ).toBeDisabled();
  });

  it('estados: rascunho publica; encerrada duplica para o mês seguinte', async () => {
    vi.mocked(offersApi.publish).mockResolvedValue(oferta());
    vi.mocked(offersApi.duplicate).mockResolvedValue(oferta({ id: 'o9', status: 'DRAFT' }));
    abrir({
      offers: [
        oferta({ id: 'd1', title: 'Janeiro', status: 'DRAFT', publishedAt: null }),
        oferta({ id: 'c1', title: 'Novembro', status: 'CLOSED', closedAt: '2026-11-30T12:00:00Z' }),
      ],
    });
    await userEvent.click(await screen.findByRole('tab', { name: /Rascunhos/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Publicar' }));
    await waitFor(() => expect(offersApi.publish).toHaveBeenCalledWith('g1', 'd1'));
    await userEvent.click(screen.getByRole('tab', { name: /Encerradas/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Duplicar para janeiro' }));
    await waitFor(() => expect(offersApi.duplicate).toHaveBeenCalledWith('g1', 'c1'));
  });

  it('nova oferta no painel lateral', async () => {
    vi.mocked(offersApi.create).mockResolvedValue(oferta({ id: 'n1', status: 'DRAFT' }));
    abrir({ offers: [] });
    expect(await screen.findByText('Nenhuma oferta ativa')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Nova oferta/ }));
    await userEvent.type(await screen.findByLabelText('Nome'), 'Verão 21');
    await userEvent.type(screen.getByLabelText('Preço (R$)'), '149');
    await userEvent.type(screen.getByLabelText('Vagas'), '30');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar rascunho' }));
    await waitFor(() =>
      expect(offersApi.create).toHaveBeenCalledWith(
        'g1',
        expect.objectContaining({ title: 'Verão 21', priceCents: 14_900, spots: 30 }),
      ),
    );
  });
});
