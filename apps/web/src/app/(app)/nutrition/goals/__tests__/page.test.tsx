import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { UserGoals } from '@fatia/api-client';
import GoalsPage from '../page';

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

vi.mock('@fatia/api-client', async () => {
  const actual = await vi.importActual<typeof import('@fatia/api-client')>('@fatia/api-client');
  return {
    ...actual,
    nutritionApi: { goals: vi.fn(), putGoals: vi.fn(), nutrientSummary: vi.fn() },
  };
});

import { nutritionApi } from '@fatia/api-client';

const goals = vi.mocked(nutritionApi.goals);
const putGoals = vi.mocked(nutritionApi.putGoals);
const nutrientSummary = vi.mocked(nutritionApi.nutrientSummary);

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
    nutrientSummary.mockReset().mockResolvedValue({
      date: '2026-11-15',
      nutrients: [
        {
          nutrientKey: 'fiber_g',
          label: 'Fibra',
          unit: 'g',
          min: 25,
          max: null,
          total: 14,
          status: 'under',
        },
      ],
    });
  });

  it('mínimo acima do máximo avisa na linha e não salva', async () => {
    const user = userEvent.setup();
    renderPage();

    const min = await screen.findByLabelText('Mínimo de Proteína');
    await waitFor(() => expect(min).toBeEnabled());
    await user.clear(min);
    await user.type(min, '170');

    const row = screen.getByRole('group', { name: /Proteína/ });
    expect(within(row).getByRole('alert')).toHaveTextContent(
      'O mínimo (170) passa do máximo (160).',
    );
    expect(min).toHaveAttribute('aria-invalid', 'true');

    await user.click(screen.getByRole('button', { name: 'Salvar metas' }));
    expect(putGoals).not.toHaveBeenCalled();
  });

  it('campos digitáveis com teclado decimal; água em litros com vírgula', async () => {
    const user = userEvent.setup();
    renderPage();

    const water = await screen.findByLabelText('Água por dia (L)');
    await waitFor(() => expect(water).toBeEnabled());
    expect(water).toHaveAttribute('inputmode', 'decimal');
    expect(water).toHaveValue('2,5');
    await user.clear(water);
    await user.type(water, '3,25');
    await user.click(screen.getByRole('button', { name: 'Salvar metas' }));

    await waitFor(() =>
      expect(putGoals).toHaveBeenCalledWith(expect.objectContaining({ dailyWaterTargetMl: 3250 })),
    );
  });

  it('mostra os nutrientes de hoje e leva a gerenciar', async () => {
    renderPage();
    const block = await screen.findByRole('region', { name: 'Seus nutrientes' });
    expect(await within(block).findByText('hoje 14 g')).toBeInTheDocument();
    expect(within(block).getByText('mín 25 g')).toBeInTheDocument();
    expect(within(block).getByRole('link', { name: 'Gerenciar' })).toHaveAttribute(
      'href',
      '/nutrition/nutrient-targets',
    );
    expect(within(block).getByRole('link', { name: 'Adicionar nutriente' })).toBeInTheDocument();
  });

  it('salvar avisa que salvou; mexer de novo apaga o aviso', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole('button', { name: 'Salvar metas' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Metas salvas.');

    await user.type(screen.getByLabelText('Mínimo de Calorias'), '0');
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
