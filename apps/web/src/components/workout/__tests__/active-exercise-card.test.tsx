import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ExerciseGroup, SessionSet } from '@fatia/api-client';
import { ActiveExerciseCard } from '../active-exercise-card';

// O modal de RPE só aparece depois de registrar uma série e arrasta o vaul
// junto; nada disso interessa ao valor de partida dos campos.
vi.mock('../rpe-modal', () => ({ RpeModal: () => null }));

vi.mock('@fatia/api-client', async () => {
  const actual = await vi.importActual<typeof import('@fatia/api-client')>('@fatia/api-client');
  return {
    ...actual,
    workoutApi: {
      ...actual.workoutApi,
      getLastSet: vi.fn(),
      getPersonalRecord: vi.fn(),
      logSet: vi.fn(),
      updateSet: vi.fn(),
      deleteSet: vi.fn(),
    },
  };
});

import { workoutApi } from '@fatia/api-client';

const getLastSet = vi.mocked(workoutApi.getLastSet);
const getPersonalRecord = vi.mocked(workoutApi.getPersonalRecord);

const SESSION_ID = 'sessao-de-hoje';

function makeSet(partial: Partial<SessionSet> = {}): SessionSet {
  return {
    id: 'set-1',
    sessionId: SESSION_ID,
    exerciseId: 1,
    setNumber: 1,
    weightKg: null,
    reps: null,
    rpe: null,
    durationSeconds: null,
    distanceMeters: null,
    avgHeartRate: null,
    kcalBurned: null,
    notes: null,
    exercise: {
      id: 1,
      name: 'Supino reto',
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
    ...partial,
  };
}

function makeGroup(partial: Partial<ExerciseGroup> = {}): ExerciseGroup {
  return {
    exerciseId: 1,
    exerciseName: 'Supino reto',
    isCardio: false,
    sets: [],
    isPlanned: true,
    targetSets: 3,
    targetReps: '8-12',
    ...partial,
  };
}

function renderCard(group: ExerciseGroup = makeGroup()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ActiveExerciseCard sessionId={SESSION_ID} group={group} onFinishExercise={() => undefined} />
    </QueryClientProvider>,
  );
}

/** O valor do campo é o rótulo do botão que abre a edição. */
function weightField() {
  return screen.getByRole('button', { name: 'Editar CARGA (KG)' });
}

function repsField() {
  return screen.getByRole('button', { name: 'Editar REPETIÇÕES' });
}

describe('ActiveExerciseCard', () => {
  beforeEach(() => {
    getLastSet.mockResolvedValue(null);
    getPersonalRecord.mockResolvedValue(null);
  });

  it('não pré-preenche a primeira série com o recorde pessoal', async () => {
    // O caso do #190: quem nunca fez o exercício fora desta sessão via o campo
    // abrir com a maior carga da vida dele.
    getPersonalRecord.mockResolvedValue({
      weightKg: 100,
      reps: 3,
      sessionDate: '2026-01-10T10:00:00.000Z',
    });
    renderCard();

    // O recorde continua visível como referência — é por ele que se sabe que a
    // query já respondeu e que, mesmo assim, o campo não o adotou.
    expect(await screen.findByText('🏆 Recorde: 100kg')).toBeInTheDocument();
    expect(weightField()).toHaveTextContent('0');
    expect(repsField()).toHaveTextContent('8');
  });

  it('parte da última série do exercício na sessão anterior', async () => {
    getLastSet.mockResolvedValue(
      makeSet({ id: 'set-antigo', sessionId: 'sessao-passada', weightKg: 62.5, reps: 10 }),
    );
    getPersonalRecord.mockResolvedValue({
      weightKg: 100,
      reps: 3,
      sessionDate: '2026-01-10T10:00:00.000Z',
    });
    renderCard();

    await waitFor(() => expect(weightField()).toHaveTextContent('62.5'));
    expect(repsField()).toHaveTextContent('10');
    expect(screen.getByText('Anterior: 62.5kg')).toBeInTheDocument();
    expect(screen.queryByText(/Recorde/)).not.toBeInTheDocument();
  });

  it('herda a série anterior da própria sessão nas séries seguintes', async () => {
    getLastSet.mockResolvedValue(
      makeSet({ id: 'set-antigo', sessionId: 'sessao-passada', weightKg: 62.5, reps: 10 }),
    );
    const group = makeGroup({ sets: [makeSet({ id: 'set-1', weightKg: 70, reps: 8 })] });
    renderCard(group);

    await waitFor(() => expect(screen.getByText('Anterior: 70kg')).toBeInTheDocument());
    expect(weightField()).toHaveTextContent('70');
    expect(repsField()).toHaveTextContent('8');
  });

  it('não sobrescreve o que a pessoa digitou quando a referência chega depois', async () => {
    let resolveLastSet: (set: SessionSet | null) => void = () => undefined;
    getLastSet.mockReturnValue(
      new Promise<SessionSet | null>((resolve) => {
        resolveLastSet = resolve;
      }),
    );
    const user = userEvent.setup();
    renderCard();

    await user.click(screen.getAllByRole('button', { name: 'Aumentar' })[0]);
    expect(weightField()).toHaveTextContent('1');

    resolveLastSet(
      makeSet({ id: 'set-antigo', sessionId: 'sessao-passada', weightKg: 62.5, reps: 10 }),
    );

    await waitFor(() => expect(screen.getByText('Anterior: 62.5kg')).toBeInTheDocument());
    expect(weightField()).toHaveTextContent('1');
  });
});
