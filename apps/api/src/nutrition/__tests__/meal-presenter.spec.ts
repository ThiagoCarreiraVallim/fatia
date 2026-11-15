import { mealOrigin, presentMeal } from '../meal-presenter';

describe('presentMeal (#374)', () => {
  const item = (source: 'MANUAL' | 'AI' | 'PLAN' | 'BARCODE') => ({ id: source, source });

  it('diz se há foto sem devolver o id do arquivo', () => {
    const meal = presentMeal({ id: 'm1', photoFileId: 'arquivo-1', items: [item('MANUAL')] });
    expect(meal).toEqual({ id: 'm1', hasPhoto: true, origin: 'MANUAL', items: [item('MANUAL')] });
    expect(JSON.stringify(meal)).not.toContain('arquivo-1');
    expect(presentMeal({ id: 'm2', photoFileId: null, items: [] }).hasPhoto).toBe(false);
  });

  it('um item da IA faz a refeição ser da IA; sem itens é manual', () => {
    expect(mealOrigin([item('MANUAL'), item('AI'), item('PLAN')])).toBe('AI');
    expect(mealOrigin([item('MANUAL'), item('PLAN')])).toBe('PLAN');
    expect(mealOrigin([item('BARCODE'), item('MANUAL')])).toBe('BARCODE');
    expect(mealOrigin([])).toBe('MANUAL');
  });
});
