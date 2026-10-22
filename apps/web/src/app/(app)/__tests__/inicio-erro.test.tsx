import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
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
    progressApi: {
      ...actual.progressApi,
      today,
      refreshAchievements: vi.fn(() => new Promise(() => undefined)),
    },
  };
});

// Os cards têm testes próprios; aqui importa que o resumo chegou.
vi.mock('@/components/dashboard/nutrition-macro-card', () => ({
  NutritionMacroCard: () => <p>macros</p>,
}));
vi.mock('@/components/dashboard/next-workout-card', () => ({ NextWorkoutCard: () => null }));
vi.mock('@/components/dashboard/steps-card', () => ({ StepsCard: () => null }));
vi.mock('@/components/dashboard/streak-card', () => ({ StreakCard: () => null }));
vi.mock('@/components/dashboard/water-card', () => ({ WaterCard: () => null }));

describe('Início com falha no resumo', () => {
  it('mostra o erro e recarrega pelo "Tentar de novo"', async () => {
    today.mockRejectedValueOnce(new Error('fora do ar')).mockResolvedValueOnce({
      nutrition: {},
      workout: {},
      water: {},
      steps: {},
      streak: {},
      achievements: [],
    });
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
