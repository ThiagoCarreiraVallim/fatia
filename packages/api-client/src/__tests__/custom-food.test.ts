import { describe, expect, it } from 'vitest';
import {
  customFoodFormFromLabel,
  customFoodFromForm,
  customFoodPatch,
  micronutrientFields,
  moreMicronutrients,
  customFoodSummary,
  customFoodToForm,
  emptyCustomFoodForm,
  type CustomFoodForm,
} from '../custom-food';

const rotulo = (extra: Partial<CustomFoodForm> = {}): CustomFoodForm => ({
  ...emptyCustomFoodForm(),
  name: 'Granola da casa',
  servingGrams: '40',
  kcal: '180',
  protein: '4',
  carbs: '24',
  fat: '7,2',
  ...extra,
});

describe('formulário de alimento', () => {
  it('começa por porção, que é como vem o rótulo', () => {
    expect(emptyCustomFoodForm('Pão')).toMatchObject({ name: 'Pão', basis: 'serving' });
  });

  it('por porção: converte para 100 g e cria a porção do rótulo', () => {
    expect(customFoodFromForm(rotulo())).toEqual({
      ok: true,
      input: {
        name: 'Granola da casa',
        kcalPer100g: 450,
        proteinPer100g: 10,
        carbsPer100g: 60,
        fatPer100g: 18,
        portions: [{ label: 'porção', grams: 40 }],
      },
    });
  });

  it('arredonda a uma casa e aceita vírgula na porção', () => {
    const r = customFoodFromForm(rotulo({ servingGrams: '30', kcal: '100', fat: '1' }));
    expect(r.ok && r.input).toMatchObject({
      kcalPer100g: 333.3,
      fatPer100g: 3.3,
      portions: [{ label: 'porção', grams: 30 }],
    });
    const meia = customFoodFromForm(
      rotulo({ servingGrams: '12,5', kcal: '50', protein: '1', carbs: '6', fat: '2' }),
    );
    expect(meia.ok && meia.input.portions).toEqual([{ label: 'porção', grams: 12.5 }]);
  });

  it('por 100 g: valores como estão, sem porção', () => {
    const r = customFoodFromForm(rotulo({ basis: '100g', servingGrams: '' }));
    expect(r).toEqual({
      ok: true,
      input: {
        name: 'Granola da casa',
        kcalPer100g: 180,
        proteinPer100g: 4,
        carbsPer100g: 24,
        fatPer100g: 7.2,
      },
    });
  });

  it('macros em branco valem zero; calorias não', () => {
    const r = customFoodFromForm(rotulo({ protein: '', carbs: ' ', fat: '' }));
    expect(r.ok && r.input).toMatchObject({ proteinPer100g: 0, carbsPer100g: 0, fatPer100g: 0 });

    expect(customFoodFromForm(rotulo({ kcal: '' }))).toEqual({
      ok: false,
      errors: { kcal: 'Informe as calorias.' },
    });
  });

  it('aponta cada campo inválido', () => {
    const r = customFoodFromForm(
      rotulo({ name: '  ', servingGrams: '0', kcal: 'abc', protein: '-1' }),
    );
    expect(r).toEqual({
      ok: false,
      errors: {
        name: 'Dê um nome ao alimento.',
        servingGrams: 'Informe o tamanho da porção em gramas.',
        kcal: 'Número inválido.',
        protein: 'Número inválido.',
      },
    });
  });

  it('recusa o que não cabe em 100 g, como a API', () => {
    // 450 kcal numa porção de 40 g dá 1.125 kcal em 100 g: digitou errado.
    expect(customFoodFromForm(rotulo({ kcal: '450' }))).toEqual({
      ok: false,
      errors: { kcal: 'Dá mais de 900 kcal em 100 g. Confira o valor e a porção.' },
    });
    expect(customFoodFromForm(rotulo({ protein: '30', carbs: '20', fat: '0' }))).toEqual({
      ok: false,
      errors: { macros: 'Proteína, carboidrato e gordura somam mais que o peso do alimento.' },
    });
    expect(
      customFoodFromForm(rotulo({ basis: '100g', protein: '101', carbs: '0', fat: '0' })),
    ).toEqual({ ok: false, errors: { protein: 'Passa de 100 g em 100 g.' } });
  });
});

describe('alimento salvo', () => {
  const food = {
    name: 'Granola',
    kcalPer100g: 450,
    proteinPer100g: 10,
    carbsPer100g: 60.25,
    fatPer100g: 18,
  };

  it('resume os valores por 100 g', () => {
    expect(customFoodSummary(food)).toBe('450 kcal · P 10 · C 60,3 · G 18 por 100 g');
  });

  it('volta para o formulário de edição em 100 g, com vírgula', () => {
    expect(customFoodToForm(food)).toEqual({
      name: 'Granola',
      basis: '100g',
      servingGrams: '',
      kcal: '450',
      protein: '10',
      carbs: '60,25',
      fat: '18',
      nutrients: {},
      barcode: '',
    });
  });
});

// #375: micronutrientes, código de barras e o rótulo lido pela IA.
describe('micronutrientes no formulário', () => {
  it('por porção, convertem para 100 g na mesma conta dos macros', () => {
    const r = customFoodFromForm(rotulo({ nutrients: { fiber_g: '3,6', sodium_mg: '45' } }));
    expect(r.ok && r.input.nutrients).toEqual({ fiber_g: 9, sodium_mg: 112.5 });
  });

  it('por 100 g, ficam como estão; em branco não entra (não vira zero)', () => {
    const r = customFoodFromForm(
      rotulo({ basis: '100g', nutrients: { fiber_g: '9', sodium_mg: '', sugar_g: '  ' } }),
    );
    expect(r.ok && r.input.nutrients).toEqual({ fiber_g: 9 });
  });

  it('sem nenhum micronutriente, nem manda o campo', () => {
    const r = customFoodFromForm(rotulo({ nutrients: { fiber_g: '' } }));
    expect(r.ok && 'nutrients' in r.input).toBe(false);
  });

  it('aceita "1.500" como mil e quinhentos', () => {
    const r = customFoodFromForm(rotulo({ basis: '100g', nutrients: { sodium_mg: '1.500' } }));
    expect(r.ok && r.input.nutrients).toEqual({ sodium_mg: 1500 });
  });

  it('número inválido aponta o nutriente; nunca grava NaN', () => {
    const r = customFoodFromForm(rotulo({ nutrients: { fiber_g: 'abc', sodium_mg: '-2' } }));
    expect(r).toEqual({
      ok: false,
      errors: { nutrients: { fiber_g: 'Número inválido.', sodium_mg: 'Número inválido.' } },
    });
  });

  it('nutriente em gramas que passa do peso do alimento é recusado', () => {
    // 50 g de fibra numa porção de 40 g: digitou errado.
    const r = customFoodFromForm(rotulo({ nutrients: { fiber_g: '50' } }));
    expect(r.ok).toBe(false);
    expect(!r.ok && r.errors.nutrients?.fiber_g).toMatch(/100 g/);
  });

  it('porção zero não divide por zero: aponta a porção', () => {
    const r = customFoodFromForm(rotulo({ servingGrams: '0', nutrients: { fiber_g: '3' } }));
    expect(r.ok).toBe(false);
    expect(!r.ok && r.errors.servingGrams).toBeDefined();
  });

  it('por 100 g com porção informada: cria a medida do rótulo também', () => {
    const r = customFoodFromForm(rotulo({ basis: '100g', servingGrams: '170' }));
    expect(r.ok && r.input.portions).toEqual([{ label: 'porção', grams: 170 }]);
  });
});

describe('código de barras no formulário', () => {
  it('vai junto quando ligado; espaço some', () => {
    const r = customFoodFromForm(rotulo({ barcode: ' 7891000100103 ' }));
    expect(r.ok && r.input.barcode).toBe('7891000100103');
  });

  it('código inválido aponta o campo', () => {
    expect(customFoodFromForm(rotulo({ barcode: '12ab' }))).toEqual({
      ok: false,
      errors: { barcode: 'O código tem de 8 a 14 números.' },
    });
  });

  it('a edição desliga código e micronutrientes com null, e não manda porções', () => {
    const r = customFoodFromForm(rotulo());
    expect(r.ok && customFoodPatch(r.input)).toEqual({
      name: 'Granola da casa',
      kcalPer100g: 450,
      proteinPer100g: 10,
      carbsPer100g: 60,
      fatPer100g: 18,
      nutrients: null,
      barcode: null,
    });
  });

  it('volta para a edição com micronutrientes e código', () => {
    const form = customFoodToForm({
      name: 'Granola',
      kcalPer100g: 450,
      proteinPer100g: 10,
      carbsPer100g: 60,
      fatPer100g: 18,
      nutrients: { fiber_g: 9.5 },
      barcode: '7891000100103',
    });
    expect(form.nutrients).toEqual({ fiber_g: '9,5' });
    expect(form.barcode).toBe('7891000100103');
  });
});

describe('campos de micronutriente', () => {
  const metas = [
    { nutrientKey: 'caffeine_mg', label: 'Cafeína', unit: 'mg' },
    { nutrientKey: 'sodium_mg', label: 'Sódio', unit: 'mg' },
  ];

  it('os nutrientes da pessoa vêm primeiro, marcados; depois os do rótulo, sem repetir', () => {
    const fields = micronutrientFields(metas, {});
    expect(fields.map((f) => [f.key, f.mine])).toEqual([
      ['caffeine_mg', true],
      ['sodium_mg', true],
      ['fiber_g', false],
      ['sugar_g', false],
      ['saturated_fat_g', false],
    ]);
  });

  it('nutriente já preenchido fora da lista aparece, e sai do "adicionar outro"', () => {
    const fields = micronutrientFields([], { calcium_mg: '120' });
    expect(fields.map((f) => f.key)).toContain('calcium_mg');
    expect(moreMicronutrients(fields).map((f) => f.key)).not.toContain('calcium_mg');
    expect(moreMicronutrients(fields).map((f) => f.key)).toContain('iron_mg');
  });
});

describe('rótulo lido pela IA → formulário', () => {
  const lido = {
    name: 'Iogurte natural',
    basis: '100g' as const,
    servingGrams: 170,
    kcal: 51,
    proteinG: 4.1,
    carbsG: 5.3,
    fatG: null,
    fiberG: 0,
    sodiumMg: 60,
    note: null,
  };

  it('preenche o que veio; o que não veio fica em branco, nunca "0"', () => {
    const form = customFoodFormFromLabel(lido, '7891000100103');
    expect(form).toMatchObject({
      name: 'Iogurte natural',
      basis: '100g',
      servingGrams: '170',
      kcal: '51',
      protein: '4,1',
      carbs: '5,3',
      fat: '',
      barcode: '7891000100103',
      nutrients: { fiber_g: '0', sodium_mg: '60' },
    });
  });

  it('sem nome nem código, os campos ficam vazios para a pessoa digitar', () => {
    const form = customFoodFormFromLabel({ ...lido, name: null, basis: 'serving' });
    expect(form).toMatchObject({ name: '', basis: 'serving', barcode: '' });
  });
});
