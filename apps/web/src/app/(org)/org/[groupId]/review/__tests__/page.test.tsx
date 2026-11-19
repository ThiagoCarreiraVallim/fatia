import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AtRiskView, MyGroup, PanelReviewItem, PanelReviewQueue } from '@fatia/api-client';
import { grupo, renderWithClient } from '../../__tests__/helpers';

const ctx = vi.hoisted(() => ({
  group: null as MyGroup | null,
  search: new URLSearchParams(),
}));
vi.mock('next/navigation', () => ({
  useSearchParams: () => ctx.search,
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => '/org/g1/review',
}));
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock('@/components/org/org-shell', () => ({ useOrgGroup: () => ctx.group }));
vi.mock('sonner', () => ({ toast: vi.fn() }));
vi.mock('@fatia/api-client', async () => {
  const actual = await vi.importActual<typeof import('@fatia/api-client')>('@fatia/api-client');
  return {
    ...actual,
    reviewApi: {
      queue: vi.fn(),
      markSeen: vi.fn(),
      atRisk: vi.fn(),
      setRiskDays: vi.fn(),
      setDigest: vi.fn(),
      session: vi.fn(),
      sendFeedback: vi.fn(),
    },
  };
});

import { reviewApi } from '@fatia/api-client';
import ReviewPage from '../page';

const item = (over: Partial<PanelReviewItem> = {}): PanelReviewItem => ({
  kind: 'WORKOUT',
  refId: 's1',
  membershipId: 'm-ana',
  name: 'Ana Dias',
  at: '2026-11-18T21:54:00.000Z',
  title: 'Inferior v2',
  durationMinutes: 52,
  sets: 19,
  answer: null,
  shares: ['WORKOUT', 'NUTRITION', 'GOALS'],
  whatsapp: '5565998123456',
  seenAt: null,
  myFeedback: false,
  ...over,
});

const fila: PanelReviewQueue = {
  windowDays: 7,
  items: [
    item(),
    item({
      kind: 'PLAN_RESPONSE',
      refId: 'v1',
      membershipId: 'm-lia',
      name: 'Lia Prado',
      title: 'Cutting 1.800',
      answer: 'DECLINED',
      durationMinutes: null,
      sets: null,
      shares: ['NUTRITION'],
      whatsapp: null,
    }),
    item({
      kind: 'GOAL',
      refId: 'g1',
      membershipId: 'm-gabi',
      name: 'Gabi Torres',
      title: 'Treinar 4× por semana',
      seenAt: '2026-11-18T22:00:00.000Z',
    }),
  ],
};

const risco: AtRiskView = {
  riskDays: 7,
  digest: false,
  canConfigure: true,
  rows: [
    {
      membershipId: 'm-julia',
      name: 'Júlia Reis',
      signal: 'inactive',
      level: 'attention',
      days: 9,
      lastAt: '2026-11-10T12:00:00.000Z',
      shares: ['WORKOUT', 'HABITS'],
      whatsapp: '5565998123456',
    },
  ],
};

beforeEach(() => {
  ctx.group = grupo({ id: 'g1', role: 'OWNER' });
  ctx.search = new URLSearchParams();
  vi.mocked(reviewApi.queue).mockResolvedValue(fila);
  vi.mocked(reviewApi.atRisk).mockResolvedValue(risco);
  vi.mocked(reviewApi.markSeen).mockResolvedValue({ seenAt: '2026-11-19T10:00:00.000Z' });
  vi.mocked(reviewApi.setRiskDays).mockResolvedValue({ riskDays: 14 });
  vi.mocked(reviewApi.setDigest).mockResolvedValue({ digest: true });
});
afterEach(() => vi.clearAllMocks());

describe('Para revisar (#399, Pn-02)', () => {
  it('abas com os números, o texto da prancha e as colunas da tabela', async () => {
    renderWithClient(<ReviewPage />);
    expect(await screen.findByRole('tab', { name: /Para revisar · 2/ })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getByRole('tab', { name: /Revisados · 1/ })).toBeInTheDocument();
    expect(await screen.findByRole('tab', { name: /Em risco · 1/ })).toBeInTheDocument();
    expect(screen.getByText(/Só aparece o que o membro compartilhou com você/)).toBeInTheDocument();
    const tabela = screen.getByRole('table');
    for (const col of ['Membro', 'Tipo', 'O que aconteceu', 'Compartilha']) {
      expect(within(tabela).getByRole('columnheader', { name: col })).toBeInTheDocument();
    }
    const ana = within(tabela).getByRole('row', { name: /Ana Dias/ });
    expect(within(ana).getByText('treino')).toBeInTheDocument();
    expect(within(ana).getByText('Inferior v2 · 52 min · 19 séries')).toBeInTheDocument();
    expect(within(ana).getByText('treino, alimentação, metas')).toBeInTheDocument();
    expect(within(ana).getByRole('link', { name: 'Ver sessão' })).toHaveAttribute(
      'href',
      '/org/g1/review/sessions/s1',
    );
    expect(within(ana).getByRole('link', { name: /WhatsApp/ })).toHaveAttribute(
      'href',
      expect.stringContaining('https://wa.me/5565998123456?text='),
    );
    const lia = within(tabela).getByRole('row', { name: /Lia Prado/ });
    expect(within(lia).getByText('Recusou “Cutting 1.800”')).toBeInTheDocument();
    expect(within(lia).getByRole('link', { name: 'Abrir ficha' })).toHaveAttribute(
      'href',
      '/org/g1/members/m-lia',
    );
    // Sem WhatsApp autorizado, sem o botão.
    expect(within(lia).queryByRole('link', { name: /WhatsApp/ })).not.toBeInTheDocument();
    // O que já foi visto fica em "Revisados".
    expect(within(tabela).queryByText('Gabi Torres')).not.toBeInTheDocument();
  });

  it('"Visto" marca e a linha vai para Revisados', async () => {
    const user = userEvent.setup();
    renderWithClient(<ReviewPage />);
    const ana = await screen.findByRole('row', { name: /Ana Dias/ });
    vi.mocked(reviewApi.queue).mockResolvedValue({
      ...fila,
      items: fila.items.map((i) =>
        i.refId === 's1' ? { ...i, seenAt: '2026-11-19T10:00:00.000Z' } : i,
      ),
    });
    await user.click(within(ana).getByRole('button', { name: 'Visto' }));
    expect(reviewApi.markSeen).toHaveBeenCalledWith('g1', 'WORKOUT', 's1');
    await waitFor(() =>
      expect(screen.queryByRole('row', { name: /Ana Dias/ })).not.toBeInTheDocument(),
    );
    await user.click(screen.getByRole('tab', { name: /Revisados/ }));
    const revisada = await screen.findByRole('row', { name: /Ana Dias/ });
    expect(within(revisada).getByText('revisado')).toBeInTheDocument();
    expect(within(revisada).queryByRole('button', { name: 'Visto' })).not.toBeInTheDocument();
  });

  it('filtros por tipo, e o vazio "Nada aqui com este filtro"', async () => {
    const user = userEvent.setup();
    vi.mocked(reviewApi.queue).mockResolvedValue({ ...fila, items: [fila.items[0]!] });
    renderWithClient(<ReviewPage />);
    await screen.findByRole('row', { name: /Ana Dias/ });
    await user.click(screen.getByRole('button', { name: 'Respostas e planos' }));
    expect(screen.getByText('Nada aqui com este filtro.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Treinos' }));
    expect(screen.getByRole('row', { name: /Ana Dias/ })).toBeInTheDocument();
  });

  it('Em risco: sinal, WhatsApp com texto pronto e o limite do dono', async () => {
    const user = userEvent.setup();
    renderWithClient(<ReviewPage />);
    await user.click(await screen.findByRole('tab', { name: /Em risco/ }));
    const tabela = screen.getByRole('table');
    expect(within(tabela).getByRole('columnheader', { name: 'Sinal' })).toBeInTheDocument();
    const julia = within(tabela).getByRole('row', { name: /Júlia Reis/ });
    expect(within(julia).getByText('parado')).toBeInTheDocument();
    expect(within(julia).getByText('Último registro há 9 dias')).toBeInTheDocument();
    expect(within(julia).getByText('treino, hábitos')).toBeInTheDocument();
    expect(within(julia).getByRole('link', { name: 'Chamar no WhatsApp' })).toHaveAttribute(
      'href',
      expect.stringContaining('Senti%20sua%20falta'),
    );
    expect(
      screen.getByText(/Quem não compartilha com você fica fora desta lista/),
    ).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('Entra na lista depois de'), '14');
    expect(reviewApi.setRiskDays).toHaveBeenCalledWith('g1', 14);
    await user.click(screen.getByRole('switch', { name: /Aviso diário/ }));
    expect(reviewApi.setDigest).toHaveBeenCalledWith('g1', true);
  });

  it('profissional não muda o limite, mas liga o próprio aviso diário', async () => {
    ctx.group = grupo({ id: 'g1', role: 'PROFESSIONAL' });
    ctx.search = new URLSearchParams('aba=risco');
    vi.mocked(reviewApi.atRisk).mockResolvedValue({ ...risco, canConfigure: false });
    renderWithClient(<ReviewPage />);
    expect(await screen.findByRole('tab', { name: /Em risco/ })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await screen.findByRole('row', { name: /Júlia Reis/ });
    expect(screen.queryByLabelText('Entra na lista depois de')).not.toBeInTheDocument();
    expect(screen.getByText(/7 dias sem registrar/)).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: /Aviso diário/ })).toBeInTheDocument();
  });
});
