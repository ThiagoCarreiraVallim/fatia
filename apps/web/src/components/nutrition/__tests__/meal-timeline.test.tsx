import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Meal } from '@fatia/api-client';
import { MealTimeline } from '../meal-timeline';

vi.mock('../food-search-drawer', () => ({ FoodSearchDrawer: () => null }));
vi.mock('../edit-meal-item-drawer', () => ({ EditMealItemDrawer: () => null }));

vi.mock('@fatia/api-client', async () => {
  const actual = await vi.importActual<typeof import('@fatia/api-client')>('@fatia/api-client');
  return {
    ...actual,
    nutritionApi: { deleteMeal: vi.fn(), deleteItem: vi.fn() },
  };
});

import { nutritionApi } from '@fatia/api-client';

const jantar: Meal = {
  id: 'meal-1',
  userId: 'u',
  mealType: 'DINNER',
  eatenAt: '2026-05-19T22:00:00.000Z',
  notes: null,
  items: [
    {
      id: 'item-1',
      foodName: 'Arroz',
      grams: 100,
      kcal: 128,
      proteinG: 2.5,
      carbsG: 28,
      fatG: 0.2,
    } as Meal['items'][number],
  ],
};

function renderTimeline(date = '2026-05-19') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MealTimeline meals={[jantar]} date={date} today="2026-05-19" onAddMeal={() => undefined} />
    </QueryClientProvider>,
  );
}

describe('MealTimeline', () => {
  it('asks before removing a meal and only deletes on confirm', async () => {
    vi.mocked(nutritionApi.deleteMeal).mockResolvedValue(undefined as never);
    const user = userEvent.setup();
    renderTimeline();

    await user.click(screen.getByRole('button', { name: 'Remover refeição' }));
    expect(nutritionApi.deleteMeal).not.toHaveBeenCalled();

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/Jantar e seus 1 item/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Remover' }));

    await waitFor(() => expect(nutritionApi.deleteMeal).toHaveBeenCalledWith('meal-1'));
  });

  it('asks before removing an item, and cancel keeps it', async () => {
    const user = userEvent.setup();
    renderTimeline();

    await user.click(screen.getByRole('button', { name: 'Remover Arroz' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Cancelar' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(nutritionApi.deleteItem).not.toHaveBeenCalled();
  });

  it('keeps empty meal slots before a logged dinner', () => {
    renderTimeline();

    const labels = screen
      .getAllByRole('button', { name: /^Registrar|Remover refeição/ })
      .map((b) => b.getAttribute('aria-label'));
    expect(labels).toEqual([
      'Registrar Café da manhã',
      'Registrar Almoço',
      'Registrar Lanche',
      'Remover refeição',
    ]);
  });

  it('titles the timeline by the date being viewed', () => {
    renderTimeline('2026-05-18');
    expect(screen.getByRole('heading', { name: 'Refeições de ontem' })).toBeInTheDocument();
  });
});
