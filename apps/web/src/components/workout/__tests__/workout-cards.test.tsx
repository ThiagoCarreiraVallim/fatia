import type React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WorkoutCardsCarousel } from '../cards/workout-cards';

/** O carrossel da aba Treino (prancha `Al-T-Cards-treino`). */

vi.mock('../muscle-diagram', () => ({
  MuscleDiagram: ({ primaryMuscles }: { primaryMuscles: string[] }) => (
    <div data-testid="diagrama">{primaryMuscles.join(',')}</div>
  ),
}));

// O Embla mede a tela (matchMedia, ResizeObserver), que o jsdom não tem.
vi.mock('@/components/ui/carousel', () => {
  const Pass = ({ children }: { children?: React.ReactNode }) => <div>{children}</div>;
  return { Carousel: Pass, CarouselContent: Pass, CarouselItem: Pass };
});

vi.mock('@fatia/api-client', async () => {
  const actual = await vi.importActual<typeof import('@fatia/api-client')>('@fatia/api-client');
  return {
    ...actual,
    workoutApi: {
      ...actual.workoutApi,
      getWeeklyMuscleSummary: vi.fn(),
      getLastSession: vi.fn(),
      startSession: vi.fn(),
    },
  };
});

import { workoutApi } from '@fatia/api-client';

function renderCards() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <WorkoutCardsCarousel />
    </QueryClientProvider>,
  );
}

describe('cards da aba Treino', () => {
  afterEach(() => vi.clearAllMocks());

  it('descansados, último treino sem humor e barras com a meta 12', async () => {
    vi.mocked(workoutApi.getWeeklyMuscleSummary).mockResolvedValue({
      from: '2026-11-08',
      target: 12,
      sets: [
        { group: 'peito', sets: 6 },
        { group: 'costas', sets: 0 },
      ],
      rested: [
        { group: 'costas', daysSince: 4 },
        { group: 'braço', daysSince: 3 },
      ],
      suggestedPlan: { id: 'pull', name: 'Pull', groups: ['costas', 'braço'] },
    });
    vi.mocked(workoutApi.getLastSession).mockResolvedValue({
      id: 's1',
      userId: 'u',
      planId: 'legs',
      plan: { id: 'legs', name: 'Legs' },
      startedAt: '2026-11-13T10:00:00Z',
      completedAt: '2026-11-13T10:53:00Z',
      notes: null,
      sets: [],
    });

    renderCards();

    const descansados = await screen.findByRole('region', { name: 'Seus músculos hoje' });
    expect(within(descansados).getByText('Costas e braços descansados')).toBeVisible();
    // Silhueta da prancha, nas cores do DS, com os dias por extenso para quem não vê.
    expect(
      within(descansados).getByRole('img', { name: /Costas · há 4 dias, Braços · há 3 dias/ }),
    ).toBeVisible();
    const legenda = within(descansados).getByRole('list', { name: 'Legenda' });
    expect(
      within(legenda)
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual(['descansado', 'há 2 dias', 'ontem ou hoje']);
    expect(within(descansados).getByRole('button', { name: 'Pull' })).toBeVisible();
    expect(within(descansados).getByRole('link', { name: 'Outro plano' })).toHaveAttribute(
      'href',
      '/workout/plans',
    );

    const ultimo = screen.getByRole('region', { name: 'Repetir o último treino' });
    expect(within(ultimo).getByText('Legs')).toBeVisible();
    expect(within(ultimo).getByText(/^53 min · 0 séries · 0(,0)? t$/)).toBeVisible();
    // O humor ("Puxado") só vem com a #377.
    expect(within(ultimo).queryByText(/Puxado/)).toBeNull();

    const semana = screen.getByRole('region', { name: 'Séries por músculo na semana' });
    expect(within(semana).getByText('meta 12')).toBeVisible();
    expect(within(semana).getByRole('meter', { name: 'Peito: 6 de 12 séries' })).toBeVisible();
  });

  it('sem treino nenhum, o "Repetir o último" não aparece', async () => {
    vi.mocked(workoutApi.getWeeklyMuscleSummary).mockResolvedValue({
      from: '2026-11-08',
      target: 12,
      sets: [],
      rested: [],
      suggestedPlan: null,
    });
    vi.mocked(workoutApi.getLastSession).mockResolvedValue(null);
    renderCards();
    await screen.findByRole('region', { name: 'Seus músculos hoje' });
    expect(screen.queryByRole('region', { name: 'Repetir o último treino' })).toBeNull();
  });
});
