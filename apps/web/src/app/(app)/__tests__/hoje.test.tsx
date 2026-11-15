import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { todaySummary } from '@/components/today/__tests__/fixture';
import HomePage from '../page';

/**
 * Hoje do redesign (#373, prancha Al-H1-Hoje): o chip "Metas N/M" abre "Metas
 * de hoje", o sino só abre com aviso novo, e o "+" da água soma um copo e diz
 * o total do dia.
 */

const api = vi.hoisted(() => ({
  today: vi.fn(),
  createWater: vi.fn(),
  inboxList: vi.fn(),
  markRead: vi.fn(),
  toast: vi.fn(),
  push: vi.fn(),
}));

vi.mock('sonner', () => ({ toast: api.toast }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: api.push }),
  usePathname: () => '/',
}));
vi.mock('@/components/ui/drawer', () => {
  const Passthrough = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
  return {
    Drawer: ({ open, children }: { open: boolean; children: ReactNode }) =>
      open ? <div role="dialog">{children}</div> : null,
    DrawerContent: Passthrough,
    DrawerHeader: Passthrough,
    DrawerTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
    DrawerDescription: ({ children }: { children: ReactNode }) => <p>{children}</p>,
    DrawerClose: Passthrough,
    DrawerFooter: Passthrough,
  };
});
vi.mock('@fatia/api-client', async () => {
  const actual = await vi.importActual<typeof import('@fatia/api-client')>('@fatia/api-client');
  return {
    ...actual,
    usersApi: { me: vi.fn(async () => ({ name: 'Ana' })) },
    goalsApi: { list: vi.fn(async () => []) },
    inboxApi: { list: api.inboxList, markRead: api.markRead },
    progressApi: {
      ...actual.progressApi,
      today: api.today,
      createWater: api.createWater,
      listWater: vi.fn(async () => ({ logs: [] })),
      refreshAchievements: vi.fn(() => new Promise(() => undefined)),
    },
  };
});

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <HomePage />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('Hoje (#373)', () => {
  it('o chip "Metas 2/5" abre "Metas de hoje" com as linhas e o compartilhar', async () => {
    api.today.mockResolvedValue(todaySummary());
    renderPage();
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Metas do dia: 2 de 5' }));
    const sheet = screen.getByRole('dialog');
    expect(within(sheet).getByRole('heading', { name: 'Metas de hoje' })).toBeInTheDocument();
    expect(within(sheet).getByText('2 de 5', { selector: 'span' })).toBeInTheDocument();
    expect(
      within(sheet).getByRole('button', { name: 'Proteína: 140 / 130–150 g, atingida' }),
    ).toBeInTheDocument();
    expect(within(sheet).getByRole('link', { name: 'Ajustar' })).toHaveAttribute(
      'href',
      '/nutrition/goals',
    );
    expect(within(sheet).getByRole('link', { name: 'Pessoais' })).toHaveAttribute('href', '/goals');

    // A linha de treino leva ao histórico; a de água abre a folha de água por cima.
    await user.click(within(sheet).getByRole('button', { name: /^Treino:/ }));
    expect(api.push).toHaveBeenCalledWith('/workout/history');
  });

  it('a linha de água de "Metas de hoje" abre a folha de água', async () => {
    api.today.mockResolvedValue(todaySummary());
    renderPage();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Metas do dia: 2 de 5' }));
    await user.click(screen.getByRole('button', { name: /^Água:/ }));
    expect(screen.getByRole('heading', { name: 'Água' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Metas de hoje' })).toBeNull();
  });

  it('sem metas definidas, o chip vira "Definir metas"', async () => {
    api.today.mockResolvedValue(todaySummary({ dailyGoals: { met: 0, total: 0, items: [] } }));
    renderPage();
    expect(await screen.findByRole('link', { name: 'Definir metas' })).toHaveAttribute(
      'href',
      '/nutrition/goals',
    );
  });

  it('sino sem aviso novo: não abre nada e diz "Sem novos avisos"', async () => {
    api.today.mockResolvedValue(todaySummary());
    renderPage();
    const bell = await screen.findByRole('button', { name: 'Avisos' });
    await screen.findByRole('button', { name: /^Metas do dia/ });
    expect(screen.queryByTestId('inbox-dot')).toBeNull();
    await userEvent.setup().click(bell);
    expect(api.toast).toHaveBeenCalledWith('Sem novos avisos');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(api.inboxList).not.toHaveBeenCalled();
  });

  it('sino com aviso novo: ponto, abre a lista e marca tudo como lido', async () => {
    api.today.mockResolvedValue(todaySummary({ inbox: { unread: 1 } }));
    api.inboxList.mockResolvedValue({
      unread: 1,
      items: [
        {
          id: 'n1',
          kind: 'COMMUNITY',
          title: 'Hora da água',
          body: 'Faltam 7 copos hoje',
          url: '/progress/water',
          readAt: null,
          createdAt: new Date().toISOString(),
        },
      ],
    });
    api.markRead.mockResolvedValue({ updated: 1 });
    renderPage();
    await userEvent
      .setup()
      .click(await screen.findByRole('button', { name: 'Avisos, há avisos novos' }));
    expect(screen.getByTestId('inbox-dot')).toBeInTheDocument();
    expect(await screen.findByRole('link', { name: /Hora da água/ })).toHaveAttribute(
      'href',
      '/progress/water',
    );
    await waitFor(() => expect(api.markRead).toHaveBeenCalledWith());
  });

  it('o "+" da água soma 250 mL e mostra o total do dia', async () => {
    api.today.mockResolvedValue(todaySummary());
    api.createWater.mockResolvedValue({ id: 'w1', ml: 250 });
    renderPage();
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Água +250' }));
    expect(api.createWater).toHaveBeenCalledWith({ ml: 250 });
    await waitFor(() => expect(api.toast).toHaveBeenCalledWith('+250 mL · 1.050 mL hoje'));
  });

  it('cartões na ordem da prancha, sem os que ainda não têm dado', async () => {
    api.today.mockResolvedValue(todaySummary());
    renderPage();
    expect(await screen.findByText(/próximo treino/i)).toBeInTheDocument();
    expect(screen.getByText('6 exercícios', { exact: false })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Peso: 70,2 kg, −2,5 em 30 dias' }),
    ).toBeInTheDocument();
    expect(screen.getByText('sequência · ver semana')).toBeInTheDocument();
    // Sem pedido da equipe, treino recebido ou evento: o cartão não aparece.
    expect(screen.queryByText('Para fazer')).toBeNull();
  });
});
