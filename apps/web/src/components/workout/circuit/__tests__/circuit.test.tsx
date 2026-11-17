import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { newCircuitDraft, type CircuitSessionData, type WorkoutSession } from '@fatia/api-client';
import { CircuitEditor } from '../circuit-editor';
import { CircuitRun } from '../circuit-run';

const push = vi.fn();
const replace = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace }),
  usePathname: () => '/workout/circuit/s1',
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/components/layout/bottom-nav', () => ({
  DockedPage: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DockedAction: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
// A busca de exercícios é dela mesma; aqui ela devolve dois na hora.
vi.mock('@/components/workout/add-exercise-drawer', () => ({
  AddExerciseDrawer: ({
    open,
    onAddMany,
  }: {
    open: boolean;
    onAddMany: (e: Array<{ id: number; name: string; muscleGroup: string }>) => void;
  }) =>
    open ? (
      <button
        type="button"
        onClick={() =>
          onAddMany([
            { id: 7, name: 'Burpee', muscleGroup: 'cardio' },
            { id: 8, name: 'Prancha', muscleGroup: 'core' },
          ])
        }
      >
        escolher dois
      </button>
    ) : null,
}));

vi.mock('@fatia/api-client', async () => {
  const actual = await vi.importActual<typeof import('@fatia/api-client')>('@fatia/api-client');
  return {
    ...actual,
    workoutApi: {
      ...actual.workoutApi,
      createCircuit: vi.fn(),
      updateCircuit: vi.fn(),
      startSession: vi.fn(),
      saveCircuitProgress: vi.fn(),
      finishCircuit: vi.fn(),
    },
  };
});

import { workoutApi } from '@fatia/api-client';

const createCircuit = vi.mocked(workoutApi.createCircuit);
const startSession = vi.mocked(workoutApi.startSession);
const saveCircuitProgress = vi.mocked(workoutApi.saveCircuitProgress);
const finishCircuit = vi.mocked(workoutApi.finishCircuit);

function wrap(ui: ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

beforeEach(() => {
  vi.clearAllMocks();
  saveCircuitProgress.mockResolvedValue({ events: 1 });
  finishCircuit.mockResolvedValue({ sessionId: 's1', alreadyFinished: false });
});

describe('Novo circuito (Al-T22)', () => {
  it('Tabata com dois exercícios, um em tempo: salva só os campos do formato e volta para Circuitos', async () => {
    createCircuit.mockResolvedValue({ id: 'c1' } as never);
    const user = userEvent.setup();
    wrap(<CircuitEditor initial={newCircuitDraft()} />);

    await user.click(screen.getByRole('radio', { name: /Tabata/ }));
    expect(screen.getByLabelText('Nome')).toHaveValue('Tabata');
    expect(screen.getByText('8 × 20 s / 10 s · 4 min no total')).toBeInTheDocument();

    // O número é digitável, além do −/+.
    const work = screen.getByRole('textbox', { name: 'trabalho' });
    await user.clear(work);
    await user.type(work, '30');
    await user.click(screen.getByRole('button', { name: 'Diminuir intervalos' }));

    await user.click(screen.getByRole('button', { name: 'Adicionar exercício' }));
    await user.click(screen.getByRole('button', { name: 'escolher dois' }));
    const medida = screen.getByRole('radiogroup', { name: 'Medida de Prancha' });
    await user.click(within(medida).getByRole('radio', { name: 'tempo' }));

    await user.click(screen.getByRole('button', { name: 'Salvar' }));
    await waitFor(() =>
      expect(createCircuit).toHaveBeenCalledWith({
        name: 'Tabata',
        format: 'TABATA',
        workSeconds: 30,
        restSeconds: 10,
        intervals: 7,
        exercises: [
          { exerciseId: 7, unit: 'REPS', target: 10 },
          { exerciseId: 8, unit: 'SECONDS', target: 30 },
        ],
      }),
    );
    expect(push).toHaveBeenCalledWith('/workout/plans?tab=circuitos');
  });

  it('sem exercício não salva e diz o que falta', async () => {
    const user = userEvent.setup();
    wrap(<CircuitEditor initial={newCircuitDraft()} />);
    await user.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Adicione pelo menos um exercício.');
    expect(createCircuit).not.toHaveBeenCalled();
  });

  it('"Começar agora" salva, começa a sessão e abre o relógio', async () => {
    createCircuit.mockResolvedValue({ id: 'c1' } as never);
    startSession.mockResolvedValue({ id: 's9' } as never);
    const user = userEvent.setup();
    wrap(<CircuitEditor initial={newCircuitDraft()} />);
    await user.click(screen.getByRole('button', { name: 'Adicionar exercício' }));
    await user.click(screen.getByRole('button', { name: 'escolher dois' }));
    await user.click(screen.getByRole('button', { name: /Começar agora/ }));
    await waitFor(() => expect(push).toHaveBeenCalledWith('/workout/circuit/s9'));
    expect(startSession).toHaveBeenCalledWith(expect.objectContaining({ planId: 'c1' }));
  });
});

const T0 = Date.parse('2026-11-16T10:00:00.000Z');

function session(circuit: Partial<CircuitSessionData>): WorkoutSession & {
  circuit: CircuitSessionData;
} {
  return {
    id: 's1',
    planId: 'c1',
    startedAt: new Date(T0).toISOString(),
    completedAt: null,
    sets: [],
    circuit: {
      version: 1,
      definition: {
        format: 'AMRAP',
        name: 'AMRAP 12',
        config: { durationSeconds: 720 },
        exercises: [
          { exerciseId: 1, name: 'Burpee', muscleGroup: 'cardio', unit: 'REPS', target: 10 },
          { exerciseId: 2, name: 'Prancha', muscleGroup: 'core', unit: 'SECONDS', target: 30 },
        ],
      },
      startedAt: new Date(T0).toISOString(),
      events: [],
      result: null,
      previous: null,
      ...circuit,
    },
  } as unknown as WorkoutSession & { circuit: CircuitSessionData };
}

describe('o relógio do circuito', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true, toFake: ['Date'] });
    vi.setSystemTime(T0 + 198_000);
  });
  afterEach(() => vi.useRealTimers());

  it('AMRAP (Al-T4): o tempo que resta, o toque no exercício grava, e o último fecha o round', async () => {
    const user = userEvent.setup();
    wrap(<CircuitRun session={session({})} />);
    expect(screen.getByText('AMRAP 12')).toBeInTheDocument();
    expect(screen.getByText('08:42')).toBeInTheDocument();
    expect(screen.getByText('Burpee × 10')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Terminei Burpee' }));
    await waitFor(() =>
      expect(saveCircuitProgress).toHaveBeenLastCalledWith('s1', [
        expect.objectContaining({ type: 'mark' }),
      ]),
    );
    expect(screen.getByText('Prancha × 30 s')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Terminei Prancha' }));
    expect(screen.getByText('rounds completos').nextSibling).toHaveTextContent('1');
  });

  it('"Encerrar circuito" confirma, grava com o toque de fim e abre o Treino feito', async () => {
    const user = userEvent.setup();
    wrap(<CircuitRun session={session({})} />);
    await user.click(screen.getByRole('button', { name: 'Encerrar circuito' }));
    await user.click(await screen.findByRole('button', { name: 'Encerrar' }));
    await waitFor(() => expect(finishCircuit).toHaveBeenCalled());
    const [, body] = finishCircuit.mock.calls[0];
    expect(body.events.at(-1)?.type).toBe('end');
    expect(body.result).toMatchObject({ roundsCompleted: 0, completed: false });
    await waitFor(() => expect(push).toHaveBeenCalledWith('/workout/session/s1'));
  });

  it('For Time terminado (Al-T4e): tempo final, o selo da última vez e "Salvar treino"', async () => {
    const def = {
      format: 'FOR_TIME' as const,
      name: 'For Time',
      config: { rounds: 1, restBetweenRoundsSeconds: 0 },
      exercises: session({}).circuit.definition.exercises,
    };
    wrap(
      <CircuitRun
        session={session({
          definition: def,
          events: [
            { type: 'mark', at: T0 + 60_000 },
            { type: 'mark', at: T0 + 125_000 },
          ],
          previous: {
            sessionId: 's0',
            startedAt: new Date(T0 - 86_400_000).toISOString(),
            roundsCompleted: 1,
            partialExercises: 0,
            finalTimeSeconds: 150,
            intervalsCompleted: null,
            totalReps: 10,
            elapsedSeconds: 150,
          },
        })}
      />,
    );
    expect(screen.getByText('tempo final')).toBeInTheDocument();
    expect(screen.getByText('02:05')).toBeInTheDocument();
    expect(screen.getByText('melhor que a última vez · 2:30')).toBeInTheDocument();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Salvar treino' }));
    await waitFor(() => expect(finishCircuit).toHaveBeenCalled());
    expect(finishCircuit.mock.calls[0][1].result.finalTimeSeconds).toBe(125);
  });

  it('Tabata (Al-T4b): a fase, o que vem e "Pular fase"', async () => {
    const user = userEvent.setup();
    vi.setSystemTime(T0 + 6_000);
    wrap(
      <CircuitRun
        session={session({
          definition: {
            ...session({}).circuit.definition,
            format: 'TABATA',
            name: 'Tabata de core',
            config: { workSeconds: 20, restSeconds: 10, intervals: 8 },
          },
        })}
      />,
    );
    expect(screen.getByText('TRABALHE')).toBeInTheDocument();
    expect(screen.getByText('a seguir · descanso')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Pular fase' }));
    expect(screen.getByText('DESCANSE')).toBeInTheDocument();
    await act(async () => {});
    expect(saveCircuitProgress).toHaveBeenCalledWith('s1', [
      expect.objectContaining({ type: 'skip' }),
    ]);
  });
});
