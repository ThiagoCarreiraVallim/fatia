import { describe, expect, it } from 'vitest';
import {
  customFoodFromForm,
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
    });
  });
});
