import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import type { MealDetail } from '@fatia/api-client';
import { MealDetailScreen } from '../meal-detail-screen';

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));

const toast = vi.fn();
vi.mock('sonner', () => ({ toast: (...args: unknown[]) => toast(...args) }));

vi.mock('@/components/ui/drawer', () => {
  const Passthrough = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
  return {
    Drawer: ({ open, children }: { open: boolean; children: ReactNode }) =>
      open ? <div role="dialog">{children}</div> : null,
    DrawerContent: Passthrough,
    DrawerHeader: Passthrough,
    DrawerFooter: Passthrough,
    DrawerTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
    DrawerDescription: ({ children }: { children: ReactNode }) => <p>{children}</p>,
    DrawerClose: Passthrough,
  };
});
vi.mock('../food-search-drawer', () => ({ FoodSearchDrawer: () => null }));

vi.mock('@fatia/api-client', async () => {
  const actual = await vi.importActual<typeof import('@fatia/api-client')>('@fatia/api-client');
  return {
    ...actual,
    nutritionApi: {
      meal: vi.fn(),
      deleteMealPhoto: vi.fn(),
      deleteMeal: vi.fn(),
      createMealTemplate: vi.fn(),
      portions: vi.fn().mockResolvedValue([]),
    },
  };
});

import { nutritionApi } from '@fatia/api-client';

const getMeal = vi.mocked(nutritionApi.meal);
const deleteMealPhoto = vi.mocked(nutritionApi.deleteMealPhoto);
const deleteMeal = vi.mocked(nutritionApi.deleteMeal);
const createMealTemplate = vi.mocked(nutritionApi.createMealTemplate);

const withPhoto: MealDetail = {
  id: 'meal-1',
  userId: 'u',
  mealType: 'LUNCH',
  eatenAt: '2026-11-15T15:41:00Z',
  notes: null,
  hasPhoto: true,
  origin: 'AI',
  photo: { id: 'f1', url: 'https://bucket/f1.webp?sig', width: 1200, height: 900 },
  items: [
    {
      id: 'i1',
      mealId: 'meal-1',
      foodId: 1,
      foodName: 'Arroz branco',
      groupId: null,
      grams: 100,
      kcal: 128,
      proteinG: 2.5,
      carbsG: 28,
      fatG: 0.2,
      nutrients: { fiber_g: 1.6, sodium_mg: 1 },
      source: 'AI',
    },
    {
      id: 'i2',
      mealId: 'meal-1',
      foodId: 2,
      foodName: 'Frango grelhado',
      groupId: null,
      grams: 150,
      kcal: 240,
      proteinG: 45,
      carbsG: 0,
      fatG: 5,
      source: 'MANUAL',
    },
  ],
};

function renderScreen() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MealDetailScreen id="meal-1" date="2026-11-15" />
    </QueryClientProvider>,
  );
}

describe('MealDetailScreen (Al-N8, Al-N8b)', () => {
  beforeEach(() => {
    getMeal.mockReset().mockResolvedValue(withPhoto);
    deleteMealPhoto.mockReset().mockResolvedValue({ ...withPhoto, hasPhoto: false });
    deleteMeal.mockReset().mockResolvedValue(undefined);
    createMealTemplate.mockReset().mockResolvedValue({ id: 't1', name: 'Almoço' } as never);
    push.mockReset();
    toast.mockReset();
  });

  it('com foto da IA: a foto, o selo, o aviso das porções e o "IA" só nos itens da IA', async () => {
    renderScreen();

    expect(await screen.findByRole('img', { name: 'Foto do Almoço' })).toHaveAttribute(
      'src',
      'https://bucket/f1.webp?sig',
    );
    expect(screen.getByText('Reconhecido pela IA')).toBeInTheDocument();
    expect(screen.getByText(/costumam errar 20–30%/)).toBeInTheDocument();
    expect(screen.getByText('368')).toBeInTheDocument();

    const rice = screen.getByRole('button', { name: /Arroz branco/ });
    expect(within(rice).getByText('IA')).toBeInTheDocument();
    const chicken = screen.getByRole('button', { name: /Frango grelhado/ });
    expect(within(chicken).queryByText('IA')).not.toBeInTheDocument();
  });

  it('"Apagar só a foto" confirma antes e deixa a refeição', async () => {
    const user = userEvent.setup();
    renderScreen();

    await user.click(await screen.findByRole('button', { name: 'Apagar só a foto' }));
    expect(deleteMealPhoto).not.toHaveBeenCalled();
    expect(screen.getByText(/a refeição e os itens ficam/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Apagar a foto' }));

    await waitFor(() => expect(deleteMealPhoto).toHaveBeenCalledWith('meal-1'));
    expect(toast).toHaveBeenCalledWith('Foto apagada · a refeição continua');
    expect(push).not.toHaveBeenCalled();
  });

  it('sem foto guardada não há "Apagar só a foto" nem a imagem', async () => {
    getMeal.mockResolvedValue({ ...withPhoto, hasPhoto: false, photo: null });
    renderScreen();

    await screen.findByText('Arroz branco');
    expect(screen.queryByRole('button', { name: 'Apagar só a foto' })).not.toBeInTheDocument();
    expect(screen.queryByRole('img', { name: 'Foto do Almoço' })).not.toBeInTheDocument();
  });

  it('excluir a refeição diz que não tem volta e só apaga no confirmar', async () => {
    const user = userEvent.setup();
    renderScreen();

    await user.click(await screen.findByRole('button', { name: 'Excluir refeição' }));
    expect(screen.getByText('Excluir Almoço e os 2 itens?')).toBeInTheDocument();
    expect(screen.getByText('Não tem volta.')).toBeInTheDocument();
    expect(deleteMeal).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Excluir' }));

    await waitFor(() => expect(deleteMeal).toHaveBeenCalledWith('meal-1'));
    expect(push).toHaveBeenCalledWith('/nutrition?date=2026-11-15');
  });

  it('salvar como refeição usa o nome do tipo', async () => {
    const user = userEvent.setup();
    renderScreen();

    await user.click(await screen.findByRole('button', { name: 'Salvar como refeição' }));

    await waitFor(() =>
      expect(createMealTemplate).toHaveBeenCalledWith({ name: 'Almoço', mealId: 'meal-1' }),
    );
    expect(await screen.findByRole('button', { name: 'Salva como refeição' })).toBeDisabled();
  });
});
