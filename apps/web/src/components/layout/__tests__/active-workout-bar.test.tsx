import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ReactElement } from 'react';
import { act, render as rtlRender, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { WorkoutSession } from '@fatia/api-client';

const listPlans = vi.hoisted(() => vi.fn());
vi.mock('@fatia/api-client', async (orig) => {
  const mod = await orig<typeof import('@fatia/api-client')>();
  return { ...mod, workoutApi: { ...mod.workoutApi, listPlans } };
});

/** A barra lê o nome do plano da lista de planos (a sessão não o traz). */
function render(ui: ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return rtlRender(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}
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

  it('prancha Al-T1b: exercício e série em cima, plano e relógio embaixo', async () => {
    listPlans.mockResolvedValue([{ id: 'p1', userId: 'u', name: 'Push', exercises: [] }]);
    render(
      <RestTimerProvider>
        <ActiveWorkoutBar session={SESSION} bottom={100} />
      </RestTimerProvider>,
    );
    expect(screen.getByText('Supino reto · série 1 de 4')).toBeInTheDocument();
    expect(await screen.findByText(/^Push · \d\d:\d\d$/)).toBeInTheDocument();
  });

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

  it('uma linha fina mostra as séries feitas contra as planejadas (#377)', () => {
    const doneSet = {
      id: 'x1',
      sessionId: 's1',
      exerciseId: 1,
      setNumber: 1,
      weightKg: 40,
      reps: 8,
      rpe: null,
      durationSeconds: null,
      distanceMeters: null,
      avgHeartRate: null,
      kcalBurned: null,
      notes: null,
    } as NonNullable<WorkoutSession['sets']>[number];
    render(
      <RestTimerProvider>
        <ActiveWorkoutBar session={{ ...SESSION, sets: [doneSet] }} bottom={100} />
      </RestTimerProvider>,
    );
    const bar = screen.getByRole('progressbar', { name: 'Séries do treino' });
    expect(bar).toHaveAttribute('aria-valuenow', '1');
    expect(bar).toHaveAttribute('aria-valuemax', '4');
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

  it('circuito (#380): o relógio e os rounds do circuito, e o toque volta ao relógio', () => {
    const startedAt = new Date(Date.now() - 198_000).toISOString();
    const circuitSession = {
      ...SESSION,
      planId: 'c1',
      startedAt,
      circuit: {
        version: 1,
        definition: {
          format: 'AMRAP',
          name: 'AMRAP 12',
          config: { durationSeconds: 720 },
          exercises: [
            { exerciseId: 1, name: 'Burpee', muscleGroup: 'cardio', unit: 'REPS', target: 10 },
          ],
        },
        startedAt,
        events: [{ type: 'round', at: Date.now() - 100_000 }],
        result: null,
      },
    } as WorkoutSession;
    render(
      <RestTimerProvider>
        <ActiveWorkoutBar session={circuitSession} bottom={100} />
      </RestTimerProvider>,
    );
    const link = screen.getByRole('link', { name: /^Treino em andamento: AMRAP 12, 1 rounds/ });
    expect(link).toHaveAttribute('href', '/workout/circuit/s1');
    expect(screen.queryByRole('progressbar')).toBeNull();
  });
});
