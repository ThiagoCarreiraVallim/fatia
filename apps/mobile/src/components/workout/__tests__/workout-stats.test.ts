import { describe, expect, it } from 'vitest';
import type { SessionSet, WorkoutSession } from '@fatia/api-client';
import {
  estimatePlanStats,
  formatSessionDuration,
  nextPlanOrder,
  planMoveDecision,
  pluralize,
  summarizeSession,
  swapAt,
} from '../workout-stats';

function set(partial: Partial<SessionSet> & { id: string; exerciseId: number }): SessionSet {
  return {
    sessionId: 's',
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
      id: partial.exerciseId,
      name: 'Supino',
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

function session(sets: SessionSet[]): WorkoutSession {
  return {
    id: 's',
    userId: 'u',
    planId: null,
    startedAt: '2026-01-01T10:00:00.000Z',
    completedAt: null,
    notes: null,
    sets,
  };
}

describe('formatSessionDuration', () => {
  it('marca sessão em aberto', () => {
    expect(formatSessionDuration('2026-01-01T10:00:00.000Z')).toBe('—');
    expect(formatSessionDuration('2026-01-01T10:00:00.000Z', null)).toBe('—');
  });

  it('usa minutos abaixo de uma hora', () => {
    expect(formatSessionDuration('2026-01-01T10:00:00.000Z', '2026-01-01T10:45:00.000Z')).toBe(
      '45min',
    );
  });

  it('quebra em horas e minutos', () => {
    expect(formatSessionDuration('2026-01-01T10:00:00.000Z', '2026-01-01T11:05:00.000Z')).toBe(
      '1h 5min',
    );
  });
});

describe('summarizeSession', () => {
  it('conta exercícios distintos e séries', () => {
    const s = session([
      set({ id: '1', exerciseId: 10, reps: 10, weightKg: 50 }),
      set({ id: '2', exerciseId: 10, reps: 8, weightKg: 60 }),
      set({ id: '3', exerciseId: 20, reps: 12, weightKg: 20 }),
    ]);
    expect(summarizeSession(s)).toEqual({
      uniqueExercises: 2,
      totalSets: 3,
      totalVolumeKg: 10 * 50 + 8 * 60 + 12 * 20,
    });
  });

  it('ignora séries sem carga ou sem repetições no volume', () => {
    const s = session([
      set({ id: '1', exerciseId: 10, reps: 10 }),
      set({ id: '2', exerciseId: 11, durationSeconds: 600 }),
    ]);
    expect(summarizeSession(s).totalVolumeKg).toBe(0);
  });

  it('aguenta sessão sem séries', () => {
    expect(summarizeSession({ ...session([]), sets: undefined })).toEqual({
      uniqueExercises: 0,
      totalSets: 0,
      totalVolumeKg: 0,
    });
  });
});

describe('estimatePlanStats', () => {
  it('aplica o piso de 15 minutos', () => {
    expect(estimatePlanStats([{ targetSets: 1 }])).toEqual({
      totalSets: 1,
      estDurationMinutes: 15,
      estVolumeTon: '1.5',
    });
  });

  it('conta 5 minutos por série acima do piso', () => {
    expect(estimatePlanStats([{ targetSets: 4 }, { targetSets: 3 }])).toEqual({
      totalSets: 7,
      estDurationMinutes: 35,
      estVolumeTon: '10.5',
    });
  });

  it('trata plano vazio', () => {
    expect(estimatePlanStats([])).toEqual({
      totalSets: 0,
      estDurationMinutes: 15,
      estVolumeTon: '0.0',
    });
  });
});

describe('swapAt', () => {
  it('troca com o vizinho de cima', () => {
    expect(swapAt(['a', 'b', 'c'], 1, -1)).toEqual(['b', 'a', 'c']);
  });

  it('troca com o vizinho de baixo', () => {
    expect(swapAt(['a', 'b', 'c'], 1, 1)).toEqual(['a', 'c', 'b']);
  });

  it('devolve a mesma lista nas bordas', () => {
    const list = ['a', 'b'];
    expect(swapAt(list, 0, -1)).toBe(list);
    expect(swapAt(list, 1, 1)).toBe(list);
  });

  it('não muda a lista original', () => {
    const list = ['a', 'b'];
    swapAt(list, 0, 1);
    expect(list).toEqual(['a', 'b']);
  });
});

describe('planMoveDecision', () => {
  // `order` com buracos de propósito: `addPlanExercise` usa `max + 1` e remover
  // não renumera, então plano real tem buraco.
  const list = [
    { id: 'pe-a', order: 1 },
    { id: 'pe-b', order: 5 },
    { id: 'pe-c', order: 9 },
  ];

  it('manda o `order` do vizinho, não o índice', () => {
    expect(planMoveDecision(list, 1, 1, { moveInFlight: false })?.payload).toEqual([
      { id: 'pe-b', order: 9 },
      { id: 'pe-c', order: 5 },
    ]);
    expect(planMoveDecision(list, 1, -1, { moveInFlight: false })?.payload).toEqual([
      { id: 'pe-b', order: 1 },
      { id: 'pe-a', order: 5 },
    ]);
  });

  it('recusa enquanto há troca em voo', () => {
    // Sem isto, dois toques rápidos leem o mesmo snapshot: "descer A" e depois
    // "descer B" gravam A=5, B=9 e C=5 — dois exercícios com o mesmo `order`.
    expect(planMoveDecision(list, 1, 1, { moveInFlight: true })).toBeNull();
  });

  it('recusa nas bordas', () => {
    expect(planMoveDecision(list, 0, -1, { moveInFlight: false })).toBeNull();
    expect(planMoveDecision(list, 2, 1, { moveInFlight: false })).toBeNull();
  });

  it('recusa índice fora da lista', () => {
    expect(planMoveDecision(list, -1, 1, { moveInFlight: false })).toBeNull();
    expect(planMoveDecision(list, 3, -1, { moveInFlight: false })).toBeNull();
    expect(planMoveDecision([], 0, 1, { moveInFlight: false })).toBeNull();
  });

  it('descreve o destino para o anúncio de acessibilidade', () => {
    const decision = planMoveDecision(list, 0, 1, { moveInFlight: false });
    expect(decision).toMatchObject({
      from: { id: 'pe-a' },
      to: { id: 'pe-b' },
      targetIndex: 1,
      total: 3,
    });
  });

  it('não muda a lista original', () => {
    planMoveDecision(list, 1, 1, { moveInFlight: false });
    expect(list.map((e) => e.order)).toEqual([1, 5, 9]);
  });
});

describe('nextPlanOrder', () => {
  it('começa em 1', () => {
    expect(nextPlanOrder([])).toBe(1);
  });

  it('vai depois do maior, mesmo com buracos', () => {
    expect(nextPlanOrder([{ order: 1 }, { order: 7 }, { order: 3 }])).toBe(8);
  });
});

describe('pluralize', () => {
  it('só usa o singular no 1', () => {
    expect(pluralize(1, 'exercício', 'exercícios')).toBe('exercício');
    expect(pluralize(0, 'exercício', 'exercícios')).toBe('exercícios');
    expect(pluralize(2, 'exercício', 'exercícios')).toBe('exercícios');
  });
});
