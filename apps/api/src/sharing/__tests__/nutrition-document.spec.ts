import { BadRequestException } from '@nestjs/common';
import {
  buildNutritionSendInput,
  legacyNutritionView,
  parseNutritionDocument,
  readNutritionSnapshot,
  studentFactor,
  type FoodInfo,
  type NutritionSnapshotV2,
} from '../nutrition-document';

/** Alimentos da base com as medidas do catálogo, como `loadBaseFoods` devolve. */
function food(
  id: number,
  name: string,
  per100: [number, number, number, number],
  portions: FoodInfo['portions'] = [],
): FoodInfo {
  const [kcal, p, c, g] = per100;
  return {
    id,
    name,
    groupId: null,
    kcalPer100g: kcal,
    proteinPer100g: p,
    carbsPer100g: c,
    fatPer100g: g,
    nutrients: null,
    portions,
  };
}

const ARROZ = food(
  1,
  'Arroz branco cozido',
  [128, 2.5, 28, 0.2],
  [{ label: 'colher de sopa', grams: 25 }],
);
const BATATA = food(
  2,
  'Batata-doce cozida',
  [86, 0.6, 20, 0.1],
  [{ label: 'unidade média', grams: 130 }],
);
const PAO = food(3, 'Pão integral', [248, 9.4, 50, 3.4], [{ label: 'fatia', grams: 25 }]);
const FRANGO = food(4, 'Frango grelhado', [159, 32, 0, 2.5]);
const FOODS = new Map([ARROZ, BATATA, PAO, FRANGO].map((f) => [f.id, f]));

const snap = (
  f: FoodInfo,
  grams: number,
  label: string | null = null,
  q: number | null = null,
) => ({
  foodId: f.id,
  groupId: null,
  foodName: f.name,
  grams,
  kcal: 0,
  proteinG: 0,
  carbsG: 0,
  fatG: 0,
  nutrients: null,
  portionLabel: label,
  portionQuantity: q,
});

function plano(): NutritionSnapshotV2 {
  return {
    version: 2,
    targets: { kcal: 2000, proteinG: 150, carbsG: 210, fatG: 60 },
    adjustToStudent: true,
    meals: [
      {
        key: 'cafe',
        name: 'Café da manhã',
        time: '07:00',
        mealType: 'BREAKFAST',
        options: [{ items: [] }],
      },
      {
        key: 'almoco',
        name: 'Almoço',
        time: '12:30',
        mealType: null,
        options: [
          {
            items: [
              { ...snap(ARROZ, 100, 'colher de sopa', 4), key: 'arroz', groupKey: 'carb2' },
              { ...snap(FRANGO, 120), key: 'frango', groupKey: 'sozinho' },
            ],
          },
        ],
      },
    ],
    groups: [
      {
        key: 'carb2',
        name: 'Carboidrato 2',
        keyMacro: 'carbs',
        foods: [snap(ARROZ, 100), snap(BATATA, 130, 'unidade média', 1), snap(PAO, 50, 'fatia', 2)],
      },
      { key: 'sozinho', name: 'Proteína 1', keyMacro: 'protein', foods: [snap(FRANGO, 120)] },
    ],
  };
}

describe('documento do plano alimentar (#407)', () => {
  it('cada item de um grupo leva os outros alimentos com o mesmo macro-chave', () => {
    const input = buildNutritionSendInput(plano(), FOODS, {});
    const almoco = input.meals[1]!;
    expect(almoco.mealType).toBe('SNACK');
    expect(almoco.time).toBe('12:30');
    expect(almoco.key).toBe('almoco');
    const arroz = almoco.options[0]!.items[0]!;
    expect(arroz).toMatchObject({
      key: 'arroz',
      groupKey: 'carb2',
      equivalenceGroup: 'Carboidrato 2',
    });
    expect(arroz.equivalents).toEqual([
      { foodId: BATATA.id, grams: 130, portionLabel: 'unidade média', portionQuantity: 1 },
      { foodId: PAO.id, grams: 55 },
    ]);
  });

  it('grupo com um alimento só não dá troca, e refeição vazia segue vazia', () => {
    const input = buildNutritionSendInput(plano(), FOODS, {});
    const frango = input.meals[1]!.options[0]!.items[1]!;
    expect(frango.equivalents).toBeUndefined();
    expect(input.meals[0]!.options).toEqual([{ items: [] }]);
  });

  it('ajustar às metas do aluno: metas e quantidades pelo fator das kcal', () => {
    const fator = studentFactor(plano(), { kcalMin: 1748, kcalMax: 1932 });
    expect(fator).toBeCloseTo(0.92);
    const input = buildNutritionSendInput(plano(), FOODS, { factor: fator });
    expect(input.goals.kcalMin).toBe(1748);
    expect(input.goals.kcalMax).toBe(1932);
    // 92 g de arroz: 3½ colheres (87,5 g, −4,9%) ganham de 4 (100 g, +8,7%).
    const arroz = input.meals[1]!.options[0]!.items[0]!;
    expect(arroz).toMatchObject({
      grams: 87.5,
      portionLabel: 'colher de sopa',
      portionQuantity: 3.5,
    });
    // O frango sem medida: 110,4 g → 110 g.
    expect(input.meals[1]!.options[0]!.items[1]!.grams).toBe(110);
  });

  it('sem o interruptor, ou sem metas da pessoa, não ajusta', () => {
    expect(
      studentFactor({ ...plano(), adjustToStudent: false }, { kcalMin: 1500, kcalMax: 1600 }),
    ).toBe(1);
    expect(studentFactor(plano(), null)).toBe(1);
  });

  it('sem metas não se envia', () => {
    expect(() => buildNutritionSendInput({ ...plano(), targets: null }, FOODS, {})).toThrow(
      BadRequestException,
    );
  });

  it('o retrato v1 sobe para v2 e a prévia antiga sai como foi gravada', () => {
    const v1 = {
      version: 1,
      goals: {
        kcalMin: 1800,
        kcalMax: 2000,
        proteinMinG: 120,
        proteinMaxG: 140,
        carbsMinG: 200,
        carbsMaxG: 240,
        fatMinG: 50,
        fatMaxG: 70,
      },
      meals: [{ name: 'Almoço', mealType: 'LUNCH', items: [snap(ARROZ, 100)] }],
    };
    const v2 = readNutritionSnapshot(v1);
    expect(v2.targets).toEqual({ kcal: 1900, proteinG: 130, carbsG: 220, fatG: 60 });
    expect(v2.meals[0]!.options[0]!.items[0]!.key).toBe('v1-0-0');
    expect(legacyNutritionView(v1).goals).toEqual(v1.goals);
    // O v2 aparece na prévia sem a refeição vazia.
    expect(legacyNutritionView(plano()).meals.map((m) => m.name)).toEqual(['Almoço']);
  });

  it('item que aponta para um grupo que não existe é 400', () => {
    expect(() =>
      parseNutritionDocument({
        targets: null,
        meals: [
          { name: 'Almoço', options: [{ items: [{ foodId: 1, grams: 100, groupKey: 'nada' }] }] },
        ],
        groups: [],
      }),
    ).toThrow(BadRequestException);
  });
});
