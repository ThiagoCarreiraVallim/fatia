import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { configureApiClient, resetApiClient } from '../http';
import {
  amountLine,
  nutritionDocumentProblems,
  documentTotals,
  nutritionDocumentWarnings,
  foodSnap,
  groupChip,
  groupOutliers,
  groupProblem,
  groupUsage,
  groupUsageLabel,
  nextGroupName,
  nutritionCopyApi,
  targetStatus,
  toNutritionInput,
  withGrams,
  type NutritionDocument,
  type NutritionItemDoc,
} from '../nutrition-plan-editor';

const ARROZ = {
  id: 1,
  name: 'Arroz branco cozido',
  groupId: null,
  kcalPer100g: 128,
  proteinPer100g: 2.5,
  carbsPer100g: 28,
  fatPer100g: 0.2,
};
const BATATA = { ...ARROZ, id: 2, name: 'Batata-doce cozida', kcalPer100g: 86, carbsPer100g: 20 };
const FRANGO = { ...ARROZ, id: 3, name: 'Frango grelhado', kcalPer100g: 159, carbsPer100g: 0 };

const item = (
  f: typeof ARROZ,
  grams: number,
  groupKey: string | null = null,
): NutritionItemDoc => ({
  ...foodSnap(f, grams),
  key: `k-${f.id}-${grams}`,
  groupKey,
});

function doc(): NutritionDocument {
  return {
    targets: { kcal: 1840, proteinG: 140, carbsG: 190, fatG: 58 },
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
        mealType: 'LUNCH',
        options: [
          { items: [item(ARROZ, 100, 'carb2'), item(FRANGO, 120)] },
          { items: [item(BATATA, 130, 'carb2')] },
        ],
      },
      {
        key: 'jantar',
        name: 'Jantar',
        time: '19:30',
        mealType: 'DINNER',
        options: [{ items: [item(ARROZ, 100, 'carb2')] }],
      },
    ],
    groups: [
      {
        key: 'carb2',
        name: 'Carboidrato 2',
        keyMacro: 'carbs',
        foods: [foodSnap(ARROZ, 100), foodSnap(BATATA, 130), foodSnap(BATATA, 200)],
      },
      { key: 'vazio', name: 'Fruta do café', keyMacro: 'carbs', foods: [] },
    ],
  };
}

describe('editor de plano alimentar (#407)', () => {
  it('soma o dia pela opção escolhida em cada refeição (a primeira por padrão)', () => {
    // 128 + 190,8 + 128 kcal.
    expect(documentTotals(doc()).kcal).toBeCloseTo(446.8);
    // Almoço na opção 2 (batata, 111,8 kcal) + jantar (128).
    expect(documentTotals(doc(), { almoco: 1 }).kcal).toBeCloseTo(239.8);
  });

  it('diz se o total está dentro da meta (±5% das kcal) ou quanto passa', () => {
    expect(targetStatus(1826, { kcal: 1840, proteinG: 0, carbsG: 0, fatG: 0 })).toEqual({
      tone: 'ok',
      label: 'dentro da meta',
    });
    expect(targetStatus(2214, { kcal: 1840, proteinG: 0, carbsG: 0, fatG: 0 })).toEqual({
      tone: 'over',
      label: '+374 acima da meta',
    });
    expect(targetStatus(1500, { kcal: 1840, proteinG: 0, carbsG: 0, fatG: 0 })?.label).toBe(
      '−340 abaixo da meta',
    );
    expect(targetStatus(1500, null)).toBeNull();
  });

  it('o grupo conta as refeições que o usam e o selo diz quantas opções', () => {
    expect(groupUsage(doc(), 'carb2')).toBe(2);
    expect(groupUsageLabel(2)).toBe('usado em 2 refeições');
    expect(groupUsageLabel(1)).toBe('usado em 1 refeição');
    expect(groupChip(doc().groups[0]!)).toBe('Carboidrato 2 · 3 opções');
  });

  it('grupo com menos de 2 alimentos avisa que o Trocar some', () => {
    expect(groupProblem({ foods: [foodSnap(ARROZ, 100)] })).toBe(
      'Adicione ao menos 2 alimentos. Com 1 só, o botão Trocar some para o aluno.',
    );
    expect(groupProblem(doc().groups[0]!)).toBeNull();
  });

  it('marca o alimento do grupo fora de ±10% do macro-chave do primeiro', () => {
    // Arroz 100 g = 28 g de carboidrato; batata 130 g = 26 (ok); 200 g = 40 (fora).
    expect(groupOutliers(doc().groups[0]!)).toEqual([2]);
  });

  it('avisa da refeição vazia sem impedir salvar', () => {
    expect(nutritionDocumentProblems(doc())).toEqual([]);
    expect(nutritionDocumentWarnings(doc())).toContain(
      'Café da manhã: nenhum item. O aluno vê "sem sugestão".',
    );
    const semMeta = { ...doc(), targets: null };
    expect(nutritionDocumentProblems(semMeta)).toContain('Defina as calorias por dia.');
  });

  it('a quantidade sai em medida caseira e gramas', () => {
    const pao = withGrams(foodSnap(ARROZ, 100), 50, { label: 'fatia', quantity: 2 });
    expect(pao.kcal).toBeCloseTo(64);
    expect(amountLine(pao)).toBe('2 × fatia · 50 g');
    expect(amountLine(foodSnap(FRANGO, 120))).toBe('120 g');
  });

  it('o corpo leva só alimento, quantidade e chaves', () => {
    const input = toNutritionInput(doc());
    expect(input.meals[1]!.options[0]!.items[0]).toEqual({
      foodId: 1,
      grams: 100,
      key: 'k-1-100',
      groupKey: 'carb2',
    });
    expect(input.groups[0]!.foods[0]).toEqual({ foodId: 1, grams: 100 });
  });

  it('o próximo grupo ganha o número livre', () => {
    expect(nextGroupName([{ name: 'Carboidrato 1' }, { name: 'Carboidrato 2' }], 'carbs')).toBe(
      'Carboidrato 3',
    );
    expect(nextGroupName([], 'protein')).toBe('Proteína 1');
  });

  describe('API da cópia', () => {
    const fetchMock = vi.fn();
    beforeEach(() => {
      fetchMock.mockImplementation(async () => new Response(JSON.stringify({}), { status: 200 }));
      configureApiClient({
        resolveUrl: (path) => `http://api${path}`,
        fetch: fetchMock as unknown as typeof globalThis.fetch,
      });
    });
    afterEach(() => {
      resetApiClient();
      fetchMock.mockReset();
    });

    it('lê e salva a cópia pela ficha', async () => {
      await nutritionCopyApi.get('g', 'm', 'p');
      expect(fetchMock.mock.calls[0]![0]).toBe(
        'http://api/api/groups/g/members/m/nutrition-plans/p/copy',
      );
      await nutritionCopyApi.save('g', 'm', 'p', {
        document: toNutritionInput(doc()),
        baseVersionId: 'v1',
      });
      expect(fetchMock.mock.calls[1]![1]).toMatchObject({ method: 'PUT' });
    });
  });
});
