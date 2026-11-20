import {
  equivalentAmount,
  keyAmount,
  rangesToTargets,
  roundToHousehold,
  scaleAmount,
  targetsToRanges,
} from '../helpers/equivalents';

/** Por 100 g: o bastante para as contas, sem depender da TACO. */
const arroz = { kcalPer100g: 128, proteinPer100g: 2.5, carbsPer100g: 28, fatPer100g: 0.2 };
const batata = { kcalPer100g: 86, proteinPer100g: 0.6, carbsPer100g: 20, fatPer100g: 0.1 };
const pao = { kcalPer100g: 248, proteinPer100g: 9.4, carbsPer100g: 50, fatPer100g: 3.4 };
const frango = { kcalPer100g: 159, proteinPer100g: 32, carbsPer100g: 0, fatPer100g: 2.5 };

const UNIDADE = [{ label: 'unidade média', grams: 130 }];
const FATIA = [{ label: 'fatia', grams: 25 }];

describe('equivalentes do plano alimentar (#407)', () => {
  it('mede o macro-chave da quantidade', () => {
    expect(keyAmount(arroz, 100, 'carbs')).toBeCloseTo(28);
    expect(keyAmount(frango, 120, 'protein')).toBeCloseTo(38.4);
    expect(keyAmount(pao, 50, 'kcal')).toBeCloseTo(124);
  });

  it('acha a quantidade com o mesmo carboidrato e cai na medida caseira dentro de ±10%', () => {
    // 28 g de carboidrato = 140 g de batata; 1 unidade média (130 g) dá 26 g (−7%).
    expect(equivalentAmount(batata, 28, UNIDADE, 'carbs')).toEqual({
      grams: 130,
      portionLabel: 'unidade média',
      portionQuantity: 1,
    });
  });

  it('sem medida caseira que caiba em ±10%, arredonda as gramas a 5 g', () => {
    // 56 g de pão; 2 fatias (50 g) dão −10,7% e 2½ (62,5 g) +11,6%: nenhuma cabe.
    expect(equivalentAmount(pao, 28, FATIA, 'carbs')).toEqual({
      grams: 55,
      portionLabel: null,
      portionQuantity: null,
    });
  });

  it('alimento sem o macro-chave não serve de troca', () => {
    expect(equivalentAmount(frango, 28, [], 'carbs')).toBeNull();
  });

  it('a medida mais próxima vence entre as que cabem', () => {
    const medidas = [
      { label: 'colher de sopa', grams: 25 },
      { label: 'escumadeira', grams: 90 },
    ];
    // 100 g exatos: 4 colheres (100 g) empata em cheio; a escumadeira (90 g) fica a −10%.
    expect(roundToHousehold(arroz, 100, medidas, 'carbs')).toEqual({
      grams: 100,
      portionLabel: 'colher de sopa',
      portionQuantity: 4,
    });
  });

  it('ajustar às metas do aluno escala e volta à medida caseira', () => {
    const duasFatias = { grams: 50, portionLabel: 'fatia', portionQuantity: 2 };
    // 1.840 de 2.000 kcal: 46 g, e 2 fatias (50 g) ficam a +8,7%.
    expect(scaleAmount(pao, duasFatias, 0.92, FATIA)).toEqual(duasFatias);
    // Metade: 1 fatia.
    expect(scaleAmount(pao, duasFatias, 0.5, FATIA)).toEqual({
      grams: 25,
      portionLabel: 'fatia',
      portionQuantity: 1,
    });
    // Sem medida: gramas de 5 em 5.
    expect(
      scaleAmount(frango, { grams: 120, portionLabel: null, portionQuantity: null }, 0.92, []),
    ).toEqual({ grams: 110, portionLabel: null, portionQuantity: null });
  });

  it('metas em número viram faixas: kcal ±5%, macros ±10%, e voltam pelo meio', () => {
    const faixas = targetsToRanges({ kcal: 1840, proteinG: 140, carbsG: 190, fatG: 58 });
    expect(faixas).toEqual({
      kcalMin: 1748,
      kcalMax: 1932,
      proteinMinG: 126,
      proteinMaxG: 154,
      carbsMinG: 171,
      carbsMaxG: 209,
      fatMinG: 52,
      fatMaxG: 64,
    });
    expect(rangesToTargets(faixas)).toEqual({ kcal: 1840, proteinG: 140, carbsG: 190, fatG: 58 });
  });
});
