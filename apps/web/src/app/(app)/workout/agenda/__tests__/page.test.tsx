import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Agenda, AgendaItem } from '@fatia/api-client';

const ctx = vi.hoisted(() => ({
  toast: Object.assign(vi.fn(), { error: vi.fn() }),
  push: vi.fn(),
}));
vi.mock('sonner', () => ({ toast: ctx.toast }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: ctx.push }),
  usePathname: () => '/workout/agenda',
}));
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock('@/lib/dias', () => ({ hojeIso: () => '2025-11-13' }));
vi.mock('@/components/ui/drawer', () => {
  const Passthrough = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
  return {
    Drawer: ({ open, children }: { open: boolean; children: ReactNode }) =>
      open ? <div role="dialog">{children}</div> : null,
    DrawerContent: Passthrough,
    DrawerHeader: Passthrough,
    DrawerFooter: Passthrough,
    DrawerTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
    DrawerDescription: ({ children }: { children: ReactNode }) => <p>{children}</p>,
    DrawerClose: Passthrough,
  };
});
vi.mock('@fatia/api-client', async () => {
  const actual = await vi.importActual<typeof import('@fatia/api-client')>('@fatia/api-client');
  return {
    ...actual,
    agendaApi: { range: vi.fn(), reschedule: vi.fn() },
    workoutApi: { ...actual.workoutApi, startSession: vi.fn() },
  };
});

import { agendaApi } from '@fatia/api-client';
import AgendaPage from '../page';

const api = vi.mocked(agendaApi);

const item = (over: Partial<AgendaItem>): AgendaItem => ({
  id: 's1',
  kind: 'planned',
  planId: 'p1',
  planName: 'Treino A',
  order: 1,
  state: 'planned',
  rescheduledFrom: null,
  canReschedule: true,
  endDate: '2025-11-16',
  ...over,
});

const days = (from: string, n: number, items: Record<string, AgendaItem[]> = {}) =>
  Array.from({ length: n }, (_, i) => {
    const date = new Date(Date.parse(`${from}T00:00:00Z`) + i * 86_400_000)
      .toISOString()
      .slice(0, 10);
    return { date, items: items[date] ?? [] };
  });

const agenda = (over: Partial<Agenda> = {}): Agenda => ({
  today: '2025-11-13',
  from: '2025-11-10',
  to: '2025-11-16',
  days: days('2025-11-10', 7, {
    '2025-11-10': [item({ id: 'a', state: 'done' })],
    '2025-11-12': [item({ id: 'b', state: 'missed', planName: 'Treino B', order: 2 })],
    '2025-11-13': [item({ id: 'c', state: 'today', order: 3 })],
  }),
  calendarPlan: {
    planId: 'p1',
    planName: 'Hipertrofia A/B',
    authorName: 'Helena',
    weekNumber: 3,
    weeksTotal: 4,
    startDate: '2025-10-27',
    endDate: '2025-11-16',
  },
  flexible: [],
  ended: null,
  empty: false,
  ...over,
});

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <AgendaPage />
    </QueryClientProvider>,
  );
}

describe('Agenda (Al-T24)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('abre na semana de hoje, com o plano à direita e o dia de hoje escolhido', async () => {
    api.range.mockResolvedValue(agenda());
    renderPage();
    expect(await screen.findByText('Hipertrofia A/B · semana 3 de 4')).toBeInTheDocument();
    expect(api.range).toHaveBeenCalledWith('2025-11-10', '2025-11-16');
    expect(screen.getByText('10 – 16 nov')).toBeInTheDocument();
    expect(screen.getByText('qui, 13 nov')).toBeInTheDocument();
    expect(screen.getByText('hoje · sessão 3')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Abrir' })).toBeInTheDocument();
  });

  it('remarcar: escolhe um dia de hoje ao fim do plano e confirma', async () => {
    api.range.mockResolvedValue(agenda());
    api.reschedule.mockResolvedValue({
      id: 'b',
      date: '2025-11-15',
      rescheduledFrom: '2025-11-12',
      planName: 'Treino B',
    });
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: /qua, 12 nov/ }));
    expect(screen.getByText('não feito')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Remarcar' }));
    const sheet = screen.getByRole('dialog');
    // De hoje (13) ao fim do plano (16): quatro dias, nenhum depois.
    const options = within(sheet).getAllByRole('radio');
    expect(options).toHaveLength(4);
    expect(within(sheet).queryByRole('radio', { name: /17/ })).not.toBeInTheDocument();
    await userEvent.click(within(sheet).getByRole('radio', { name: /sáb, 15 nov/ }));
    expect(api.reschedule).not.toHaveBeenCalled();
    await userEvent.click(within(sheet).getByRole('button', { name: 'Remarcar para sáb, 15 nov' }));
    await waitFor(() => expect(api.reschedule).toHaveBeenCalledWith('b', '2025-11-15'));
    expect(ctx.toast).toHaveBeenCalledWith('Treino B remarcado para sáb, 15 nov');
  });

  it('o mês busca a grade inteira, de segunda a domingo', async () => {
    api.range.mockResolvedValue(agenda());
    renderPage();
    await screen.findByText('10 – 16 nov');
    api.range.mockResolvedValue(
      agenda({ from: '2025-10-27', to: '2025-11-30', days: days('2025-10-27', 35) }),
    );
    await userEvent.click(screen.getByRole('radio', { name: 'Mês' }));
    await waitFor(() => expect(api.range).toHaveBeenLastCalledWith('2025-10-27', '2025-11-30'));
    expect(await screen.findByText('novembro de 2025')).toBeInTheDocument();
  });

  it('sem nada planejado (Al-T24b)', async () => {
    api.range.mockResolvedValue(
      agenda({ calendarPlan: null, empty: true, days: days('2025-11-10', 7) }),
    );
    renderPage();
    expect(await screen.findByText('Nada planejado')).toBeInTheDocument();
    expect(screen.getByText('sem plano com datas')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ver meus planos' })).toHaveAttribute(
      'href',
      '/workout/plans',
    );
  });

  it('plano que terminou (Al-T24c)', async () => {
    api.range.mockResolvedValue(
      agenda({
        calendarPlan: null,
        days: days('2025-11-10', 7),
        ended: {
          planId: 'p1',
          planName: 'Hipertrofia A/B',
          authorName: 'Helena P',
          done: 15,
          total: 16,
          weeks: 4,
        },
      }),
    );
    renderPage();
    expect(await screen.findByText('Hipertrofia A/B terminou')).toBeInTheDocument();
    expect(
      screen.getByText('15 de 16 sessões em 4 semanas. Helena pode mandar o próximo plano.'),
    ).toBeInTheDocument();
  });
});
