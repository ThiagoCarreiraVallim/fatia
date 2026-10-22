import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { mealTypeForTime, type DaySummary } from '@fatia/api-client';
import NutritionPage from '../page';

// As ações do topo vão por portal para a barra; aqui ficam no lugar.
vi.mock('@/components/layout/app-top-bar', () => ({
  TopBarActions: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  topBarActionClass: '',
}));

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams('date=2026-05-19'),
  useRouter: () => ({ push: vi.fn() }),
}));

// Os cards têm teste próprio; aqui só importa o que a tela decide.
vi.mock('@/components/nutrition/meal-timeline', () => ({ MealTimeline: () => null }));
vi.mock('@/components/nutrition/weekly-trend-chart', () => ({ WeeklyTrendChart: () => null }));
vi.mock('@/components/nutrition/nutrient-targets-card', () => ({
  NutrientTargetsCard: () => null,
}));
vi.mock('@/components/nutrition/custom-foods-card', () => ({ CustomFoodsCard: () => null }));
vi.mock('@/components/nutrition/copy-day-drawer', () => ({ CopyDayDrawer: () => null }));
vi.mock('@/components/nutrition/food-search-drawer', () => ({
  FoodSearchDrawer: (props: { open: boolean; initialMode?: string; mealType?: string }) =>
    props.open ? (
      <div role="dialog">{`busca ${props.initialMode ?? 'search'} ${props.mealType ?? ''}`}</div>
    ) : null,
}));

vi.mock('@fatia/api-client', async () => {
  const actual = await vi.importActual<typeof import('@fatia/api-client')>('@fatia/api-client');
  return { ...actual, nutritionApi: { summary: vi.fn(), goals: vi.fn() } };
});

import { nutritionApi } from '@fatia/api-client';

const summary = vi.mocked(nutritionApi.summary);
const goals = vi.mocked(nutritionApi.goals);

const emptyDay = {
  date: '2026-05-19',
  totals: { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 },
  meals: [],
} as unknown as DaySummary;

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <NutritionPage />
    </QueryClientProvider>,
  );
}

describe('NutritionPage', () => {
  beforeEach(() => {
    summary.mockReset().mockResolvedValue(emptyDay);
    goals.mockReset().mockResolvedValue(null as never);
  });

  it('o atalho do topo abre a busca já no leitor, no tipo de refeição da hora', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole('button', { name: 'Escanear código de barras' }));

    expect(screen.getByRole('dialog')).toHaveTextContent(
      `busca scan ${mealTypeForTime(new Date())}`,
    );
  });

  it('falha ao carregar o dia mostra o motivo e tenta de novo', async () => {
    summary.mockRejectedValueOnce(new Error('Sem conexão.'));
    const user = userEvent.setup();
    renderPage();

    expect(await screen.findByRole('alert')).toHaveTextContent('Sem conexão.');
    await user.click(screen.getByRole('button', { name: 'Tentar de novo' }));

    await waitFor(() => expect(summary).toHaveBeenCalledTimes(2));
    expect(await screen.findByText('kcal consumidas')).toBeInTheDocument();
  });
});
