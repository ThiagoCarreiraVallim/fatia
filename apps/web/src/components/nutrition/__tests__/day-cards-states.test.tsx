import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { WeeklyTrendChart } from '../weekly-trend-chart';
import { NutrientTargetsCard } from '../nutrient-targets-card';

vi.mock('@fatia/api-client', async () => {
  const actual = await vi.importActual<typeof import('@fatia/api-client')>('@fatia/api-client');
  return { ...actual, nutritionApi: { history: vi.fn(), nutrientSummary: vi.fn() } };
});

import { nutritionApi } from '@fatia/api-client';

const history = vi.mocked(nutritionApi.history);
const nutrientSummary = vi.mocked(nutritionApi.nutrientSummary);

function wrap(ui: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

describe('estados dos cards do dia', () => {
  beforeEach(() => {
    history.mockReset();
    nutrientSummary.mockReset();
  });

  it('gráfico da semana: falha mostra o motivo e tenta de novo, sem sumir', async () => {
    history.mockRejectedValueOnce(new Error('Sem conexão.')).mockResolvedValueOnce({
      series: [
        { date: '2026-05-18', kcal: 1800 },
        { date: '2026-05-19', kcal: 2100 },
      ],
      averages: { kcal: 1950 },
    } as never);
    const user = userEvent.setup();
    wrap(<WeeklyTrendChart today="2026-05-19" />);

    expect(await screen.findByRole('alert')).toHaveTextContent('Sem conexão.');
    expect(screen.getByRole('heading', { name: 'Tendência Semanal' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Tentar de novo' }));

    // A série chega ao leitor de tela, como no app.
    expect(
      await screen.findByRole('img', { name: 'Calorias dos últimos 2 dias: S 1800, T 2100' }),
    ).toBeInTheDocument();
  });

  it('metas personalizadas: falha não convida a criar meta, e tenta de novo', async () => {
    nutrientSummary.mockRejectedValueOnce(new Error('Sem conexão.')).mockResolvedValueOnce({
      nutrients: [
        {
          nutrientKey: 'sodium_mg',
          label: 'Sódio',
          unit: 'mg',
          total: 1500,
          min: null,
          max: 2000,
          status: 'ok',
        },
      ],
    } as never);
    const user = userEvent.setup();
    wrap(<NutrientTargetsCard date="2026-05-19" />);

    expect(await screen.findByRole('alert')).toHaveTextContent('Sem conexão.');
    expect(screen.queryByText(/Toque para criar uma meta/)).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Tentar de novo' }));

    expect(await screen.findByRole('progressbar', { name: 'Sódio' })).toHaveAttribute(
      'aria-valuetext',
      '1500 de máx 2000 mg, na meta',
    );
  });

  it('metas personalizadas: carregando, não mostra o convite a criar', () => {
    nutrientSummary.mockReturnValue(new Promise(() => undefined));
    wrap(<NutrientTargetsCard date="2026-05-19" />);

    expect(screen.queryByText(/Toque para criar uma meta/)).not.toBeInTheDocument();
  });
});
