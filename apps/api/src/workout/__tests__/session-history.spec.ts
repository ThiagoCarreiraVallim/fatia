import { historyItemOf, type HistorySessionInput } from '../session-history';

/**
 * Uma linha do histórico (#381, prancha `Al-T10`): tipo, sensação, duração e o
 * resumo de força e de cardio que a tela escreve ("6 exercícios · 19 séries ·
 * 6,2 t", "Esteira · 5,1 km · 146 bpm", "5 exercícios + esteira 10 min").
 */

const BENCH = { name: 'Supino reto', muscleGroup: 'peito' };
const ROW = { name: 'Remada', muscleGroup: 'costas' };
const RUN = { name: 'Esteira', muscleGroup: 'cardio' };
const BIKE = { name: 'Bike', muscleGroup: 'cardio' };

const lift = (
  exerciseId: number,
  exercise: typeof BENCH,
  weightKg: number | null,
  reps: number,
) => ({
  exerciseId,
  weightKg,
  reps,
  durationSeconds: null,
  distanceMeters: null,
  avgHeartRate: null,
  exercise,
});

const run = (
  exerciseId: number,
  exercise: typeof RUN,
  meters: number | null,
  seconds: number | null,
  bpm: number | null,
) => ({
  exerciseId,
  weightKg: null,
  reps: null,
  durationSeconds: seconds,
  distanceMeters: meters,
  avgHeartRate: bpm,
  exercise,
});

const session = (over: Partial<HistorySessionInput> = {}): HistorySessionInput => ({
  id: 's1',
  planId: 'p1',
  startedAt: new Date('2026-11-02T21:00:00Z'),
  completedAt: new Date('2026-11-02T21:52:00Z'),
  feeling: 2,
  notes: 'Joelho ok',
  plan: { name: 'Push' },
  sets: [lift(1, BENCH, 50, 10), lift(1, BENCH, 52.5, 10), lift(2, ROW, 40, 12)],
  ...over,
});

describe('historyItemOf', () => {
  it('sessão de plano: nome do plano, tipo, duração, força e volume', () => {
    expect(historyItemOf(session())).toEqual({
      id: 's1',
      startedAt: new Date('2026-11-02T21:00:00Z'),
      completedAt: new Date('2026-11-02T21:52:00Z'),
      kind: 'plan',
      title: 'Push',
      feeling: 2,
      notes: 'Joelho ok',
      durationMinutes: 52,
      strengthExercises: 2,
      strengthSets: 3,
      volumeKg: 1505,
      cardioExercises: 0,
      cardio: null,
    });
  });

  it('treino livre só de esteira: sem título, tipo livre e o cardio somado', () => {
    const item = historyItemOf(
      session({
        planId: null,
        plan: null,
        sets: [run(9, RUN, 3000, 1200, 140), run(9, RUN, 2100, 720, 152)],
      }),
    );
    expect(item.kind).toBe('free');
    expect(item.title).toBeNull();
    expect(item.strengthExercises).toBe(0);
    expect(item.volumeKg).toBe(0);
    expect(item.cardioExercises).toBe(1);
    expect(item.cardio).toEqual({
      exerciseName: 'Esteira',
      distanceMeters: 5100,
      durationSeconds: 1920,
      avgHeartRate: 146,
    });
  });

  it('força com cardio: o cardio fica à parte e não entra no volume nem nas séries', () => {
    const item = historyItemOf(
      session({
        sets: [lift(1, BENCH, 50, 10), run(9, RUN, null, 600, null), run(8, BIKE, null, 300, null)],
      }),
    );
    expect(item.strengthExercises).toBe(1);
    expect(item.strengthSets).toBe(1);
    expect(item.volumeKg).toBe(500);
    expect(item.cardioExercises).toBe(2);
    // O primeiro cardio feito é o que a linha nomeia.
    expect(item.cardio).toEqual({
      exerciseName: 'Esteira',
      distanceMeters: null,
      durationSeconds: 600,
      avgHeartRate: null,
    });
  });

  it('sessão sem fim não tem duração', () => {
    expect(historyItemOf(session({ completedAt: null })).durationMinutes).toBeNull();
  });
});
