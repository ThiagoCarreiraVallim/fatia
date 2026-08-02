import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { SessionSet, WorkoutSession } from '@fatia/api-client';
import WorkoutPage from '../page';

/**
 * A troca de exercício dentro da sessão, pela página de verdade.
 *
 * O alvo é o `key` do card: sem ele o React reaproveita a instância ao trocar o
 * foco, e o `touched` do exercício anterior sobrevive — o palpite da sessão
 * anterior (#190) deixa de rodar em todos os exercícios seguintes e o campo
 * abre com a carga do exercício errado. Testar pelo card isolado não pegaria
 * isso: quem monta (ou não) o `key` é a página.
 */

// Fora do caminho: modais e cards vizinhos não participam da troca de foco.
vi.mock('@/components/workout/rpe-modal', () => ({ RpeModal: () => null }));
vi.mock('@/components/workout/exercise-search-drawer', () => ({
  ExerciseSearchDrawer: () => null,
}));
vi.mock('@/components/workout/finish-session-modal', () => ({ FinishSessionModal: () => null }));
vi.mock('@/components/workout/cancel-session-modal', () => ({ CancelSessionModal: () => null }));
vi.mock('@/components/workout/exercise-detail-card', () => ({ ExerciseDetailCard: () => null }));
vi.mock('@/components/workout/active-cardio-card', () => ({ ActiveCardioCard: () => null }));

vi.mock('@fatia/api-client', async () => {
  const actual = await vi.importActual<typeof import('@fatia/api-client')>('@fatia/api-client');
  return {
    ...actual,
    workoutApi: {
      ...actual.workoutApi,
      getActiveSession: vi.fn(),
      getLastSet: vi.fn(),
      getPersonalRecord: vi.fn(),
      logSet: vi.fn(),
    },
  };
});

import { workoutApi } from '@fatia/api-client';

const getActiveSession = vi.mocked(workoutApi.getActiveSession);
const getLastSet = vi.mocked(workoutApi.getLastSet);
const getPersonalRecord = vi.mocked(workoutApi.getPersonalRecord);

const STARTED_AT = '2026-08-01T18:00:00.000Z';

function makeReferenceSet(exerciseId: number, weightKg: number): SessionSet {
  return {
    id: `ref-${exerciseId}`,
    sessionId: 'sessao-passada',
    exerciseId,
    setNumber: 1,
    weightKg,
    reps: 10,
    rpe: null,
    durationSeconds: null,
    distanceMeters: null,
    avgHeartRate: null,
    kcalBurned: null,
    notes: null,
    exercise: {
      id: exerciseId,
      name: `Exercício ${exerciseId}`,
      muscleGroup: 'peito',
      source: 'SEED',
      createdByUserId: null,
      primaryMuscles: [],
      secondaryMuscles: [],
      equipment: null,
      level: null,
      mechanic: null,
      instructions: [],
      youtubeVideoId: null,
      youtubeVideoIdPt: null,
    },
  };
}

const session: WorkoutSession = {
  id: 'sessao-de-hoje',
  userId: 'user-1',
  planId: null,
  startedAt: STARTED_AT,
  completedAt: null,
  notes: null,
  sets: [],
  plannedExercises: [
    {
      exerciseId: 1,
      exerciseName: 'Supino reto',
      muscleGroup: 'peito',
      order: 1,
      targetSets: 3,
      targetReps: '8-12',
    },
    {
      exerciseId: 2,
      exerciseName: 'Rosca direta',
      muscleGroup: 'braço',
      order: 2,
      targetSets: 3,
      targetReps: '10-12',
    },
  ],
};

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <WorkoutPage />
    </QueryClientProvider>,
  );
}

function weightValue(): string | null {
  return screen.getByRole('button', { name: 'Editar CARGA (KG)' }).textContent;
}

describe('WorkoutPage — troca de exercício na sessão', () => {
  beforeEach(() => {
    getActiveSession.mockResolvedValue(session);
    getPersonalRecord.mockResolvedValue(null);
    // Supino a 60 kg da última vez; rosca direta a 20 kg.
    getLastSet.mockImplementation(async (exerciseId: number) =>
      exerciseId === 1 ? makeReferenceSet(1, 60) : makeReferenceSet(2, 20),
    );
  });

  it('recomeça o card no exercício seguinte em vez de arrastar a carga do anterior', async () => {
    const user = userEvent.setup();
    renderPage();

    expect(await screen.findByRole('heading', { name: 'Supino reto' })).toBeInTheDocument();
    await waitFor(() => expect(weightValue()).toBe('60'));

    // Ajuste manual: é o que marca `touched` e, sem `key`, vaza para o próximo.
    await user.click(screen.getAllByRole('button', { name: 'Aumentar' })[0]);
    expect(weightValue()).toBe('61');

    await user.click(screen.getByRole('button', { name: /finalizar exercício/i }));

    expect(await screen.findByRole('heading', { name: 'Rosca direta' })).toBeInTheDocument();
    await waitFor(() => expect(weightValue()).toBe('20'));
    expect(screen.getByText('Anterior: 20kg')).toBeInTheDocument();
  });
});
