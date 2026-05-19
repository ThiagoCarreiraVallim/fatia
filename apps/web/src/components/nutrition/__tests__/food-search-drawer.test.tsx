import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { FoodSearchDrawer } from '../food-search-drawer';

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
  };
});

vi.mock('@/lib/api/nutrition', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api/nutrition')>('@/lib/api/nutrition');
  return {
    ...actual,
    nutritionApi: {
      searchFoods: vi.fn(),
      createMeal: vi.fn(),
      addItem: vi.fn(),
    },
  };
});

import { nutritionApi } from '@/lib/api/nutrition';

const searchFoods = vi.mocked(nutritionApi.searchFoods);
const createMeal = vi.mocked(nutritionApi.createMeal);
const addItem = vi.mocked(nutritionApi.addItem);

function renderDrawer(props: Partial<Parameters<typeof FoodSearchDrawer>[0]> = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <FoodSearchDrawer open onOpenChange={() => undefined} date="2026-05-19" {...props} />
    </QueryClientProvider>,
  );
}

describe('FoodSearchDrawer', () => {
  beforeEach(() => {
    searchFoods.mockReset();
    createMeal.mockReset();
    addItem.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('renders an error with retry when the search fails', async () => {
    searchFoods.mockRejectedValue(new Error('boom'));
    const user = userEvent.setup();
    renderDrawer();

    await user.type(screen.getByPlaceholderText(/Ex\.: arroz/), 'arroz');

    expect(await screen.findByText(/Erro ao buscar alimentos/)).toBeInTheDocument();
    const retry = screen.getByRole('button', { name: /tentar novamente/i });

    searchFoods.mockResolvedValueOnce([]);
    await user.click(retry);

    await waitFor(() => expect(searchFoods).toHaveBeenCalledTimes(2));
  });

  it('switches to the manual form when the user clicks "Inserir manualmente"', async () => {
    searchFoods.mockResolvedValue([]);
    const user = userEvent.setup();
    renderDrawer();

    await user.click(screen.getByRole('button', { name: /inserir manualmente/i }));

    expect(screen.getByLabelText(/Nome/)).toBeInTheDocument();
    expect(screen.getByLabelText(/^kcal$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^P \(g\)$/i)).toBeInTheDocument();
  });

  it('disables submit on the manual form when the name is empty', async () => {
    const user = userEvent.setup();
    renderDrawer();

    await user.click(screen.getByRole('button', { name: /inserir manualmente/i }));

    const submit = screen.getByRole('button', { name: /^adicionar$/i });
    expect(submit).toBeDisabled();
  });

  it('creates a meal with foodName + macros when no mealId is passed', async () => {
    createMeal.mockResolvedValue({} as never);
    const onOpenChange = vi.fn();
    const user = userEvent.setup();
    renderDrawer({ onOpenChange, mealType: 'LUNCH' });

    await user.click(screen.getByRole('button', { name: /inserir manualmente/i }));

    await user.type(screen.getByLabelText(/Nome/), 'salada caseira');
    await user.clear(screen.getByLabelText(/Gramas/));
    await user.type(screen.getByLabelText(/Gramas/), '150');
    await user.type(screen.getByLabelText(/^kcal$/i), '210');
    await user.type(screen.getByLabelText(/^P \(g\)$/i), '8');

    await user.click(screen.getByRole('button', { name: /^adicionar$/i }));

    await waitFor(() => expect(createMeal).toHaveBeenCalledTimes(1));
    const payload = createMeal.mock.calls[0][0];
    expect(payload.mealType).toBe('LUNCH');
    expect(payload.items).toEqual([
      {
        foodName: 'salada caseira',
        grams: 150,
        kcal: 210,
        proteinG: 8,
        carbsG: undefined,
        fatG: undefined,
      },
    ]);
    expect(addItem).not.toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('adds a manual item to an existing meal when mealId is passed', async () => {
    addItem.mockResolvedValue({} as never);
    const user = userEvent.setup();
    renderDrawer({ mealId: 'meal-123' });

    await user.click(screen.getByRole('button', { name: /inserir manualmente/i }));
    await user.type(screen.getByLabelText(/Nome/), 'pão integral');
    await user.clear(screen.getByLabelText(/Gramas/));
    await user.type(screen.getByLabelText(/Gramas/), '60');

    await user.click(screen.getByRole('button', { name: /^adicionar$/i }));

    await waitFor(() => expect(addItem).toHaveBeenCalledTimes(1));
    expect(addItem).toHaveBeenCalledWith('meal-123', {
      foodName: 'pão integral',
      grams: 60,
      kcal: undefined,
      proteinG: undefined,
      carbsG: undefined,
      fatG: undefined,
    });
    expect(createMeal).not.toHaveBeenCalled();
  });
});
