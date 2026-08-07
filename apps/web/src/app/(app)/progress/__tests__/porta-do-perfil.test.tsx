import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ProgressPage from '../page';

/**
 * A porta do perfil depois da #250.
 *
 * O Perfil saiu da `bottom-nav` para o Chat entrar. Se ninguém colocasse a porta
 * nova, `/profile` viraria uma tela que só existe para quem digita o endereço —
 * foi o que aconteceu com o painel do profissional (#157), entregue sem entrada.
 *
 * O segundo caso é o contrapeso: **a rota não sumiu**. Link direto e favorito
 * continuam abrindo a página, e é isso que uma "troca de navegação" tem de
 * significar.
 */

vi.mock('@/components/progress/weight-chart', () => ({ WeightChart: () => null }));
vi.mock('@/components/progress/steps-chart', () => ({ StepsChart: () => null }));
vi.mock('@/components/progress/strength-chart', () => ({ StrengthChart: () => null }));
vi.mock('@/components/progress/cardio-chart', () => ({ CardioChart: () => null }));
vi.mock('@/components/progress/personal-records', () => ({ PersonalRecords: () => null }));
vi.mock('@/components/progress/training-intensity', () => ({ TrainingIntensity: () => null }));
vi.mock('@/components/progress/consistency-card', () => ({ ConsistencyCard: () => null }));
vi.mock('@/components/progress/log-weight-drawer', () => ({ LogWeightDrawer: () => null }));
vi.mock('@/components/progress/log-steps-drawer', () => ({ LogStepsDrawer: () => null }));

vi.mock('@fatia/api-client', async () => {
  const actual = await vi.importActual<typeof import('@fatia/api-client')>('@fatia/api-client');
  return {
    ...actual,
    progressApi: {
      ...actual.progressApi,
      weight: vi.fn(async () => ({ points: [], currentWeightKg: null, totalDeltaKg: 0 })),
      steps: vi.fn(async () => ({ points: [] })),
    },
  };
});

function renderizar(no: React.ReactNode) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}>{no}</QueryClientProvider>);
}

describe('Progresso', () => {
  it('tem um botão que leva ao perfil', () => {
    renderizar(<ProgressPage />);
    expect(screen.getByRole('link', { name: 'Perfil' })).toHaveAttribute('href', '/profile');
  });
});

describe('/profile', () => {
  it('continua existindo — link direto e favorito não quebram', async () => {
    // Importado aqui dentro porque a página do perfil é server component e puxa
    // `auth-server`; carregá-la no topo obrigaria o arquivo inteiro ao mock.
    vi.doMock('@/lib/auth-server', () => ({
      getCurrentUser: vi.fn(async () => ({
        id: 'user-1',
        email: 'atleta@exemplo.test',
        name: 'Atleta',
        role: 'USER',
      })),
    }));
    vi.doMock('@/components/profile/profile-metrics', () => ({ ProfileMetrics: () => null }));
    vi.doMock('@/components/sharing/professional-panel-link', () => ({
      ProfessionalPanelLink: () => null,
    }));

    const { default: ProfilePage } = await import('../../profile/page');
    renderizar(await ProfilePage());

    expect(screen.getByText('atleta@exemplo.test')).toBeInTheDocument();
  });
});
