import { planExercisesFromSession, type SessionExerciseSets } from '../helpers/plan-from-session';

/**
 * "Salvar como plano" (#381, prancha `Al-T11b`): cada exercício da sessão vira
 * uma linha do plano com as séries e as metas que a pessoa de fato fez.
 */

const set = (
  setNumber: number,
  over: Partial<SessionExerciseSets['sets'][number]> = {},
): SessionExerciseSets['sets'][number] => ({
  setNumber,
  weightKg: null,
  reps: null,
  durationSeconds: null,
  distanceMeters: null,
  ...over,
});

describe('planExercisesFromSession', () => {
  it('força: séries feitas, faixa de repetições observada e a carga da primeira série', () => {
    const [row] = planExercisesFromSession([
      {
        exerciseId: 10,
        muscleGroup: 'peito',
        sets: [
          set(2, { weightKg: 52.5, reps: 10 }),
          set(1, { weightKg: 50, reps: 10 }),
          set(3, { weightKg: 52.5, reps: 9 }),
          set(4, { weightKg: 50, reps: 9 }),
        ],
      },
    ]);
    expect(row).toEqual({
      exerciseId: 10,
      order: 1,
      targetSets: 4,
      targetReps: '9-10',
      repUnit: 'REPS',
      loadMode: 'WEIGHT',
      startLoadKg: 50,
      cardioTarget: null,
      cardioDurationSeconds: null,
      cardioDistanceMeters: null,
    });
  });

  it('repetições iguais viram um número só, e sem carga é peso do corpo', () => {
    const [row] = planExercisesFromSession([
      {
        exerciseId: 11,
        muscleGroup: 'peito',
        sets: [set(1, { reps: 12 }), set(2, { weightKg: 0, reps: 12 })],
      },
    ]);
    expect(row).toMatchObject({
      targetSets: 2,
      targetReps: '12',
      loadMode: 'BODYWEIGHT',
      startLoadKg: null,
    });
  });

  it('série por tempo (prancha) vira faixa de segundos', () => {
    const [row] = planExercisesFromSession([
      {
        exerciseId: 12,
        muscleGroup: 'core',
        sets: [set(1, { durationSeconds: 30 }), set(2, { durationSeconds: 45 })],
      },
    ]);
    expect(row).toMatchObject({ targetSets: 2, targetReps: '30-45', repUnit: 'SECONDS' });
  });

  it('cardio: a distância e o tempo feitos viram a meta de cardio (#378), por distância', () => {
    const [row] = planExercisesFromSession([
      {
        exerciseId: 20,
        muscleGroup: 'cardio',
        sets: [
          set(1, { distanceMeters: 3000, durationSeconds: 1200 }),
          set(2, { distanceMeters: 2100, durationSeconds: 720 }),
        ],
      },
    ]);
    expect(row).toEqual({
      exerciseId: 20,
      order: 1,
      targetSets: 1,
      targetReps: '',
      repUnit: 'REPS',
      loadMode: 'WEIGHT',
      startLoadKg: null,
      cardioTarget: 'DISTANCE',
      cardioDurationSeconds: 1920,
      cardioDistanceMeters: 5100,
    });
  });

  it('cardio só com tempo vira meta por tempo', () => {
    const [row] = planExercisesFromSession([
      { exerciseId: 21, muscleGroup: 'cardio', sets: [set(1, { durationSeconds: 600 })] },
    ]);
    expect(row).toMatchObject({
      cardioTarget: 'TIME',
      cardioDurationSeconds: 600,
      cardioDistanceMeters: null,
    });
  });

  it('mantém a ordem da sessão e pula exercício sem série', () => {
    const rows = planExercisesFromSession([
      { exerciseId: 30, muscleGroup: 'costas', sets: [set(1, { weightKg: 40, reps: 10 })] },
      { exerciseId: 31, muscleGroup: 'pernas', sets: [] },
      { exerciseId: 32, muscleGroup: 'cardio', sets: [set(1, { durationSeconds: 300 })] },
    ]);
    expect(rows.map((r) => [r.exerciseId, r.order])).toEqual([
      [30, 1],
      [32, 2],
    ]);
  });

  it('séries demais ficam no teto do plano', () => {
    const many = Array.from({ length: 60 }, (_, i) => set(i + 1, { reps: 5 }));
    const [row] = planExercisesFromSession([{ exerciseId: 40, muscleGroup: 'braço', sets: many }]);
    expect(row?.targetSets).toBe(50);
  });
});
