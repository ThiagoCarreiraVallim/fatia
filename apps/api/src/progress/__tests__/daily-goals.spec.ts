import { computeDailyGoals, type DailyGoalsInput } from '../helpers/daily-goals';

const GOALS = {
  kcalMin: 1800,
  kcalMax: 2200,
  proteinMinG: 120,
  proteinMaxG: 160,
  dailyStepsTarget: 8000,
  dailyWaterTargetMl: 2500,
};

const base = (over: Partial<DailyGoalsInput> = {}): DailyGoalsInput => ({
  goals: GOALS,
  consumed: { kcal: 934, proteinG: 71 },
  waterMl: 800,
  steps: 4231,
  workout: { planName: null, planned: false, completedToday: false },
  nutrients: [],
  ...over,
});

describe('computeDailyGoals (Al-H5-Metas)', () => {
  it('monta as linhas da prancha na ordem: kcal, proteína, água, passos, treino, nutrientes', () => {
    const r = computeDailyGoals(
      base({
        workout: { planName: 'Legs', planned: true, completedToday: true },
        nutrients: [
          { nutrientKey: 'fiber_g', label: 'Fibra', unit: 'g', min: 25, max: null, total: 14 },
          {
            nutrientKey: 'sodium_mg',
            label: 'Sódio',
            unit: 'mg',
            min: null,
            max: 2000,
            total: 1240,
          },
        ],
      }),
    );
    expect(r.items.map((i) => i.key)).toEqual([
      'kcal',
      'protein',
      'water',
      'steps',
      'workout',
      'nutrient:fiber_g',
      'nutrient:sodium_mg',
    ]);
    // Na prancha: treino feito e sódio abaixo do máximo — 2 de 7.
    expect(r.met).toBe(2);
    expect(r.total).toBe(7);
  });

  it('faixa conta como atingida só entre o mínimo e o máximo', () => {
    const dentro = computeDailyGoals(base({ consumed: { kcal: 2000, proteinG: 170 } }));
    expect(dentro.items.find((i) => i.key === 'kcal')?.met).toBe(true);
    // Proteína acima do máximo não é meta batida: a faixa é a meta.
    expect(dentro.items.find((i) => i.key === 'protein')?.met).toBe(false);
  });

  it('percentual: faixa contra o meio, mínimo contra o mínimo, máximo contra o máximo, teto 100', () => {
    const r = computeDailyGoals(
      base({
        nutrients: [
          { nutrientKey: 'fiber_g', label: 'Fibra', unit: 'g', min: 25, max: null, total: 14 },
          {
            nutrientKey: 'sodium_mg',
            label: 'Sódio',
            unit: 'mg',
            min: null,
            max: 2000,
            total: 3000,
          },
        ],
      }),
    );
    const pct = Object.fromEntries(r.items.map((i) => [i.key, i.percent]));
    expect(pct.kcal).toBe(47); // 934 / 2000
    expect(pct.water).toBe(32);
    expect(pct.steps).toBe(53);
    expect(pct['nutrient:fiber_g']).toBe(56);
    expect(pct['nutrient:sodium_mg']).toBe(100);
    expect(r.items.find((i) => i.key === 'nutrient:sodium_mg')?.met).toBe(false);
  });

  it('água e passos batem ao alcançar o alvo', () => {
    const r = computeDailyGoals(base({ waterMl: 2500, steps: 8000 }));
    expect(r.items.find((i) => i.key === 'water')?.met).toBe(true);
    expect(r.items.find((i) => i.key === 'steps')?.met).toBe(true);
  });

  it('treino só entra quando hoje é dia de treino (bloco) ou já houve treino', () => {
    expect(computeDailyGoals(base()).items.some((i) => i.key === 'workout')).toBe(false);
    const planejado = computeDailyGoals(
      base({ workout: { planName: 'Legs', planned: true, completedToday: false } }),
    );
    expect(planejado.items.find((i) => i.key === 'workout')).toMatchObject({
      met: false,
      percent: 0,
      planName: 'Legs',
    });
    const livre = computeDailyGoals(
      base({ workout: { planName: null, planned: false, completedToday: true } }),
    );
    expect(livre.items.find((i) => i.key === 'workout')).toMatchObject({ met: true, percent: 100 });
  });

  it('sem metas de macro, a lista fica só com o que tem alvo — sem linha inventada', () => {
    const r = computeDailyGoals(base({ goals: null }));
    expect(r.items).toEqual([]);
    expect(r).toMatchObject({ met: 0, total: 0 });
  });

  it('meta de nutriente sem mínimo nem máximo não vira linha', () => {
    const r = computeDailyGoals(
      base({
        goals: null,
        nutrients: [
          { nutrientKey: 'sugar_g', label: 'Açúcar', unit: 'g', min: null, max: null, total: 9 },
        ],
      }),
    );
    expect(r.items).toEqual([]);
  });
});
