import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { format } from 'date-fns';
import { FoodSearchDrawer } from '../food-search-drawer';
import {
  ApiError,
  type BarcodeLookup,
  type FoodPortion,
  type FoodShortcut,
} from '@fatia/api-client';

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
      createPortion: vi.fn(),
      mealTemplates: vi.fn(),
      logMealTemplate: vi.fn(),
      deleteMealTemplate: vi.fn(),
      createCustomFood: vi.fn(),
      customFoods: vi.fn(),
      lookupBarcode: vi.fn(),
    },
  };
});

import { nutritionApi } from '@fatia/api-client';

const searchFoods = vi.mocked(nutritionApi.searchFoods);
const createMeal = vi.mocked(nutritionApi.createMeal);
const addItem = vi.mocked(nutritionApi.addItem);
const myFoods = vi.mocked(nutritionApi.myFoods);
const setFavorite = vi.mocked(nutritionApi.setFavorite);
const createPortion = vi.mocked(nutritionApi.createPortion);
const mealTemplates = vi.mocked(nutritionApi.mealTemplates);
const logMealTemplate = vi.mocked(nutritionApi.logMealTemplate);
const deleteMealTemplate = vi.mocked(nutritionApi.deleteMealTemplate);
const createCustomFood = vi.mocked(nutritionApi.createCustomFood);
const customFoods = vi.mocked(nutritionApi.customFoods);
const lookupBarcode = vi.mocked(nutritionApi.lookupBarcode);

const colher: FoodPortion = { id: 'p1', label: 'colher de sopa', grams: 25, mine: false };
const escumadeira: FoodPortion = { id: 'p2', label: 'escumadeira', grams: 90, mine: false };

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
    mealTemplates.mockReset().mockResolvedValue([]);
    customFoods.mockReset().mockResolvedValue([]);
    lookupBarcode.mockReset();
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

  it('switches to the manual form when the user clicks "Registrar só desta vez"', async () => {
    searchFoods.mockResolvedValue([]);
    const user = userEvent.setup();
    renderDrawer();

    await user.click(screen.getByRole('button', { name: /só desta vez/i }));

    expect(screen.getByLabelText(/Nome/)).toBeInTheDocument();
    expect(screen.getByLabelText(/^kcal$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^P \(g\)$/i)).toBeInTheDocument();
  });

  it('disables submit on the manual form when the name is empty', async () => {
    const user = userEvent.setup();
    renderDrawer();

    await user.click(screen.getByRole('button', { name: /só desta vez/i }));

    const submit = screen.getByRole('button', { name: /^adicionar$/i });
    expect(submit).toBeDisabled();
  });

  it('creates a meal with foodName + macros when no mealId is passed', async () => {
    createMeal.mockResolvedValue({} as never);
    const onOpenChange = vi.fn();
    const user = userEvent.setup();
    renderDrawer({ onOpenChange, mealType: 'LUNCH' });

    await user.click(screen.getByRole('button', { name: /só desta vez/i }));

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

  // O texto do 409 é escrito para o agente (id, eatenAt); na tela ele faria a
  // pessoa achar que não salvou e registrar de novo.
  it('refeição repetida diz que já está registrada, sem o texto técnico da API', async () => {
    createMeal.mockRejectedValue(
      new ApiError('Refeição idêntica já registrada (id m9): ajuste eatenAt.', 409),
    );
    const user = userEvent.setup();
    renderDrawer({ mealType: 'LUNCH' });

    await user.click(screen.getByRole('button', { name: /só desta vez/i }));
    await user.type(screen.getByLabelText(/Nome/), 'salada');
    await user.click(screen.getByRole('button', { name: /^adicionar$/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Essa refeição já foi registrada.');
    expect(screen.queryByText(/eatenAt/)).not.toBeInTheDocument();
  });

  it('item repetido numa refeição aberta diz isso', async () => {
    addItem.mockRejectedValue(new ApiError('conflict', 409));
    const user = userEvent.setup();
    renderDrawer({ mealId: 'meal-123' });

    await user.click(screen.getByRole('button', { name: /só desta vez/i }));
    await user.type(screen.getByLabelText(/Nome/), 'pão');
    await user.click(screen.getByRole('button', { name: /^adicionar$/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Esse item já foi registrado nessa refeição.',
    );
  });

  describe('dashboard', () => {
    // O "+" registra refeição fora da Nutrição: o card de macros do dashboard
    // (`['dashboard','today']`) tem de acompanhar sem recarregar a página.
    const invalidados = () =>
      vi
        .mocked(QueryClient.prototype.invalidateQueries)
        .mock.calls.map(([filtro]) => (filtro as { queryKey?: unknown[] } | undefined)?.queryKey);

    beforeEach(() => {
      vi.spyOn(QueryClient.prototype, 'invalidateQueries');
    });

    afterEach(() => {
      vi.mocked(QueryClient.prototype.invalidateQueries).mockRestore();
    });

    it('adicionar um item atualiza o dashboard', async () => {
      createMeal.mockResolvedValue({ id: 'm1' } as never);
      const user = userEvent.setup();
      renderDrawer({ mealType: 'LUNCH' });

      await user.click(screen.getByRole('button', { name: /só desta vez/i }));
      await user.type(screen.getByLabelText(/Nome/), 'salada');
      await user.type(screen.getByLabelText(/^kcal$/i), '100');
      await user.click(screen.getByRole('button', { name: /^adicionar$/i }));

      await screen.findByText(/salada adicionado/i);
      expect(invalidados()).toContainEqual(['dashboard']);
    });

    it('registrar uma refeição salva atualiza o dashboard', async () => {
      mealTemplates.mockResolvedValue([
        { id: 't1', name: 'Café', mealType: 'BREAKFAST', items: [] },
      ] as never);
      logMealTemplate.mockResolvedValue({} as never);
      const onOpenChange = vi.fn();
      const user = userEvent.setup();
      renderDrawer({ mealType: 'BREAKFAST', onOpenChange });

      await user.click(await screen.findByRole('button', { name: /^Café/ }));

      await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
      expect(invalidados()).toContainEqual(['dashboard']);
    });
  });

  it('records a meal on a past date on that date, not today', async () => {
    createMeal.mockResolvedValue({} as never);
    const user = userEvent.setup();
    renderDrawer({ date: '2026-05-19', mealType: 'DINNER' });

    await user.click(screen.getByRole('button', { name: /só desta vez/i }));
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

    await user.click(screen.getByRole('button', { name: /só desta vez/i }));
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

  describe('medidas caseiras', () => {
    const arroz = (extra: Partial<FoodShortcut> = {}) =>
      food(7, 'Arroz, tipo 1, cozido', { portions: [colher, escumadeira], ...extra });

    it('registra em medida: escolhe a colher, sobe para 2 e manda portionId + quantity', async () => {
      searchFoods.mockResolvedValue([arroz()]);
      createMeal.mockResolvedValue({ id: 'm1' } as never);
      const user = userEvent.setup();
      renderDrawer({ mealType: 'LUNCH' });

      await user.type(screen.getByPlaceholderText(/Ex\.: arroz/), 'arroz');
      await user.click(await screen.findByRole('button', { name: /^Arroz, tipo 1, cozido/ }));
      await user.click(screen.getByRole('radio', { name: /colher de sopa/ }));

      expect(screen.getByText('= 25 g')).toBeInTheDocument();
      // De meio em meio: 1 → 1½ → 2.
      await user.click(screen.getByRole('button', { name: 'Mais' }));
      expect(screen.getByText('= 37,5 g')).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Mais' }));
      expect(screen.getByText('= 50 g')).toBeInTheDocument();
      // A prévia de macros acompanha as gramas da medida: 50 g de 130 kcal/100g.
      expect(screen.getByText(/Total: 65 kcal/)).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: /^adicionar$/i }));

      await waitFor(() =>
        expect(createMeal).toHaveBeenCalledWith(
          expect.objectContaining({
            items: [{ foodId: 7, portionId: 'p1', quantity: 2 }],
          }),
        ),
      );
    });

    it('voltar para gramas manda grams', async () => {
      searchFoods.mockResolvedValue([arroz()]);
      createMeal.mockResolvedValue({ id: 'm1' } as never);
      const user = userEvent.setup();
      renderDrawer();

      await user.type(screen.getByPlaceholderText(/Ex\.: arroz/), 'arroz');
      await user.click(await screen.findByRole('button', { name: /^Arroz, tipo 1, cozido/ }));
      await user.click(screen.getByRole('radio', { name: /escumadeira/ }));
      await user.click(screen.getByRole('radio', { name: 'gramas' }));
      await user.clear(screen.getByLabelText(/Quantidade/));
      await user.type(screen.getByLabelText(/Quantidade/), '80');
      await user.click(screen.getByRole('button', { name: /^adicionar$/i }));

      await waitFor(() =>
        expect(createMeal).toHaveBeenCalledWith(
          expect.objectContaining({ items: [{ foodId: 7, grams: 80 }] }),
        ),
      );
    });

    it('recente em medida já abre na medida e quantidade da última vez', async () => {
      myFoods.mockResolvedValue({
        favorites: [],
        recent: [
          arroz({ lastGrams: 50, lastPortionLabel: 'colher de sopa', lastPortionQuantity: 2 }),
        ],
      });
      const user = userEvent.setup();
      renderDrawer();

      expect(await screen.findByText(/2 × colher de sopa da última vez/)).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: /^Arroz, tipo 1, cozido/ }));

      expect(screen.getByRole('radio', { name: /colher de sopa/ })).toBeChecked();
      expect(screen.getByText('= 50 g')).toBeInTheDocument();
    });

    it('cria uma medida própria e já a seleciona', async () => {
      searchFoods.mockResolvedValue([arroz()]);
      createPortion.mockResolvedValue({ id: 'p9', label: 'concha', grams: 140, mine: true });
      const user = userEvent.setup();
      renderDrawer();

      await user.type(screen.getByPlaceholderText(/Ex\.: arroz/), 'arroz');
      await user.click(await screen.findByRole('button', { name: /^Arroz, tipo 1, cozido/ }));
      await user.click(screen.getByRole('button', { name: /nova medida/i }));
      await user.type(screen.getByLabelText('Nome da medida'), 'concha');
      await user.type(screen.getByLabelText('Gramas da medida'), '140');
      await user.click(screen.getByRole('button', { name: /salvar medida/i }));

      await waitFor(() =>
        expect(createPortion).toHaveBeenCalledWith(7, { label: 'concha', grams: 140 }),
      );
      expect(await screen.findByRole('radio', { name: /concha/ })).toBeChecked();
      expect(screen.getByText('= 140 g')).toBeInTheDocument();
    });

    it('alimento sem medida mostra só gramas e o atalho para criar', async () => {
      searchFoods.mockResolvedValue([food(8, 'Kefir')]);
      const user = userEvent.setup();
      renderDrawer();

      await user.type(screen.getByPlaceholderText(/Ex\.: arroz/), 'kefir');
      await user.click(await screen.findByRole('button', { name: /^Kefir/ }));

      expect(screen.getByRole('radio', { name: 'gramas' })).toBeChecked();
      expect(screen.getAllByRole('radio')).toHaveLength(1);
      expect(screen.getByRole('button', { name: /nova medida/i })).toBeInTheDocument();
    });
  });
  describe('refeições salvas', () => {
    const cafe = {
      id: 't1',
      name: 'Café de sempre',
      mealType: 'BREAKFAST' as const,
      items: [
        {
          id: 'a',
          position: 0,
          foodId: 1,
          foodName: 'Pão',
          grams: 50,
          kcal: 150,
          proteinG: 4,
          carbsG: 29,
          fatG: 1,
        },
        {
          id: 'b',
          position: 1,
          foodId: null,
          foodName: 'Café',
          grams: 200,
          kcal: 80,
          proteinG: 4,
          carbsG: 8,
          fatG: 3,
        },
      ],
    };

    it('um toque registra a refeição inteira no dia e no tipo do drawer, e fecha', async () => {
      const user = userEvent.setup();
      const onOpenChange = vi.fn();
      mealTemplates.mockResolvedValue([cafe]);
      logMealTemplate.mockResolvedValue({} as never);
      renderDrawer({ mealType: 'BREAKFAST', date: '2026-05-18', onOpenChange });

      const linha = await screen.findByRole('button', { name: /^Café de sempre/ });
      expect(linha).toHaveTextContent('2 itens · 230 kcal');
      await user.click(linha);

      await waitFor(() =>
        expect(logMealTemplate).toHaveBeenCalledWith('t1', {
          eatenAt: new Date('2026-05-18T12:00:00').toISOString(),
          mealType: 'BREAKFAST',
        }),
      );
      await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    });

    it('não aparece ao adicionar item numa refeição que já existe', async () => {
      mealTemplates.mockResolvedValue([cafe]);
      renderDrawer({ mealId: 'meal-1' });

      await screen.findByPlaceholderText(/arroz, frango/);
      expect(screen.queryByText('Café de sempre')).not.toBeInTheDocument();
      expect(mealTemplates).not.toHaveBeenCalled();
    });

    it('apagar pede confirmação na própria linha', async () => {
      const user = userEvent.setup();
      mealTemplates.mockResolvedValue([cafe]);
      deleteMealTemplate.mockResolvedValue(undefined);
      renderDrawer();

      await user.click(await screen.findByRole('button', { name: 'Apagar Café de sempre' }));
      expect(deleteMealTemplate).not.toHaveBeenCalled();
      await user.click(screen.getByRole('button', { name: 'Confirmar apagar Café de sempre' }));

      await waitFor(() => expect(deleteMealTemplate).toHaveBeenCalledWith('t1'));
    });
  });

  describe('alimento próprio', () => {
    it('busca sem resultado oferece criar com o nome digitado, e cai na quantidade', async () => {
      searchFoods.mockResolvedValue([]);
      createCustomFood.mockResolvedValue(
        food(900, 'Granola da casa', {
          source: 'CUSTOM',
          kcalPer100g: 450,
          portions: [{ id: 'px', label: 'porção', grams: 40, mine: true }],
        }),
      );
      createMeal.mockResolvedValue({ id: 'm1' } as never);
      const user = userEvent.setup();
      renderDrawer({ mealType: 'BREAKFAST' });

      await user.type(screen.getByPlaceholderText(/Ex\.: arroz/), 'Granola da casa');
      expect(
        await screen.findByText('Nenhum resultado para "Granola da casa".'),
      ).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Criar "Granola da casa"' }));

      expect(screen.getByLabelText('Nome')).toHaveValue('Granola da casa');
      await user.type(screen.getByLabelText('Tamanho da porção (g)'), '40');
      await user.type(screen.getByLabelText('Calorias (kcal)'), '180');
      await user.type(screen.getByLabelText('Proteína (g)'), '4');
      await user.type(screen.getByLabelText('Carboidrato (g)'), '24');
      await user.type(screen.getByLabelText('Gordura (g)'), '7,2');
      expect(screen.getByText(/Fica guardado como 450 kcal/)).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Salvar e escolher quantidade' }));

      await waitFor(() => expect(createCustomFood).toHaveBeenCalledTimes(1));
      expect(createCustomFood).toHaveBeenCalledWith({
        name: 'Granola da casa',
        kcalPer100g: 450,
        proteinPer100g: 10,
        carbsPer100g: 60,
        fatPer100g: 18,
        portions: [{ label: 'porção', grams: 40 }],
      });

      // O alimento novo já está escolhido, com a porção do rótulo.
      await user.click(await screen.findByRole('radio', { name: /porção · 40 g/ }));
      await user.click(screen.getByRole('button', { name: /^adicionar$/i }));
      await waitFor(() => expect(createMeal).toHaveBeenCalledTimes(1));
      expect(createMeal.mock.calls[0][0].items).toEqual([
        { foodId: 900, portionId: 'px', quantity: 1 },
      ]);
    });

    it('aponta o erro no campo e não envia', async () => {
      const user = userEvent.setup();
      renderDrawer();

      await user.click(screen.getByRole('button', { name: 'Criar meu alimento' }));
      await user.type(screen.getByLabelText('Nome'), 'Biscoito');
      await user.click(screen.getByRole('button', { name: 'Salvar e escolher quantidade' }));

      expect(screen.getByLabelText('Tamanho da porção (g)')).toHaveAccessibleDescription(
        'Informe o tamanho da porção em gramas.',
      );
      expect(screen.getByLabelText('Calorias (kcal)')).toHaveAccessibleDescription(
        'Informe as calorias.',
      );
      expect(createCustomFood).not.toHaveBeenCalled();
    });

    it('nome repetido mostra a mensagem da API e mantém o formulário', async () => {
      createCustomFood.mockRejectedValue(new Error('Você já tem um alimento chamado "Pão".'));
      const user = userEvent.setup();
      renderDrawer();

      await user.click(screen.getByRole('button', { name: 'Criar meu alimento' }));
      await user.type(screen.getByLabelText('Nome'), 'Pão');
      await user.click(screen.getByRole('radio', { name: 'Por 100 g' }));
      expect(screen.queryByLabelText('Tamanho da porção (g)')).not.toBeInTheDocument();
      await user.type(screen.getByLabelText('Calorias (kcal)'), '300');
      await user.click(screen.getByRole('button', { name: 'Salvar e escolher quantidade' }));

      expect(await screen.findByRole('alert')).toHaveTextContent(
        'Você já tem um alimento chamado "Pão".',
      );
      expect(screen.getByLabelText('Nome')).toHaveValue('Pão');
    });
  });

  describe('código de barras', () => {
    const leiteCondensado: BarcodeLookup = {
      status: 'ok',
      product: {
        barcode: '7891000100103',
        name: 'Leite Condensado',
        brand: 'Moça',
        basis: '100g',
        kcalPer100g: 325,
        proteinPer100g: 7,
        carbsPer100g: 55,
        fatPer100g: 8,
        servingSize: 20,
        servingLabel: '20 g',
      },
      attribution: {
        source: 'Open Food Facts',
        license: 'ODbL 1.0',
        url: 'https://world.openfoodfacts.org/product/7891000100103',
      },
    };

    async function lerCodigo(user: ReturnType<typeof userEvent.setup>, codigo = '7891000100103') {
      await user.click(screen.getByRole('button', { name: 'Ler código de barras' }));
      await user.type(screen.getByLabelText('Digitar o código'), codigo);
      await user.click(screen.getByRole('button', { name: 'Buscar' }));
    }

    it('lê pelo código digitado e registra a porção do rótulo como item livre', async () => {
      lookupBarcode.mockResolvedValue(leiteCondensado);
      createMeal.mockResolvedValue({ id: 'm1' } as never);
      const user = userEvent.setup();
      renderDrawer({ mealType: 'SNACK', date: '2026-05-10' });

      await lerCodigo(user);

      expect(lookupBarcode).toHaveBeenCalledWith('7891000100103');
      expect(await screen.findByText('Leite Condensado (Moça)')).toBeInTheDocument();
      expect(screen.getByRole('radio', { name: '1 porção (20 g)' })).toBeChecked();
      expect(screen.getByText('Total: 65 kcal · P 1,4 · C 11 · G 1,6')).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /Open Food Facts/ })).toHaveAttribute(
        'href',
        'https://world.openfoodfacts.org/product/7891000100103',
      );
      await user.click(screen.getByRole('button', { name: /^adicionar$/i }));

      await waitFor(() => expect(createMeal).toHaveBeenCalledTimes(1));
      expect(createMeal.mock.calls[0][0]).toMatchObject({
        mealType: 'SNACK',
        items: [
          {
            foodName: 'Leite Condensado (Moça)',
            grams: 20,
            kcal: 65,
            proteinG: 1.4,
            carbsG: 11,
            fatG: 1.6,
          },
        ],
      });
      expect(createMeal.mock.calls[0][0].items[0]).not.toHaveProperty('foodId');
      // Volta à busca, pronto para o próximo item.
      expect(await screen.findByText('Leite Condensado (Moça) adicionado')).toBeInTheDocument();
      expect(screen.getByPlaceholderText(/Ex\.: arroz/)).toBeInTheDocument();
    });

    it('aberto pelo atalho de escanear, começa no leitor e volta a ele depois de adicionar', async () => {
      lookupBarcode.mockResolvedValue(leiteCondensado);
      createMeal.mockResolvedValue({ id: 'm1' } as never);
      const user = userEvent.setup();
      renderDrawer({ mealType: 'SNACK', initialMode: 'scan' });

      await user.type(await screen.findByLabelText('Digitar o código'), '7891000100103');
      await user.click(screen.getByRole('button', { name: 'Buscar' }));
      await user.click(await screen.findByRole('button', { name: /^adicionar$/i }));

      expect(await screen.findByText('Leite Condensado (Moça) adicionado')).toBeInTheDocument();
      // A próxima embalagem: o leitor de novo, não a busca por nome.
      expect(await screen.findByLabelText('Digitar o código')).toBeInTheDocument();
      expect(screen.queryByPlaceholderText(/Ex\.: arroz/)).not.toBeInTheDocument();
    });

    it('guardar em Meus alimentos cria o alimento e registra ligado a ele', async () => {
      lookupBarcode.mockResolvedValue(leiteCondensado);
      createCustomFood.mockResolvedValue(
        food(901, 'Leite Condensado (Moça)', {
          source: 'CUSTOM',
          portions: [{ id: 'pp', label: 'porção', grams: 20, mine: true }],
        }),
      );
      addItem.mockResolvedValue({} as never);
      const user = userEvent.setup();
      renderDrawer({ mealId: 'meal-1' });

      await lerCodigo(user);
      await user.click(await screen.findByLabelText('Guardar em Meus alimentos'));
      await user.click(screen.getByRole('button', { name: /^adicionar$/i }));

      await waitFor(() => expect(addItem).toHaveBeenCalledTimes(1));
      expect(createCustomFood).toHaveBeenCalledWith({
        name: 'Leite Condensado (Moça)',
        kcalPer100g: 325,
        proteinPer100g: 7,
        carbsPer100g: 55,
        fatPer100g: 8,
        portions: [{ label: 'porção', grams: 20 }],
      });
      expect(addItem).toHaveBeenCalledWith('meal-1', {
        foodId: 901,
        portionId: 'pp',
        quantity: 1,
      });
    });

    it('produto já guardado entra ligado ao alimento existente, sem criar outro', async () => {
      lookupBarcode.mockResolvedValue(leiteCondensado);
      customFoods.mockResolvedValue([
        food(55, 'Leite condensado (moça)', { source: 'CUSTOM', portions: [] }),
      ]);
      addItem.mockResolvedValue({} as never);
      const user = userEvent.setup();
      renderDrawer({ mealId: 'meal-1' });

      await lerCodigo(user);
      expect(
        await screen.findByText('Já está em Meus alimentos: o item entra ligado a ele.'),
      ).toBeInTheDocument();
      await user.click(screen.getByRole('radio', { name: '100 g' }));
      await user.click(screen.getByRole('button', { name: /^adicionar$/i }));

      await waitFor(() =>
        expect(addItem).toHaveBeenCalledWith('meal-1', { foodId: 55, grams: 100 }),
      );
      expect(createCustomFood).not.toHaveBeenCalled();
    });

    it('ficha incompleta abre o formulário sem zero no que faltou', async () => {
      lookupBarcode.mockResolvedValue({
        status: 'incomplete',
        missing: ['proteinPer100g', 'fatPer100g'],
        partial: {
          barcode: '7891910000197',
          basis: '100g',
          name: 'Açúcar Refinado',
          brand: 'União',
          kcalPer100g: 400,
          carbsPer100g: 100,
          servingSize: 5,
          servingLabel: '5 g',
        },
        attribution: leiteCondensado.attribution,
      });
      createMeal.mockResolvedValue({ id: 'm1' } as never);
      const user = userEvent.setup();
      renderDrawer();

      await lerCodigo(user, '7891910000197');

      expect(await screen.findByText(/está sem proteína e gordura/)).toBeInTheDocument();
      expect(screen.getByLabelText('Proteína (g)')).toHaveValue('');
      expect(screen.getByRole('button', { name: /^adicionar$/i })).toBeDisabled();
      await user.type(screen.getByLabelText('Proteína (g)'), '0');
      await user.type(screen.getByLabelText('Gordura (g)'), '0');
      await user.click(screen.getByRole('button', { name: /^adicionar$/i }));

      await waitFor(() => expect(createMeal).toHaveBeenCalledTimes(1));
      expect(createMeal.mock.calls[0][0].items[0]).toMatchObject({
        foodName: 'Açúcar Refinado (União)',
        grams: 5,
        kcal: 20,
        carbsG: 5,
      });
    });

    it('código desconhecido oferece cadastrar à mão', async () => {
      lookupBarcode.mockRejectedValue(new ApiError('Barcode not found', 404));
      const user = userEvent.setup();
      renderDrawer();

      await lerCodigo(user);

      expect(await screen.findByRole('alert')).toHaveTextContent(
        'Esse código não está no Open Food Facts.',
      );
      await user.click(screen.getByRole('button', { name: 'Cadastrar à mão' }));
      expect(screen.getByLabelText('Tamanho da porção (g)')).toBeInTheDocument();
    });

    it('código digitado errado não consulta', async () => {
      const user = userEvent.setup();
      renderDrawer();

      await lerCodigo(user, '123');

      expect(screen.getByLabelText('Digitar o código')).toHaveAccessibleDescription(
        'O código tem de 8 a 14 números.',
      );
      expect(lookupBarcode).not.toHaveBeenCalled();
    });
  });
});
