import { buildDayNutrients } from '../helpers/day-nutrients';

describe('buildDayNutrients (#374): a faixa de cada nutriente no dia', () => {
  const goals = {
    kcalMin: 1800,
    kcalMax: 2200,
    proteinMinG: 120,
    proteinMaxG: 160,
    carbsMinG: 180,
    carbsMaxG: 260,
    fatMinG: 50,
    fatMaxG: 75,
  };
  const totals = { kcal: 1500.4, proteinG: 130, carbsG: 300, fatG: 60 };

  it('kcal e macros vêm das metas do dia, com o estado de cada um', () => {
    const out = buildDayNutrients({ totals, micros: {}, goals, targets: [] });
    expect(out.slice(0, 4)).toEqual([
      {
        key: 'kcal',
        label: 'Calorias',
        unit: 'kcal',
        value: 1500.4,
        min: 1800,
        max: 2200,
        status: 'under',
      },
      {
        key: 'protein_g',
        label: 'Proteína',
        unit: 'g',
        value: 130,
        min: 120,
        max: 160,
        status: 'ok',
      },
      {
        key: 'carbs_g',
        label: 'Carboidrato',
        unit: 'g',
        value: 300,
        min: 180,
        max: 260,
        status: 'over',
      },
      { key: 'fat_g', label: 'Gordura', unit: 'g', value: 60, min: 50, max: 75, status: 'ok' },
    ]);
  });

  it('fibra, sódio e cafeína aparecem sempre; sem meta, sem faixa', () => {
    const out = buildDayNutrients({
      totals,
      micros: { fiber_g: 12.345, sodium_mg: 2100 },
      goals: null,
      targets: [{ nutrientKey: 'sodium_mg', label: 'Sódio', unit: 'mg', min: null, max: 2000 }],
    });
    expect(out.map((n) => n.key)).toEqual([
      'kcal',
      'protein_g',
      'carbs_g',
      'fat_g',
      'fiber_g',
      'sodium_mg',
      'caffeine_mg',
    ]);
    expect(out[0]).toMatchObject({ min: null, max: null, status: 'none' });
    expect(out[4]).toMatchObject({ value: 12.35, min: null, max: null, status: 'none' });
    expect(out[5]).toMatchObject({ value: 2100, max: 2000, status: 'over' });
    expect(out[6]).toMatchObject({ label: 'Cafeína', value: 0, status: 'none' });
  });

  it('outras metas da pessoa entram depois, na ordem do rótulo', () => {
    const out = buildDayNutrients({
      totals,
      micros: { sugar_g: 30 },
      goals,
      targets: [
        { nutrientKey: 'sugar_g', label: 'Açúcar', unit: 'g', min: null, max: 25 },
        { nutrientKey: 'calcium_mg', label: 'Cálcio', unit: 'mg', min: 1000, max: null },
      ],
    });
    expect(out.slice(7)).toEqual([
      { key: 'sugar_g', label: 'Açúcar', unit: 'g', value: 30, min: null, max: 25, status: 'over' },
      {
        key: 'calcium_mg',
        label: 'Cálcio',
        unit: 'mg',
        value: 0,
        min: 1000,
        max: null,
        status: 'under',
      },
    ]);
  });
});
