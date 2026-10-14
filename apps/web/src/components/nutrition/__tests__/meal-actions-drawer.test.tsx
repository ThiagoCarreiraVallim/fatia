import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { ApiError, type Meal } from '@fatia/api-client';
import { MealActionsDrawer } from '../meal-actions-drawer';
import { CopyDayDrawer } from '../copy-day-drawer';

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
    nutritionApi: { copyMeal: vi.fn(), copyDay: vi.fn(), createMealTemplate: vi.fn() },
  };
});

import { nutritionApi } from '@fatia/api-client';

const copyMeal = vi.mocked(nutritionApi.copyMeal);
const copyDay = vi.mocked(nutritionApi.copyDay);
const createMealTemplate = vi.mocked(nutritionApi.createMealTemplate);

const HOJE = '2026-05-19';
const ONTEM = '2026-05-18';

const jantar: Meal = {
  id: 'meal-1',
  userId: 'u',
  mealType: 'DINNER',
  eatenAt: '2026-05-18T22:00:00.000Z',
  notes: null,
  items: [],
};

function wrap(ui: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

describe('MealActionsDrawer', () => {
  beforeEach(() => {
    copyMeal.mockReset().mockResolvedValue({ ...jantar, id: 'copia' });
    createMealTemplate.mockReset();
  });

  it('copia a refeição de ontem para hoje em um toque, e oferece ir ver', async () => {
    const user = userEvent.setup();
    wrap(<MealActionsDrawer meal={jantar} date={ONTEM} today={HOJE} onClose={() => undefined} />);

    await user.click(screen.getByRole('button', { name: 'Copiar para hoje' }));

    await waitFor(() => expect(copyMeal).toHaveBeenCalledWith('meal-1', { toDate: HOJE }));
    expect(await screen.findByRole('status')).toHaveTextContent('Copiada para hoje');
    expect(screen.getByRole('link', { name: 'Ver hoje' })).toHaveAttribute(
      'href',
      `/nutrition?date=${HOJE}`,
    );
  });

  it('outro dia: o botão diz para onde vai', async () => {
    const user = userEvent.setup();
    wrap(<MealActionsDrawer meal={jantar} date={HOJE} today={HOJE} onClose={() => undefined} />);

    // Olhando hoje, o padrão é amanhã.
    expect(screen.getByRole('button', { name: 'Copiar para amanhã' })).toBeInTheDocument();
    const campo = screen.getByLabelText('Dia de destino');
    await user.clear(campo);
    await user.type(campo, '2026-05-25');
    await user.click(screen.getByRole('button', { name: /^Copiar para / }));

    await waitFor(() => expect(copyMeal).toHaveBeenCalledWith('meal-1', { toDate: '2026-05-25' }));
  });

  it('cópia repetida: mostra o motivo que a API deu', async () => {
    const user = userEvent.setup();
    copyMeal.mockRejectedValue(new ApiError('Essa refeição já foi copiada para 2026-05-19.', 409));
    wrap(<MealActionsDrawer meal={jantar} date={ONTEM} today={HOJE} onClose={() => undefined} />);

    await user.click(screen.getByRole('button', { name: 'Copiar para hoje' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('já foi copiada');
  });

  it('tentar de novo e falhar não apaga a cópia que deu certo', async () => {
    const user = userEvent.setup();
    copyMeal
      .mockResolvedValueOnce({ ...jantar, id: 'copia' })
      .mockRejectedValueOnce(new ApiError('Essa refeição já foi copiada para 2026-05-19.', 409));
    wrap(<MealActionsDrawer meal={jantar} date={ONTEM} today={HOJE} onClose={() => undefined} />);

    await user.click(screen.getByRole('button', { name: 'Copiar para hoje' }));
    await screen.findByRole('status');
    await user.click(screen.getByRole('button', { name: 'Copiar para hoje' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('já foi copiada');
    expect(screen.getByRole('status')).toHaveTextContent('Copiada para hoje');
    expect(screen.getByRole('link', { name: 'Ver hoje' })).toBeInTheDocument();
  });

  it('salva como refeição salva, com o nome do tipo como sugestão', async () => {
    const user = userEvent.setup();
    createMealTemplate.mockResolvedValue({
      id: 't1',
      name: 'Janta leve',
      mealType: 'DINNER',
      items: [],
    });
    wrap(<MealActionsDrawer meal={jantar} date={ONTEM} today={HOJE} onClose={() => undefined} />);

    const nome = screen.getByLabelText('Nome da refeição salva');
    expect(nome).toHaveValue('Jantar');
    await user.clear(nome);
    await user.type(nome, 'Janta leve');
    await user.click(screen.getByRole('button', { name: 'Salvar refeição' }));

    await waitFor(() =>
      expect(createMealTemplate).toHaveBeenCalledWith({ name: 'Janta leve', mealId: 'meal-1' }),
    );
    expect(await screen.findByText(/"Janta leve" salva/)).toBeInTheDocument();
  });
});

describe('CopyDayDrawer', () => {
  beforeEach(() => {
    copyDay.mockReset();
  });

  it('copia o dia todo e diz quantas entraram e quantas já estavam lá', async () => {
    const user = userEvent.setup();
    copyDay.mockResolvedValue({ created: [jantar, jantar], skipped: 1 });
    wrap(
      <CopyDayDrawer open onOpenChange={() => undefined} date={ONTEM} today={HOJE} mealCount={3} />,
    );

    expect(screen.getByText(/3 refeições de ontem/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Copiar para hoje' }));

    await waitFor(() => expect(copyDay).toHaveBeenCalledWith({ fromDate: ONTEM, toDate: HOJE }));
    expect(await screen.findByRole('status')).toHaveTextContent(
      '2 refeições copiadas · 1 já estava lá',
    );
  });
});
