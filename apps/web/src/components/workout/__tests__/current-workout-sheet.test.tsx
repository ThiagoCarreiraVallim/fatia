import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ExerciseGroup, SessionSet } from '@fatia/api-client';
import { CurrentWorkoutSheet } from '../current-workout-sheet';

vi.mock('@fatia/api-client', async () => {
  const actual = await vi.importActual<typeof import('@fatia/api-client')>('@fatia/api-client');
  return { ...actual, workoutApi: { ...actual.workoutApi, logSet: vi.fn() } };
});

import { workoutApi } from '@fatia/api-client';
const logSet = vi.mocked(workoutApi.logSet);

const set = (id: string, exerciseId: number): SessionSet =>
  ({
    id,
    sessionId: 's1',
    exerciseId,
    setNumber: 1,
    weightKg: 40,
    reps: 10,
    rpe: null,
    durationSeconds: null,
    distanceMeters: null,
    avgHeartRate: null,
  }) as SessionSet;

const group = (exerciseId: number, name: string, sets: SessionSet[]): ExerciseGroup => ({
  exerciseId,
  exerciseName: name,
  isCardio: false,
  sets,
  targetSets: 3,
  targetReps: '10',
  isPlanned: true,
});

function renderSheet() {
  const onMove = vi.fn();
  const onStart = vi.fn();
  render(
    <QueryClientProvider client={new QueryClient()}>
      <CurrentWorkoutSheet
        open
        onOpenChange={() => undefined}
        sessionId="s1"
        groups={[group(1, 'Supino', [set('a', 1)]), group(2, 'Remada', [])]}
        onAddExercise={() => undefined}
        onRemove={() => undefined}
        onFinish={() => undefined}
        onMove={onMove}
        onStart={onStart}
      />
    </QueryClientProvider>,
  );
  return { onMove, onStart };
}

describe('Treino atual (#377, Al-T17)', () => {
  it('muda a ordem do treino com as setas, só desta sessão', async () => {
    const user = userEvent.setup();
    const { onMove } = renderSheet();

    expect(screen.getByRole('button', { name: 'Subir Supino' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Descer Remada' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Descer Supino' }));
    expect(onMove).toHaveBeenCalledWith(1, 'down');
    await user.click(screen.getByRole('button', { name: 'Subir Remada' }));
    expect(onMove).toHaveBeenCalledWith(2, 'up');
  });

  it('"+ Série" sem série para copiar leva à sessão, e não grava uma série vazia', async () => {
    const user = userEvent.setup();
    const { onStart } = renderSheet();

    await user.click(screen.getByRole('button', { name: 'Mais uma série de Remada' }));
    expect(onStart).toHaveBeenCalledWith(2);
    expect(logSet).not.toHaveBeenCalled();
  });
});
