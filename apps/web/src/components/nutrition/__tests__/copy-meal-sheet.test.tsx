import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import type { Meal } from '@fatia/api-client';
import { CopyMealSheet } from '../copy-meal-sheet';

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
  return { ...actual, nutritionApi: { copyMeal: vi.fn(), copyDay: vi.fn() } };
});

import { nutritionApi } from '@fatia/api-client';

const copyMeal = vi.mocked(nutritionApi.copyMeal);
const copyDay = vi.mocked(nutritionApi.copyDay);

const meal = {
  id: 'meal-1',
  userId: 'u',
  mealType: 'BREAKFAST',
  eatenAt: '2026-11-15T10:36:00Z',
  notes: null,
  items: [
    {
      id: 'i1',
      mealId: 'meal-1',
      foodName: 'Pão',
      grams: 50,
      kcal: 150,
      proteinG: 4,
      carbsG: 29,
      fatG: 2,
    },
  ],
} as Meal;

function renderSheet() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <CopyMealSheet open meal={meal} date="2026-11-15" today="2026-11-15" onOpenChange={vi.fn()} />
    </QueryClientProvider>,
  );
}

describe('CopyMealSheet (Al-N9)', () => {
  beforeEach(() => {
    copyMeal.mockReset().mockResolvedValue(meal);
    copyDay.mockReset().mockResolvedValue({ created: [meal], skipped: 0 } as never);
  });

  it('copia só a refeição para o dia do chip, e oferece ver o destino', async () => {
    const user = userEvent.setup();
    renderSheet();

    await user.click(screen.getByRole('button', { name: /^amanhã$/ }));
    await user.click(screen.getByRole('button', { name: 'Copiar para amanhã' }));

    await waitFor(() => expect(copyMeal).toHaveBeenCalledWith('meal-1', { toDate: '2026-11-16' }));
    expect(await screen.findByText('Copiado para amanhã')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ver amanhã' })).toHaveAttribute(
      'href',
      '/nutrition?date=2026-11-16',
    );
  });

  it('"O dia todo" copia o dia em vez da refeição', async () => {
    const user = userEvent.setup();
    renderSheet();

    await user.click(screen.getByRole('radio', { name: 'O dia todo' }));
    await user.click(screen.getByRole('button', { name: 'Copiar para amanhã' }));

    await waitFor(() =>
      expect(copyDay).toHaveBeenCalledWith({ fromDate: '2026-11-15', toDate: '2026-11-16' }),
    );
    expect(copyMeal).not.toHaveBeenCalled();
  });
});
