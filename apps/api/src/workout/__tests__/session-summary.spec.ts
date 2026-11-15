import { averageFeeling, feelingToRpe, rpeToFeeling } from '../helpers/feeling';
import { summarizeSession, type SummaryInput, type SummarySet } from '../session-summary';

/**
 * O "Treino feito!" (prancha `Al-T5-Fim`, #377): duração, séries, volume,
 * sensação, comparação com o último treino do mesmo plano, recordes novos,
 * músculos de hoje e a lista de exercícios com a melhor série.
 */

const BENCH = {
  id: 1,
  name: 'Supino reto com barra',
  muscleGroup: 'peito',
  primaryMuscles: ['chest'],
  secondaryMuscles: ['triceps', 'shoulders'],
};
const PRESS = {
  id: 2,
  name: 'Desenvolvimento militar',
  muscleGroup: 'ombro',
  primaryMuscles: ['shoulders'],
  secondaryMuscles: ['triceps'],
};
const RUN = {
  id: 3,
  name: 'Esteira',
  muscleGroup: 'cardio',
  primaryMuscles: ['quadriceps'],
  secondaryMuscles: [],
};

const strength = (
  exercise: typeof BENCH,
  setNumber: number,
  weightKg: number | null,
  reps: number,
  rpe: number | null = null,
): SummarySet => ({
  exerciseId: exercise.id,
  setNumber,
  weightKg,
  reps,
  rpe,
  durationSeconds: null,
  distanceMeters: null,
  avgHeartRate: null,
  exercise,
});

const cardio = (setNumber: number, km: number, min: number, bpm: number | null): SummarySet => ({
  exerciseId: RUN.id,
  setNumber,
  weightKg: null,
  reps: null,
  rpe: null,
  durationSeconds: min * 60,
  distanceMeters: km * 1000,
  avgHeartRate: bpm,
  exercise: RUN,
});

const base = (over: Partial<SummaryInput['session']> = {}): SummaryInput => ({
  session: {
    id: 's-now',
    planId: 'plan-push',
    startedAt: new Date('2026-11-14T21:02:00Z'),
    completedAt: new Date('2026-11-14T21:54:00Z'),
    feeling: null,
    notes: null,
    exerciseOrder: [],
    plan: {
      name: 'Push',
      exercises: [
        { exerciseId: BENCH.id, order: 1 },
        { exerciseId: PRESS.id, order: 2 },
      ],
    },
    sets: [
      strength(BENCH, 1, 50, 10, 7),
      strength(BENCH, 2, 52.5, 10, 8),
      strength(PRESS, 1, 35, 8, 8),
      strength(PRESS, 2, 32.5, 8, 9),
      cardio(1, 2.4, 15, 138),
    ],
    ...over,
  },
  previous: {
    id: 's-before',
    startedAt: new Date('2026-11-10T21:00:00Z'),
    completedAt: new Date('2026-11-10T21:55:00Z'),
    sets: [
      { weightKg: 50, reps: 10 },
      { weightKg: 50, reps: 9 },
      { weightKg: 30, reps: 10 },
    ],
  },
  priorSets: [
    { exerciseId: BENCH.id, sessionId: 's-before', weightKg: 50, reps: 10, distanceMeters: null },
    { exerciseId: PRESS.id, sessionId: 's-before', weightKg: 35, reps: 8, distanceMeters: null },
    { exerciseId: RUN.id, sessionId: 's-a', weightKg: null, reps: null, distanceMeters: 1500 },
    { exerciseId: RUN.id, sessionId: 's-a', weightKg: null, reps: null, distanceMeters: 500 },
  ],
  now: new Date('2026-11-14T22:00:00Z'),
});

describe('escala de sensação ↔ RPE', () => {
  it('Leve é RPE 6 e No limite é RPE 10, nos dois sentidos', () => {
    expect([1, 2, 3, 4, 5].map(feelingToRpe)).toEqual([6, 7, 8, 9, 10]);
    expect([6, 7, 8, 9, 10].map(rpeToFeeling)).toEqual([1, 2, 3, 4, 5]);
  });

  it('RPE fora da escala do canvas cai na ponta, e sem RPE não há sensação', () => {
    expect(rpeToFeeling(3)).toBe(1);
    expect(rpeToFeeling(null)).toBeNull();
    expect(averageFeeling([7, 9, null])).toBe(3);
    expect(averageFeeling([null])).toBeNull();
  });
});

describe('summarizeSession', () => {
  it('duração, séries e volume (só força conta no volume)', () => {
    const s = summarizeSession(base());
    expect(s.durationMinutes).toBe(52);
    expect(s.sets).toBe(5);
    // 50×10 + 52,5×10 + 35×8 + 32,5×8 = 500 + 525 + 280 + 260
    expect(s.volumeKg).toBe(1565);
    expect(s.planName).toBe('Push');
  });

  it('sessão aberta mede a duração até agora', () => {
    const s = summarizeSession(base({ completedAt: null }));
    expect(s.durationMinutes).toBe(58);
  });

  it('a sensação geral é a marcada; sem marca, a média das séries', () => {
    expect(summarizeSession(base({ feeling: 1 })).overallFeeling).toBe(1);
    const semMarca = summarizeSession(base());
    expect(semMarca.feeling).toBeNull();
    // RPE 7, 8, 8, 9 → 2, 3, 3, 4 → média 3
    expect(semMarca.overallFeeling).toBe(3);
  });

  it('compara com o último treino do mesmo plano', () => {
    const s = summarizeSession(base());
    // antes: 500 + 450 + 300 = 1250 kg, 3 séries, 55 min
    expect(s.comparison).toEqual({
      sessionId: 's-before',
      startedAt: new Date('2026-11-10T21:00:00Z'),
      volumeDeltaPct: 25,
      setsDelta: 2,
      durationDeltaMinutes: -3,
    });
  });

  it('sem treino anterior do plano, não compara', () => {
    expect(summarizeSession({ ...base(), previous: null }).comparison).toBeNull();
  });

  it('recorde novo é a melhor série acima do melhor de antes, e não a primeira vez', () => {
    const s = summarizeSession(base());
    // Supino: 52,5 × 10 bate 50 × 10. Desenvolvimento: 35 × 8 só empata.
    // Esteira: 2,4 km bate a sessão de 2 km (as séries de uma sessão somam).
    expect(s.records.map((r) => r.exerciseName)).toEqual(['Supino reto com barra', 'Esteira']);
    expect(s.records[0]).toMatchObject({ weightKg: 52.5, reps: 10 });
    expect(s.records[1]).toMatchObject({ distanceMeters: 2400, durationSeconds: 900 });

    const primeiraVez = summarizeSession({ ...base(), priorSets: [] });
    expect(primeiraVez.records).toEqual([]);
  });

  it('mesma carga com mais repetições também é recorde', () => {
    const s = summarizeSession({
      ...base(),
      priorSets: [
        { exerciseId: PRESS.id, sessionId: 'x', weightKg: 35, reps: 6, distanceMeters: null },
      ],
    });
    expect(s.records.map((r) => r.exerciseId)).toEqual([PRESS.id]);
  });

  it('músculos de hoje: séries por grupo e os músculos do diagrama, sem o cardio', () => {
    const s = summarizeSession(base());
    expect(s.muscles.groups).toEqual([
      { group: 'peito', sets: 2 },
      { group: 'ombro', sets: 2 },
    ]);
    expect(s.muscles.primary).toEqual(['chest', 'shoulders']);
    // O que já é principal não repete como secundário.
    expect(s.muscles.secondary).toEqual(['triceps']);
  });

  it('a lista de exercícios segue o plano, com a melhor série e a sensação da última', () => {
    const s = summarizeSession(base());
    expect(s.exercises.map((e) => e.exerciseName)).toEqual([
      'Supino reto com barra',
      'Desenvolvimento militar',
      'Esteira',
    ]);
    expect(s.exercises[0]).toMatchObject({
      sets: 2,
      best: { weightKg: 52.5, reps: 10 },
      feeling: 3,
      isRecord: true,
    });
    expect(s.exercises[1]).toMatchObject({ best: { weightKg: 35, reps: 8 }, feeling: 4 });
    expect(s.exercises[2]).toMatchObject({
      isCardio: true,
      best: { distanceMeters: 2400, durationSeconds: 900, avgHeartRate: 138 },
      isRecord: true,
    });
  });

  it('a ordem escolhida na sessão vence a do plano', () => {
    const s = summarizeSession(base({ exerciseOrder: [RUN.id, PRESS.id] }));
    expect(s.exercises.map((e) => e.exerciseId)).toEqual([RUN.id, PRESS.id, BENCH.id]);
  });

  it('peso do corpo: a melhor série é a de mais repetições', () => {
    const s = summarizeSession(
      base({ sets: [strength(BENCH, 1, null, 12), strength(BENCH, 2, null, 15)] }),
    );
    expect(s.exercises[0]!.best).toMatchObject({ weightKg: null, reps: 15 });
    expect(s.volumeKg).toBe(0);
  });

  it('carga 0 também é peso do corpo: mais repetições não vira recorde de carga', () => {
    const s = summarizeSession({
      ...base({ sets: [strength(BENCH, 1, 0, 15)] }),
      priorSets: [
        { exerciseId: BENCH.id, sessionId: 'x', weightKg: 0, reps: 12, distanceMeters: null },
      ],
    });
    expect(s.records).toEqual([]);
    expect(s.exercises[0]).toMatchObject({ isRecord: false });
  });
});
