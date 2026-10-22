import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ProgressPage from '../page';

/**
 * O que a tela de Progresso ganhou do app: números com vírgula, o mini
 * histórico de peso dito ao leitor de tela, o período marcado para quem não
 * enxerga a cor e o erro de cada gráfico com "Tentar de novo".
 */

const api = vi.hoisted(() => ({ weight: vi.fn(), steps: vi.fn() }));

vi.mock('@fatia/api-client', async () => {
  const actual = await vi.importActual<typeof import('@fatia/api-client')>('@fatia/api-client');
  return { ...actual, progressApi: { ...actual.progressApi, ...api } };
});

// Cada um tem teste próprio (ou é só desenho); aqui importa a moldura da tela.
vi.mock('@/components/progress/consistency-card', () => ({ ConsistencyCard: () => null }));
vi.mock('@/components/progress/training-intensity', () => ({ TrainingIntensity: () => null }));
vi.mock('@/components/progress/personal-records', () => ({ PersonalRecords: () => null }));
vi.mock('@/components/progress/strength-chart', () => ({ StrengthChart: () => null }));
vi.mock('@/components/progress/cardio-chart', () => ({ CardioChart: () => null }));
vi.mock('@/components/progress/weight-chart', () => ({
  WeightChart: () => <p>gráfico de peso</p>,
}));
vi.mock('@/components/progress/steps-chart', () => ({
  StepsChart: () => <p>gráfico de passos</p>,
}));
vi.mock('@/components/progress/log-weight-drawer', () => ({ LogWeightDrawer: () => null }));
vi.mock('@/components/progress/log-steps-drawer', () => ({ LogStepsDrawer: () => null }));

const WEIGHT = {
  points: [
    { date: '2026-10-01', weightKg: 80 },
    { date: '2026-10-08', weightKg: 79.4 },
    { date: '2026-10-15', weightKg: 78.6 },
  ],
  currentWeightKg: 78.6,
  totalDeltaKg: 1.4,
};

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <ProgressPage />
    </QueryClientProvider>,
  );
}

describe('Progresso', () => {
  it('mostra o peso com vírgula e diz ao leitor de tela as últimas pesagens', async () => {
    api.weight.mockResolvedValue(WEIGHT);
    api.steps.mockResolvedValue({ points: [], goalTarget: null });
    renderPage();

    expect(await screen.findByText(/78,6/)).toBeInTheDocument();
    // Ganhar peso não é aviso: o delta fica neutro.
    const delta = screen.getByText(/\+1,4 kg/);
    expect(delta).toHaveClass('text-muted-foreground');
    expect(delta).not.toHaveClass('text-warning');
    expect(
      screen.getByRole('img', {
        name: 'Últimas 3 pesagens: 80,0 kg, 79,4 kg, 78,6 kg.',
      }),
    ).toBeInTheDocument();
  });

  it('o botão de logar peso tem o alvo de toque de 44 px', async () => {
    api.weight.mockResolvedValue(WEIGHT);
    api.steps.mockResolvedValue({ points: [], goalTarget: null });
    renderPage();
    expect(screen.getByRole('button', { name: 'Logar peso' })).toHaveClass('h-11', 'w-11');
  });

  it('marca o período escolhido e mostra o erro de cada gráfico com "Tentar de novo"', async () => {
    let online = false;
    api.weight.mockImplementation(async () => {
      if (!online) throw new Error('fora do ar');
      return WEIGHT;
    });
    api.steps.mockResolvedValue({
      points: [{ date: '2026-10-15', steps: 9000 }],
      goalTarget: null,
    });
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole('tab', { name: 'Gráficos' }));
    const periodo = screen.getByRole('group', { name: 'Período' });
    expect(within(periodo).getByRole('button', { name: '30 dias' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await user.click(within(periodo).getByRole('button', { name: '90 dias' }));
    expect(within(periodo).getByRole('button', { name: '90 dias' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(within(periodo).getByRole('button', { name: '30 dias' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );

    const alerta = await screen.findByRole('alert');
    expect(alerta).toHaveTextContent('Não deu para carregar o peso.');
    // O gráfico de passos não some por causa do peso.
    expect(await screen.findByText('gráfico de passos')).toBeInTheDocument();

    online = true;
    await user.click(within(alerta).getByRole('button', { name: 'Tentar de novo' }));
    expect(await screen.findByText('gráfico de peso')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
