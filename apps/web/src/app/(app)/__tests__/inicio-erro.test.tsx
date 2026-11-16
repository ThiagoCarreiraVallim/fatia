import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { todaySummary } from '@/components/today/__tests__/fixture';
import HomePage from '../page';

/**
 * O resumo do dia que falha diz que falhou e oferece tentar de novo, como no
 * app. Antes o Início ficava só com a saudação, igual a um carregamento eterno.
 */

const today = vi.hoisted(() => vi.fn());

vi.mock('@fatia/api-client', async () => {
  const actual = await vi.importActual<typeof import('@fatia/api-client')>('@fatia/api-client');
  return {
    ...actual,
    usersApi: { me: vi.fn(async () => ({ name: 'Ana' })) },
    goalsApi: { list: vi.fn(async () => []) },
    progressApi: {
      ...actual.progressApi,
      today,
      refreshAchievements: vi.fn(() => new Promise(() => undefined)),
    },
  };
});

// Os cards têm testes próprios; aqui importa que o resumo chegou.
vi.mock('@/components/today/today-cards', () => ({
  ReceivedPlanBanner: () => null,
  TodoCard: () => null,
  EventCard: () => null,
  KcalCard: () => <p>macros</p>,
  NextWorkoutCard: () => null,
  WaterTile: () => null,
  StepsTile: () => null,
  WeightTile: () => null,
  StreakTile: () => null,
  PersonalGoalsCard: () => null,
}));
vi.mock('@/components/today/goals-sheet', () => ({ GoalsSheet: () => null }));
vi.mock('@/components/today/water-sheet', () => ({ WaterSheet: () => null }));
vi.mock('@/components/today/weight-sheet', () => ({ WeightSheet: () => null }));
vi.mock('@/components/today/inbox-sheet', () => ({ InboxSheet: () => null }));
vi.mock('@/components/progress/body-log-sheet', () => ({ BodyLogSheet: () => null }));
vi.mock('@/components/sharing/share-sheet', () => ({ ShareSheet: () => null }));

describe('Início com falha no resumo', () => {
  it('mostra o erro e recarrega pelo "Tentar de novo"', async () => {
    today.mockRejectedValueOnce(new Error('fora do ar')).mockResolvedValueOnce(todaySummary());
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <HomePage />
      </QueryClientProvider>,
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Não deu para carregar o resumo de hoje.',
    );
    await userEvent.setup().click(screen.getByRole('button', { name: 'Tentar de novo' }));
    expect(await screen.findByText('macros')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
