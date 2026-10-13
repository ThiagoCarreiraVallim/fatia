import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { format } from 'date-fns';
import { FoodSearchDrawer } from '../food-search-drawer';
import type { FoodShortcut } from '@fatia/api-client';

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

vi.mock('@fatia/api-client', async () => {
  const actual = await vi.importActual<typeof import('@fatia/api-client')>('@fatia/api-client');
  return {
    ...actual,
    nutritionApi: {
      searchFoods: vi.fn(),
      createMeal: vi.fn(),
      addItem: vi.fn(),
      myFoods: vi.fn(),
      setFavorite: vi.fn(),
      nutrientTargets: vi.fn(),
    },
  };
});

import { nutritionApi } from '@fatia/api-client';

const searchFoods = vi.mocked(nutritionApi.searchFoods);
const createMeal = vi.mocked(nutritionApi.createMeal);
const addItem = vi.mocked(nutritionApi.addItem);
const myFoods = vi.mocked(nutritionApi.myFoods);
const setFavorite = vi.mocked(nutritionApi.setFavorite);

const food = (id: number, name: string, extra: Partial<FoodShortcut> = {}): FoodShortcut => ({
  id,
  name,
  source: 'TACO',
  groupId: null,
  kcalPer100g: 130,
  proteinPer100g: 2,
  carbsPer100g: 28,
  fatPer100g: 0,
  createdByUserId: null,
  lastGrams: null,
  timesEaten: 0,
  favorite: false,
  ...extra,
});

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
    myFoods.mockReset().mockResolvedValue({ favorites: [], recent: [] });
    setFavorite.mockReset().mockResolvedValue(undefined);
    vi.mocked(nutritionApi.nutrientTargets).mockResolvedValue([]);
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
    // Continua aberto para o próximo item; fechar é com "Concluir".
    expect(await screen.findByText(/salada caseira adicionado/i)).toBeInTheDocument();
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it('records a meal on a past date on that date, not today', async () => {
    createMeal.mockResolvedValue({} as never);
    const user = userEvent.setup();
    renderDrawer({ date: '2026-05-19', mealType: 'DINNER' });

    await user.click(screen.getByRole('button', { name: /inserir manualmente/i }));
    await user.type(screen.getByLabelText(/Nome/), 'sopa');
    await user.click(screen.getByRole('button', { name: /^adicionar$/i }));

    await waitFor(() => expect(createMeal).toHaveBeenCalledTimes(1));
    const eatenAt = new Date(createMeal.mock.calls[0][0].eatenAt!);
    expect(format(eatenAt, 'yyyy-MM-dd')).toBe('2026-05-19');
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

  describe('atalhos: favoritos e recentes', () => {
    it('mostra favoritos e recentes antes de digitar, da refeição sendo registrada', async () => {
      myFoods.mockResolvedValue({
        favorites: [food(1, 'Pão francês', { favorite: true, lastGrams: 50 })],
        recent: [food(2, 'Café com leite', { lastGrams: 200, timesEaten: 4 })],
      });
      renderDrawer({ mealType: 'BREAKFAST' });

      expect(await screen.findByText('Favoritos')).toBeInTheDocument();
      expect(screen.getByText('Recentes')).toBeInTheDocument();
      expect(screen.getByText('Pão francês')).toBeInTheDocument();
      expect(screen.getByText('Café com leite')).toBeInTheDocument();
      expect(myFoods).toHaveBeenCalledWith('BREAKFAST');
      expect(searchFoods).not.toHaveBeenCalled();
    });

    it('escolher um recente já preenche a gramagem da última vez', async () => {
      myFoods.mockResolvedValue({
        favorites: [],
        recent: [food(2, 'Café com leite', { lastGrams: 200 })],
      });
      const user = userEvent.setup();
      renderDrawer();

      await user.click(await screen.findByRole('button', { name: /^Café com leite/ }));

      expect(screen.getByLabelText(/Quantidade/)).toHaveValue(200);
    });

    it('favorita um resultado da busca', async () => {
      searchFoods.mockResolvedValue([food(7, 'Arroz, tipo 1, cozido')]);
      const user = userEvent.setup();
      renderDrawer();

      await user.type(screen.getByPlaceholderText(/Ex\.: arroz/), 'arroz');
      await user.click(
        await screen.findByRole('button', { name: 'Favoritar Arroz, tipo 1, cozido' }),
      );

      await waitFor(() => expect(setFavorite).toHaveBeenCalledWith(7, true));
    });

    it('um favorito na busca aparece marcado e desfavorita', async () => {
      myFoods.mockResolvedValue({
        favorites: [food(7, 'Arroz, tipo 1, cozido', { favorite: true })],
        recent: [],
      });
      searchFoods.mockResolvedValue([food(7, 'Arroz, tipo 1, cozido')]);
      const user = userEvent.setup();
      renderDrawer();

      await screen.findByText('Favoritos');
      await user.type(screen.getByPlaceholderText(/Ex\.: arroz/), 'arroz');
      await user.click(
        await screen.findByRole('button', { name: 'Desfavoritar Arroz, tipo 1, cozido' }),
      );

      await waitFor(() => expect(setFavorite).toHaveBeenCalledWith(7, false));
    });
  });

  describe('vários itens sem fechar', () => {
    it('o segundo item entra na refeição criada pelo primeiro', async () => {
      myFoods.mockResolvedValue({
        favorites: [],
        recent: [food(1, 'Arroz', { lastGrams: 120 }), food(2, 'Feijão', { lastGrams: 80 })],
      });
      createMeal.mockResolvedValue({ id: 'meal-novo' } as never);
      addItem.mockResolvedValue({} as never);
      const onOpenChange = vi.fn();
      const user = userEvent.setup();
      renderDrawer({ mealType: 'LUNCH', onOpenChange });

      await user.click(await screen.findByRole('button', { name: /^Arroz/ }));
      await user.click(screen.getByRole('button', { name: /^adicionar$/i }));
      expect(await screen.findByText(/Arroz adicionado/i)).toBeInTheDocument();

      await user.click(await screen.findByRole('button', { name: /^Feijão/ }));
      await user.click(screen.getByRole('button', { name: /^adicionar$/i }));

      await waitFor(() =>
        expect(addItem).toHaveBeenCalledWith('meal-novo', { foodId: 2, grams: 80 }),
      );
      expect(createMeal).toHaveBeenCalledTimes(1);
      expect(createMeal.mock.calls[0][0].items).toEqual([{ foodId: 1, grams: 120 }]);
      expect(onOpenChange).not.toHaveBeenCalled();

      await user.click(screen.getByRole('button', { name: /concluir/i }));
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });
});
