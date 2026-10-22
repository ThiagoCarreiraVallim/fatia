import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { WorkoutSession } from '@fatia/api-client';
import SessionDetailPage from '../page';

vi.mock('next/navigation', () => ({ useParams: () => ({ id: 'sessao-1' }) }));
vi.mock('@/components/workout/exercise-detail-card', () => ({
  ExerciseDetailCard: () => null,
}));

vi.mock('@fatia/api-client', async () => {
  const actual = await vi.importActual<typeof import('@fatia/api-client')>('@fatia/api-client');
  return { ...actual, workoutApi: { ...actual.workoutApi, getSession: vi.fn() } };
});

import { workoutApi } from '@fatia/api-client';

const getSession = vi.mocked(workoutApi.getSession);

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <SessionDetailPage />
    </QueryClientProvider>,
  );
}

/** A sessão concluída, que é como o histórico chega aqui. */
describe('SessionDetailPage', () => {
  beforeEach(() => getSession.mockReset());

  it('falha de rede não vira "sessão não encontrada", e dá para tentar de novo', async () => {
    getSession.mockRejectedValueOnce(new Error('sem conexão'));
    const user = userEvent.setup();
    renderPage();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Não foi possível carregar o treino',
    );
    expect(screen.queryByText(/não encontrada/)).toBeNull();

    getSession.mockResolvedValueOnce(null as unknown as WorkoutSession);
    await user.click(screen.getByRole('button', { name: /tentar de novo/i }));
    expect(await screen.findByText('Sessão não encontrada')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Voltar para treinos' })).toHaveAttribute(
      'href',
      '/workout',
    );
  });

  it('resume o volume com separador de milhar e a duração com dois dígitos', async () => {
    getSession.mockResolvedValue({
      id: 'sessao-1',
      userId: 'u',
      planId: null,
      startedAt: '2026-08-01T18:00:00.000Z',
      completedAt: '2026-08-01T19:05:00.000Z',
      notes: null,
      plannedExercises: [],
      sets: Array.from({ length: 4 }, (_, i) => ({
        id: `s${i}`,
        sessionId: 'sessao-1',
        exerciseId: 1,
        setNumber: i + 1,
        weightKg: 100,
        reps: 10,
        rpe: null,
        durationSeconds: null,
        distanceMeters: null,
        avgHeartRate: null,
        kcalBurned: null,
        notes: null,
        exercise: { id: 1, name: 'Agachamento', muscleGroup: 'pernas' },
      })),
    } as unknown as WorkoutSession);
    renderPage();

    expect(await screen.findByText('4.000 kg')).toBeInTheDocument();
    expect(screen.getByText('1h 05min')).toBeInTheDocument();
  });
});
