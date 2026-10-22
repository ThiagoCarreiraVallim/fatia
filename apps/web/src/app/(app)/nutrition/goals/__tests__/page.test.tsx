import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { UserGoals } from '@fatia/api-client';
import GoalsPage from '../page';

vi.mock('@fatia/api-client', async () => {
  const actual = await vi.importActual<typeof import('@fatia/api-client')>('@fatia/api-client');
  return { ...actual, nutritionApi: { goals: vi.fn(), putGoals: vi.fn() } };
});

import { nutritionApi } from '@fatia/api-client';

const goals = vi.mocked(nutritionApi.goals);
const putGoals = vi.mocked(nutritionApi.putGoals);

const current = {
  userId: 'u',
  kcalMin: 1800,
  kcalMax: 2200,
  proteinMinG: 120,
  proteinMaxG: 160,
  carbsMinG: 180,
  carbsMaxG: 250,
  fatMinG: 50,
  fatMaxG: 80,
  weeklyWorkouts: 3,
  dailyStepsTarget: 8000,
  dailyWaterTargetMl: 2500,
} as UserGoals;

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <GoalsPage />
    </QueryClientProvider>,
  );
}

describe('GoalsPage', () => {
  beforeEach(() => {
    goals.mockReset().mockResolvedValue(current);
    putGoals.mockReset().mockResolvedValue(current);
  });

  it('salvar avisa que salvou; mexer de novo apaga o aviso', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole('button', { name: 'Salvar metas' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Metas salvas.');

    await user.type(screen.getAllByLabelText('Mínimo')[0], '0');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('falha ao carregar as metas mostra o motivo e tenta de novo', async () => {
    goals.mockRejectedValueOnce(new Error('Sem conexão.'));
    const user = userEvent.setup();
    renderPage();

    expect(await screen.findByRole('alert')).toHaveTextContent('Sem conexão.');
    await user.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    expect(goals).toHaveBeenCalledTimes(2);
  });
});
