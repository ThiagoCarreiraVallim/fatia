import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { WorkoutSession } from '@fatia/api-client';
import { ActiveWorkoutBar } from '../active-workout-bar';
import { RestTimerProvider, useSessionRestTimer } from '@/components/workout/rest-timer-provider';

/** A barra "treino em andamento" (prancha `Al-T-Cards-treino`) e o descanso global. */

const SESSION: WorkoutSession = {
  id: 's1',
  userId: 'u',
  planId: 'p1',
  startedAt: new Date(Date.now() - 5 * 60_000).toISOString(),
  completedAt: null,
  notes: null,
  sets: [],
  plannedExercises: [
    {
      exerciseId: 1,
      exerciseName: 'Supino reto',
      muscleGroup: 'peito',
      order: 1,
      targetSets: 4,
      targetReps: '8',
    },
  ],
};

/** Como a tela da sessão: começa o descanso no mesmo cronômetro que a barra lê. */
function StartRest() {
  const rest = useSessionRestTimer();
  return (
    <button type="button" onClick={() => rest.start(60)}>
      começar descanso
    </button>
  );
}

describe('ActiveWorkoutBar', () => {
  afterEach(() => vi.useRealTimers());

  it('força: exercício e série, e o toque abre a sessão', () => {
    render(
      <RestTimerProvider>
        <ActiveWorkoutBar session={SESSION} bottom={100} />
      </RestTimerProvider>,
    );
    const link = screen.getByRole('link', {
      name: /^Treino em andamento: Supino reto, série 1 de 4/,
    });
    expect(link).toHaveAttribute('href', '/workout');
    expect(screen.queryByRole('button', { name: /30 segundos/ })).toBeNull();
  });

  it('o descanso começado na sessão aparece na barra, e o +30 s mexe nele sem navegar', async () => {
    const user = userEvent.setup();
    render(
      <RestTimerProvider>
        <StartRest />
        <ActiveWorkoutBar session={SESSION} bottom={100} />
      </RestTimerProvider>,
    );
    await user.click(screen.getByRole('button', { name: 'começar descanso' }));
    expect(
      screen.getByRole('link', { name: /^Treino em andamento: Descanso/ }),
    ).toHaveAccessibleName(/01:00/);

    await user.click(screen.getByRole('button', { name: 'Mais 30 segundos de descanso' }));
    await act(async () => {
      await new Promise((r) => setTimeout(r, 600));
    });
    expect(
      screen.getByRole('link', { name: /^Treino em andamento: Descanso/ }),
    ).toHaveAccessibleName(/01:(29|30)/);
  });
});
