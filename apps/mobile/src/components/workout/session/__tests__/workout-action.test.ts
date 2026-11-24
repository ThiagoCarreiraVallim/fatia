import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import type { SessionSet, WorkoutSession } from '@fatia/api-client';
import {
  activeSessionKey,
  applyWorkoutAction,
  sessionKey,
  type WorkoutActionContext,
} from '../workout-action';
import type { WorkoutActionToken, WorkoutNotification } from '../workout-notification';

/**
 * O toque num botão da notificação do treino (#472): o que grava, onde, com que
 * valores, e o que a notificação mostra depois — sem depender de observer nem
 * de timer do JS, que param com o app em segundo plano.
 */
const NOW = 1_800_000_000_000;

function set(over: Partial<SessionSet> = {}): SessionSet {
  return {
    id: 'set-1',
    sessionId: 'A',
    exerciseId: 5,
    setNumber: 1,
    weightKg: 60,
    reps: 10,
    rpe: null,
    durationSeconds: null,
    distanceMeters: null,
    avgHeartRate: null,
    kcalBurned: null,
    notes: null,
    exercise: { name: 'Remada', muscleGroup: 'BACK' } as SessionSet['exercise'],
    ...over,
  };
}

function session(id: string, over: Partial<WorkoutSession> = {}): WorkoutSession {
  return {
    id,
    userId: 'u',
    planId: 'p',
    startedAt: '2026-11-24T10:00:00.000Z',
    completedAt: null,
    notes: null,
    sets: [],
    plannedExercises: [
      {
        exerciseId: 5,
        exerciseName: 'Remada',
        muscleGroup: 'BACK',
        order: 0,
        targetSets: 3,
        targetReps: '10',
      },
      {
        exerciseId: 6,
        exerciseName: 'Supino',
        muscleGroup: 'CHEST',
        order: 1,
        targetSets: 3,
        targetReps: '8',
      },
    ],
    exerciseOrder: [],
    circuit: null,
    ...over,
  };
}

function offer(over: Partial<WorkoutActionToken> = {}): WorkoutActionToken {
  return {
    sessionId: 'A',
    exerciseId: 5,
    setNumber: 1,
    after: null,
    weightKg: 62.5,
    reps: 10,
    ...over,
  };
}

function setup(server: WorkoutSession) {
  const qc = new QueryClient();
  const logged: Record<string, unknown>[] = [];
  const posted: WorkoutNotification[] = [];
  const hide = vi.fn();
  const rest = {
    deadline: null as number | null,
    total: 90,
    start: vi.fn(),
    addTime: vi.fn(),
    stop: vi.fn(),
  };
  let created = 0;
  const api = {
    getSession: vi.fn(async () => server),
    logSet: vi.fn(async (_id: string, body: Record<string, unknown>) => {
      logged.push(body);
      created += 1;
      return set({
        id: `new-${created}`,
        sessionId: server.id,
        exerciseId: body.exerciseId as number,
        setNumber: (server.sets?.length ?? 0) + created,
        weightKg: body.weightKg as number,
        reps: body.reps as number,
      });
    }),
    // A última série anterior que a tela usaria: 40 kg. O toque grava o que a
    // notificação ofereceu, não o que um cache vazio recalcularia.
    getLastSet: vi.fn(async () => set({ id: 'old', sessionId: 'old', weightKg: 40, reps: 8 })),
    getPrescription: vi.fn(async () => ({ status: 'insufficient_history' as const })),
  };
  const ctx: WorkoutActionContext = {
    qc,
    session: { id: server.id, startedAt: server.startedAt },
    rest,
    notifier: { post: (n) => posted.push(n), hide },
    units: { loadUnit: 'KG', distanceUnit: 'KM' },
    inFlight: new Set(),
    api: api as unknown as WorkoutActionContext['api'],
    now: () => NOW,
  };
  return { qc, ctx, api, logged, posted, hide, rest };
}

describe('applyWorkoutAction — Registrar série', () => {
  let a: WorkoutSession;
  beforeEach(() => {
    a = session('A');
  });

  it('grava os valores da oferta (a fila do app encerrado volta com o cache vazio)', async () => {
    const { ctx, logged } = setup(a);
    await applyWorkoutAction(ctx, { id: 'log-set', token: offer() });
    expect(logged).toEqual([{ exerciseId: 5, weightKg: 62.5, reps: 10, clientKey: 'ntf:5:1:0' }]);
  });

  it('toque de outra sessão não grava (a fila não vaza para a sessão seguinte)', async () => {
    const b = session('B');
    const { ctx, logged } = setup(b);
    await applyWorkoutAction(ctx, { id: 'log-set', token: offer({ sessionId: 'A' }) });
    expect(logged).toEqual([]);
  });

  it('sessão finalizada em outro lugar: não grava, e a notificação sai', async () => {
    const { ctx, qc, logged, hide } = setup(session('A', { completedAt: '2026-11-24T11:00:00Z' }));
    qc.setQueryData(activeSessionKey, a);
    await applyWorkoutAction(ctx, { id: 'log-set', token: offer() });
    expect(logged).toEqual([]);
    expect(hide).toHaveBeenCalled();
    expect(qc.getQueryData(activeSessionKey)).toBeNull();
  });

  it('toque velho (a série já entrou): não grava', async () => {
    const { ctx, logged } = setup(session('A', { sets: [set()] }));
    await applyWorkoutAction(ctx, { id: 'log-set', token: offer() });
    expect(logged).toEqual([]);
  });

  it('toque duplo grava uma vez só', async () => {
    const { ctx, logged } = setup(a);
    await Promise.all([
      applyWorkoutAction(ctx, { id: 'log-set', token: offer() }),
      applyWorkoutAction(ctx, { id: 'log-set', token: offer() }),
    ]);
    expect(logged).toHaveLength(1);
  });

  it('depois de gravar, reposta já a notificação da série seguinte, do que o servidor devolveu', async () => {
    const { ctx, qc, posted, rest } = setup(a);
    qc.setQueryData(activeSessionKey, a);
    await applyWorkoutAction(ctx, { id: 'log-set', token: offer() });

    expect(posted).toHaveLength(1);
    const n = posted[0]!;
    // Descansando, com o estado de depois pronto para o nativo trocar no prazo.
    expect(n.restDeadline).toBe(NOW + 90_000);
    expect(n.title).toBe('Remada · série 2 de 3');
    expect(n.next?.actions.map((x) => x.id)).toEqual(['log-set']);
    expect(n.next?.token).toEqual({
      sessionId: 'A',
      exerciseId: 5,
      setNumber: 2,
      after: 'new-1',
      weightKg: 62.5,
      reps: 10,
    });
    expect(rest.start).toHaveBeenCalledWith(90);
    // O cache já tem a série, sem esperar o refetch.
    expect(qc.getQueryData<WorkoutSession>(sessionKey('A'))?.sets?.map((s) => s.id)).toEqual([
      'new-1',
    ]);
    expect(qc.getQueryData<WorkoutSession>(activeSessionKey)?.sets?.map((s) => s.id)).toEqual([
      'new-1',
    ]);
  });

  it('a última série do exercício leva a notificação ao próximo, com a previsão dele já buscada', async () => {
    const { ctx, posted, api } = setup(
      session('A', { sets: [set({ id: 's1' }), set({ id: 's2', setNumber: 2 })] }),
    );
    await applyWorkoutAction(ctx, {
      id: 'log-set',
      token: offer({ setNumber: 3, after: 's2' }),
    });
    const next = posted[0]?.next;
    expect(posted[0]?.title).toBe('Supino · série 1 de 3');
    expect(api.getLastSet).toHaveBeenCalledWith(6, a.startedAt);
    expect(next?.token).toMatchObject({ exerciseId: 6, setNumber: 1, weightKg: 40, reps: 8 });
  });

  it('iOS (toque sem oferta): a próxima série do exercício, com os valores do servidor', async () => {
    const { ctx, logged } = setup(a);
    await applyWorkoutAction(ctx, { id: 'log-set', token: null }, 5);
    expect(logged).toEqual([{ exerciseId: 5, weightKg: 40, reps: 8, clientKey: 'ntf:5:1:0' }]);
  });
});

describe('applyWorkoutAction — descanso', () => {
  it('±15 s no descanso que corre', async () => {
    const { ctx, rest } = setup(session('A'));
    rest.deadline = NOW + 60_000;
    await applyWorkoutAction(ctx, { id: 'rest-plus', token: null });
    expect(rest.addTime).toHaveBeenCalledWith(15);
  });

  it('−15 s que passa do fim acaba o descanso, como o nativo', async () => {
    const { ctx, rest } = setup(session('A'));
    rest.deadline = NOW + 10_000;
    await applyWorkoutAction(ctx, { id: 'rest-minus', token: null });
    expect(rest.stop).toHaveBeenCalled();
    expect(rest.addTime).not.toHaveBeenCalled();
  });

  it('prazo vencido sem o tique do JS (segundo plano): "+15 s" começa um de 15 s', async () => {
    const { ctx, rest } = setup(session('A'));
    rest.deadline = NOW - 60_000;
    await applyWorkoutAction(ctx, { id: 'rest-plus', token: null });
    expect(rest.start).toHaveBeenCalledWith(15);
    expect(rest.addTime).not.toHaveBeenCalled();
  });
});
