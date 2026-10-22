import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import type { MealItem } from '@fatia/api-client';
import { EditMealItemDrawer } from '../edit-meal-item-drawer';

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
    nutritionApi: { updateItem: vi.fn(), portions: vi.fn(), createPortion: vi.fn() },
  };
});

import { nutritionApi } from '@fatia/api-client';

const updateItem = vi.mocked(nutritionApi.updateItem);
const portions = vi.mocked(nutritionApi.portions);

const item = (extra: Partial<MealItem> = {}): MealItem => ({
  id: 'item-1',
  mealId: 'meal-1',
  foodId: 7,
  foodName: 'Arroz, tipo 1, cozido',
  groupId: null,
  grams: 50,
  portionLabel: 'colher de sopa',
  portionQuantity: 2,
  kcal: 64,
  proteinG: 1,
  carbsG: 14,
  fatG: 0,
  ...extra,
});

function renderDrawer(value: MealItem) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  invalidate = vi.spyOn(client, 'invalidateQueries');
  return render(
    <QueryClientProvider client={client}>
      <EditMealItemDrawer item={value} date="2026-05-19" onClose={() => undefined} />
    </QueryClientProvider>,
  );
}

let invalidate: { mock: { calls: ReadonlyArray<ReadonlyArray<unknown>> } };

describe('EditMealItemDrawer', () => {
  it('salvar atualiza o resumo, os nutrientes, o gráfico da semana e o dashboard', async () => {
    // Só o resumo do dia era invalidado: o gráfico semanal e o card de metas de
    // nutrientes continuavam com o valor de antes da edição.
    const user = userEvent.setup();
    renderDrawer(item());
    await screen.findByRole('radio', { name: /colher de sopa/ });
    await user.click(screen.getByRole('button', { name: 'Mais' }));
    await user.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(updateItem).toHaveBeenCalled());
    const chaves = invalidate.mock.calls.map(
      ([filtro]) => (filtro as { queryKey: unknown }).queryKey,
    );
    expect(chaves).toEqual(
      expect.arrayContaining([
        ['nutrition', 'summary', '2026-05-19'],
        ['nutrition', 'nutrient-summary', '2026-05-19'],
        ['nutrition', 'history'],
        ['dashboard'],
      ]),
    );
  });

  beforeEach(() => {
    updateItem.mockReset().mockResolvedValue({} as MealItem);
    portions
      .mockReset()
      .mockResolvedValue([{ id: 'p1', label: 'colher de sopa', grams: 25, mine: false }]);
  });

  it('abre na medida em que o item foi registrado e salva a nova quantidade', async () => {
    const user = userEvent.setup();
    renderDrawer(item());

    const colher = await screen.findByRole('radio', { name: /colher de sopa/ });
    expect(colher).toBeChecked();
    expect(screen.getByText('= 50 g')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Mais' }));
    // O número muda no nome, para o leitor de tela anunciar o passo.
    expect(screen.getByRole('status', { name: 'Quantas medidas: 2½' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() =>
      expect(updateItem).toHaveBeenCalledWith('item-1', { portionId: 'p1', quantity: 2.5 }),
    );
    expect(portions).toHaveBeenCalledWith(7);
  });

  it('item registrado em gramas continua em gramas', async () => {
    const user = userEvent.setup();
    renderDrawer(item({ grams: 120, portionLabel: null, portionQuantity: null }));

    await screen.findByRole('radio', { name: /colher de sopa/ });
    expect(screen.getByRole('radio', { name: 'gramas' })).toBeChecked();
    await user.clear(screen.getByLabelText(/Quantidade/));
    await user.type(screen.getByLabelText(/Quantidade/), '150');
    await user.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(updateItem).toHaveBeenCalledWith('item-1', { grams: 150 }));
  });

  it('item livre (sem alimento) não busca medidas: só gramas', async () => {
    renderDrawer(item({ foodId: null, portionLabel: null, portionQuantity: null }));

    expect(screen.getByLabelText(/Quantidade/)).toHaveValue(50);
    expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument();
    expect(portions).not.toHaveBeenCalled();
  });
});
