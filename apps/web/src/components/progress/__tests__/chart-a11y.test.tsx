import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WeightChart } from '../weight-chart';
import { StepsChart } from '../steps-chart';
import { ConsistencyCard } from '../consistency-card';

/**
 * O leitor de tela não atravessa o SVG do gráfico. Como no app, cada gráfico
 * vira uma imagem com o resumo da série (`describeSeries`, do api-client).
 */

vi.mock('@fatia/api-client', async () => {
  const actual = await vi.importActual<typeof import('@fatia/api-client')>('@fatia/api-client');
  return { ...actual, workoutApi: { listSessions: vi.fn(async () => []) } };
});

// O `ResponsiveContainer` do recharts mede o pai; o jsdom não tem o observador.
vi.stubGlobal(
  'ResizeObserver',
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
);

describe('gráficos de Progresso para o leitor de tela', () => {
  it('peso: resumo da série com vírgula', () => {
    render(
      <WeightChart
        data={
          {
            points: [
              { date: '2026-10-01', weightKg: 80 },
              { date: '2026-10-15', weightKg: 78.6 },
            ],
          } as never
        }
      />,
    );
    expect(
      screen.getByRole('img', {
        name:
          'Peso corporal: 2 registros de 01 out a 15 out. Começou em 80,0 kg e terminou em ' +
          '78,6 kg. Menor valor 78,6 kg, maior valor 80,0 kg.',
      }),
    ).toBeInTheDocument();
  });

  it('passos: resumo da série e a meta do dia', () => {
    render(
      <StepsChart
        data={
          {
            points: [
              { date: '2026-10-14', steps: 12500 },
              { date: '2026-10-15', steps: 8000 },
            ],
            goalTarget: 10000,
          } as never
        }
      />,
    );
    expect(screen.getByRole('img')).toHaveAccessibleName(
      /^Passos por dia: 2 registros de 14 out a 15 out\..* Meta diária de 10\.000 passos\.$/,
    );
  });

  it('constância: as quatro barras ditas em números', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <ConsistencyCard />
      </QueryClientProvider>,
    );
    expect(
      await screen.findByRole('img', {
        name: 'Constância: 0 de 30 dias com treino. Por semana, da mais antiga para a mais recente: 0, 0, 0, 0 dias.',
      }),
    ).toBeInTheDocument();
  });
});
