import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Meal } from '@fatia/api-client';
import { MealTimeline } from '../meal-timeline';

vi.mock('../food-search-drawer', () => ({ FoodSearchDrawer: () => null }));
vi.mock('../edit-meal-item-drawer', () => ({ EditMealItemDrawer: () => null }));
vi.mock('../meal-actions-drawer', () => ({
  MealActionsDrawer: ({ meal }: { meal: Meal | null }) =>
    meal ? <div role="dialog">{`Ações de ${meal.id}`}</div> : null,
}));

const sonner = vi.hoisted(() => ({ toast: Object.assign(vi.fn(), { error: vi.fn() }) }));
vi.mock('sonner', () => sonner);

vi.mock('@fatia/api-client', async () => {
  const actual = await vi.importActual<typeof import('@fatia/api-client')>('@fatia/api-client');
  return {
    ...actual,
    nutritionApi: { deleteMeal: vi.fn(), deleteItem: vi.fn(), addItem: vi.fn() },
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
      mealId: 'meal-1',
      foodId: 7,
      foodName: 'Arroz',
      grams: 100,
      kcal: 128,
      proteinG: 2.5,
      carbsG: 28,
      fatG: 0.2,
    } as Meal['items'][number],
  ],
};

let client: QueryClient;

function renderTimeline(date = '2026-05-19', meals: Meal[] = [jantar]) {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MealTimeline meals={meals} date={date} today="2026-05-19" onAddMeal={() => undefined} />
    </QueryClientProvider>,
  );
}

describe('MealTimeline', () => {
  it('item em medida caseira aparece como foi dito, com as gramas', () => {
    const emMedida: Meal = {
      ...jantar,
      items: [
        { ...jantar.items[0], grams: 50, portionLabel: 'colher de sopa', portionQuantity: 2 },
      ],
    };
    renderTimeline('2026-05-19', [emMedida]);

    expect(screen.getByText(/2 × colher de sopa \(50 g\) · 128 kcal/)).toBeInTheDocument();
  });

  it('"Mais ações" abre as ações daquela refeição (copiar, salvar)', async () => {
    const user = userEvent.setup();
    renderTimeline();

    await user.click(screen.getByRole('button', { name: 'Mais ações de Jantar' }));

    expect(screen.getByRole('dialog')).toHaveTextContent('Ações de meal-1');
  });

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

  // Item é registro pequeno: apaga na hora e o aviso oferece "Desfazer", que
  // devolve o item à mesma refeição. Só a refeição inteira pede confirmação.
  it('removes an item right away and "Desfazer" puts it back in the same meal', async () => {
    vi.mocked(nutritionApi.deleteItem).mockResolvedValue(undefined);
    vi.mocked(nutritionApi.addItem).mockResolvedValue(jantar.items[0]);
    const user = userEvent.setup();
    renderTimeline();

    await user.click(screen.getByRole('button', { name: 'Remover Arroz' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await waitFor(() => expect(nutritionApi.deleteItem).toHaveBeenCalledWith('item-1'));
    await waitFor(() => expect(sonner.toast).toHaveBeenCalledTimes(1));

    const [message, options] = sonner.toast.mock.calls[0] as [
      string,
      { action: { label: string; onClick: () => void } },
    ];
    expect(message).toBe('Item apagado: Arroz');
    options.action.onClick();
    await waitFor(() =>
      expect(nutritionApi.addItem).toHaveBeenCalledWith('meal-1', {
        foodId: 7,
        foodName: 'Arroz',
        grams: 100,
      }),
    );
  });

  it('apagar item atualiza também o gráfico da semana e as metas de nutrientes', async () => {
    vi.mocked(nutritionApi.deleteItem).mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderTimeline();
    const invalidate = vi.spyOn(client, 'invalidateQueries');

    await user.click(screen.getByRole('button', { name: 'Remover Arroz' }));

    await waitFor(() =>
      expect(invalidate.mock.calls.map(([f]) => f?.queryKey)).toEqual(
        expect.arrayContaining([
          ['nutrition', 'nutrient-summary', '2026-05-19'],
          ['nutrition', 'history'],
        ]),
      ),
    );
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
