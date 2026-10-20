import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Meal } from '@fatia/api-client';

vi.mock('@fatia/api-client', async () => {
  const actual = await vi.importActual<typeof import('@fatia/api-client')>('@fatia/api-client');
  return {
    ...actual,
    nutritionApi: { ...actual.nutritionApi, deleteItem: vi.fn(), deleteMeal: vi.fn() },
  };
});
vi.mock('../food-search-drawer', () => ({ FoodSearchDrawer: () => null }));
vi.mock('../edit-meal-item-drawer', () => ({ EditMealItemDrawer: () => null }));

import { nutritionApi } from '@fatia/api-client';
import { MealList } from '../meal-list';

const MEAL = {
  id: 'meal-1',
  mealType: 'LUNCH',
  eatenAt: '2026-05-19T15:00:00Z',
  notes: null,
  items: [
    {
      id: 'item-1',
      mealId: 'meal-1',
      foodId: 7,
      foodName: 'Arroz',
      groupId: null,
      grams: 100,
      portionLabel: null,
      portionQuantity: null,
      kcal: 128,
      proteinG: 2.5,
      carbsG: 28,
      fatG: 0.2,
    },
  ],
} as unknown as Meal;

/** Apagar item ou refeição mexe no dia, na semana e no dashboard — não só no resumo. */
describe('MealList', () => {
  beforeEach(() => {
    vi.mocked(nutritionApi.deleteItem).mockReset().mockResolvedValue(undefined);
    vi.mocked(nutritionApi.deleteMeal).mockReset().mockResolvedValue(undefined);
  });

  it.each([['Remover item'], ['Remover refeição']])(
    '%s invalida as chaves do dia',
    async (rotulo) => {
      const client = new QueryClient();
      const invalidate = vi.spyOn(client, 'invalidateQueries');
      render(
        <QueryClientProvider client={client}>
          <MealList meals={[MEAL]} date="2026-05-19" />
        </QueryClientProvider>,
      );

      await userEvent.click(screen.getByRole('button', { name: rotulo }));

      await waitFor(() =>
        expect(invalidate.mock.calls.map(([f]) => (f as { queryKey: unknown }).queryKey)).toEqual(
          expect.arrayContaining([
            ['nutrition', 'summary', '2026-05-19'],
            ['nutrition', 'nutrient-summary', '2026-05-19'],
            ['nutrition', 'history'],
            ['dashboard'],
          ]),
        ),
      );
    },
  );
});
