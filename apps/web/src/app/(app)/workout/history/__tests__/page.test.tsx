import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import type { WorkoutHistory, WorkoutHistoryItem } from '@fatia/api-client';
import WorkoutHistoryPage from '../page';

/** Histórico (Al-T10, #381): totais, filtro por tipo e as sessões. */

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/workout/history',
}));
vi.mock('next/link', () => ({
  default: ({ children, href, ...rest }: { children: ReactNode; href: string }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock('@fatia/api-client', async () => {
  const actual = await vi.importActual<typeof import('@fatia/api-client')>('@fatia/api-client');
  return {
    ...actual,
    workoutApi: { getHistory: vi.fn() },
    usersApi: { me: vi.fn().mockResolvedValue({}) },
  };
});

import { workoutApi } from '@fatia/api-client';

const getHistory = vi.mocked(workoutApi.getHistory);

const item = (over: Partial<WorkoutHistoryItem>): WorkoutHistoryItem => ({
  id: 's1',
  startedAt: '2026-11-03T12:00:00.000Z',
  completedAt: '2026-11-03T13:00:00.000Z',
  kind: 'plan',
  title: 'Treino A',
  feeling: 4,
  notes: null,
  durationMinutes: 58,
  strengthExercises: 6,
  strengthSets: 19,
  volumeKg: 6200,
  cardioExercises: 0,
  cardio: null,
  ...over,
});

const page = (items: WorkoutHistoryItem[], nextCursor: string | null = null): WorkoutHistory => ({
  totals: { sessions: 12, avgDurationMinutes: 52, volumeKg: 62000 },
  items,
  nextCursor,
});

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <WorkoutHistoryPage />
    </QueryClientProvider>,
  );
}

describe('Histórico de treinos', () => {
  beforeEach(() => vi.clearAllMocks());

  it('mostra os totais e cada sessão com tipo, resumo e link para o detalhe', async () => {
    getHistory.mockResolvedValue(
      page([
        item({}),
        item({
          id: 's2',
          kind: 'free',
          title: null,
          strengthExercises: 0,
          strengthSets: 0,
          volumeKg: 0,
          cardioExercises: 1,
          cardio: {
            exerciseName: 'Esteira',
            distanceMeters: 5100,
            durationSeconds: 1800,
            avgHeartRate: 146,
          },
        }),
      ]),
    );
    renderPage();
    const list = await screen.findByRole('list', { name: 'Sessões' });
    expect(screen.getByText('12')).toBeInTheDocument();
    expect(screen.getByText('52′')).toBeInTheDocument();
    expect(screen.getByText('62 t')).toBeInTheDocument();

    const rows = within(list).getAllByRole('link');
    expect(rows[0]).toHaveAttribute('href', '/workout/history/s1');
    expect(rows[0]).toHaveTextContent('Treino A');
    expect(rows[0]).toHaveTextContent('plano');
    expect(rows[0]).toHaveTextContent('6 exercícios · 19 séries · 6,2 t');
    expect(rows[0]).toHaveTextContent('58 min');
    expect(rows[1]).toHaveAttribute('href', '/workout/history/s2');
    expect(rows[1]).toHaveTextContent('Treino livre');
    expect(rows[1]).toHaveTextContent('livre');
    expect(rows[1]).toHaveTextContent('Esteira · 5,1 km · 146 bpm');
  });

  it('o filtro pede só o tipo escolhido; Circuitos fica de fora até a #380', async () => {
    getHistory.mockResolvedValue(page([item({})]));
    const user = userEvent.setup();
    renderPage();
    await screen.findByRole('list', { name: 'Sessões' });
    expect(getHistory).toHaveBeenLastCalledWith({ kind: undefined, cursor: undefined });
    expect(screen.queryByRole('radio', { name: 'Circuitos' })).toBeNull();

    getHistory.mockResolvedValue(page([]));
    await user.click(screen.getByRole('radio', { name: 'Livres' }));
    await waitFor(() =>
      expect(getHistory).toHaveBeenLastCalledWith({ kind: 'free', cursor: undefined }),
    );
    expect(await screen.findByText('Nenhum treino deste tipo')).toBeInTheDocument();
  });

  it('"Ver mais" segue o cursor', async () => {
    getHistory
      .mockResolvedValueOnce(page([item({})], 's1'))
      .mockResolvedValueOnce(page([item({ id: 's0', title: 'Treino B' })]));
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole('button', { name: 'Ver mais' }));
    expect(await screen.findByText('Treino B')).toBeInTheDocument();
    expect(getHistory).toHaveBeenLastCalledWith({ kind: undefined, cursor: 's1' });
    expect(screen.queryByRole('button', { name: 'Ver mais' })).toBeNull();
  });

  it('sem nenhum treino, explica onde eles vão aparecer', async () => {
    getHistory.mockResolvedValue({
      ...page([]),
      totals: { sessions: 0, avgDurationMinutes: null, volumeKg: 0 },
    });
    renderPage();
    expect(await screen.findByText('Nenhum treino registrado ainda')).toBeInTheDocument();
  });

  it('falhou: dá para tentar de novo', async () => {
    getHistory.mockRejectedValueOnce(new Error('caiu')).mockResolvedValue(page([item({})]));
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole('button', { name: 'Tentar de novo' }));
    expect(await screen.findByRole('list', { name: 'Sessões' })).toBeInTheDocument();
  });
});
