import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { configureApiClient, resetApiClient } from '../http';
import {
  formatDecimalInput,
  goalsToDraft,
  nutrientRangeError,
  nutrientStatusText,
  acceptPlanText,
  customNutrientKey,
  NUTRIENT_PRESETS,
  nutritionPlanApi,
  planFoodMacros,
  planWeekText,
  optionTitle,
  parseTypedDecimal,
  parseGoalsDraft,
  planFoodLine,
  planKcalPerDay,
  planMacrosLine,
  planPortionText,
  swapCtaText,
  swapDiffText,
  swapToastText,
  swappedLine,
  type PlanFood,
  type PlanItem,
} from '../nutrition-plan';

describe('número digitado', () => {
  it('aceita vírgula decimal e ponto de milhar', () => {
    expect(parseTypedDecimal('2,5')).toBe(2.5);
    expect(parseTypedDecimal(' 1.800 ')).toBe(1800);
    expect(parseTypedDecimal('1.800,5')).toBe(1800.5);
    expect(parseTypedDecimal('2.5')).toBe(2.5);
    expect(parseTypedDecimal('140')).toBe(140);
  });

  it('vazio é null; lixo é NaN', () => {
    expect(parseTypedDecimal('')).toBeNull();
    expect(parseTypedDecimal('   ')).toBeNull();
    expect(parseTypedDecimal('abc')).toBeNaN();
    expect(parseTypedDecimal('1,2,3')).toBeNaN();
    expect(parseTypedDecimal('-3')).toBeNaN();
  });

  it('volta para o campo com vírgula e sem milhar', () => {
    expect(formatDecimalInput(2.5)).toBe('2,5');
    expect(formatDecimalInput(1800)).toBe('1800');
    expect(formatDecimalInput(null)).toBe('');
  });
});

describe('metas do dia', () => {
  const goals = {
    kcalMin: 1800,
    kcalMax: 2200,
    proteinMinG: 120,
    proteinMaxG: 160,
    carbsMinG: 180,
    carbsMaxG: 260,
    fatMinG: 50,
    fatMaxG: 75,
    weeklyWorkouts: 4,
    dailyStepsTarget: 8000,
    dailyWaterTargetMl: 2500,
  };

  it('vai para o rascunho com a água em litros', () => {
    const draft = goalsToDraft(goals);
    expect(draft.kcalMin).toBe('1800');
    expect(draft.waterL).toBe('2,5');
    expect(parseGoalsDraft(draft)).toEqual({ goals, errors: {} });
  });

  it('mínimo acima do máximo vira erro nas duas pontas da linha', () => {
    const draft = { ...goalsToDraft(goals), proteinMinG: '170' };
    const { goals: parsed, errors } = parseGoalsDraft(draft);
    expect(parsed).toBeNull();
    expect(errors.proteinMinG).toBe('O mínimo (170) passa do máximo (160).');
  });

  it('campo vazio ou inválido diz qual é', () => {
    const { errors } = parseGoalsDraft({ ...goalsToDraft(goals), kcalMax: '', waterL: 'x' });
    expect(errors.kcalMin).toBe('Preencha o mínimo e o máximo.');
    expect(errors.water).toBe('Digite um número, como 2,5.');
  });

  it('arredonda o que a API guarda inteiro', () => {
    const { goals: parsed } = parseGoalsDraft({
      ...goalsToDraft(goals),
      kcalMin: '1.750,4',
      waterL: '2,25',
    });
    expect(parsed?.kcalMin).toBe(1750);
    expect(parsed?.dailyWaterTargetMl).toBe(2250);
  });

  it('treinos fora de 0–7 é erro', () => {
    const { errors } = parseGoalsDraft({ ...goalsToDraft(goals), weeklyWorkouts: '9' });
    expect(errors.workouts).toBe('Entre 0 e 7 dias.');
  });
});

describe('nutrientes', () => {
  it('mínimo e máximo: pelo menos um, e mínimo até o máximo', () => {
    expect(nutrientRangeError(null, null)).toBe('Defina um mínimo ou um máximo.');
    expect(nutrientRangeError(30, 25)).toBe('O mínimo (30) passa do máximo (25).');
    expect(nutrientRangeError(Number.NaN, 25)).toBe('Digite um número, como 2,5.');
    expect(nutrientRangeError(25, null)).toBeNull();
    expect(nutrientRangeError(25, 25)).toBeNull();
  });

  it('a lista de nutrientes é a mesma no PWA e no app, sem chave repetida', () => {
    const keys = NUTRIENT_PRESETS.map((p) => p.nutrientKey);
    expect(new Set(keys).size).toBe(keys.length);
    // Cálcio e ferro vêm da TACO; entram com a prancha Al-N7.
    expect(keys).toEqual(expect.arrayContaining(['fiber_g', 'sodium_mg', 'calcium_mg', 'iron_mg']));
  });

  it('chave do nutriente próprio sai do nome e da unidade', () => {
    expect(customNutrientKey('Ômega 3', 'g')).toBe('omega_3_g');
    expect(customNutrientKey('  Vitamina D ', 'µg')).toBe('vitamina_d_mcg');
    expect(customNutrientKey('Creatina!!', 'mg')).toBe('creatina_mg');
    expect(customNutrientKey('   ', 'mg')).toBe('');
  });

  it('o status do dia em palavras', () => {
    const base = { nutrientKey: 'k', label: 'Fibra', unit: 'g' };
    expect(nutrientStatusText({ ...base, min: 25, max: null, total: 14, status: 'under' })).toBe(
      'faltam 11 g',
    );
    expect(nutrientStatusText({ ...base, min: 25, max: null, total: 30, status: 'ok' })).toBe(
      'alvo batido',
    );
    expect(
      nutrientStatusText({
        ...base,
        unit: 'mg',
        min: null,
        max: 2000,
        total: 2400,
        status: 'over',
      }),
    ).toBe('passou 400 mg');
    expect(
      nutrientStatusText({ ...base, unit: 'mg', min: null, max: 2000, total: 1240, status: 'ok' }),
    ).toBe('dentro do limite');
    expect(nutrientStatusText({ ...base, min: 20, max: 30, total: 25, status: 'ok' })).toBe(
      'na faixa',
    );
  });
});

const food = (over: Partial<PlanFood> = {}): PlanFood => ({
  id: 'f',
  foodName: 'Pão, trigo, forma, integral',
  grams: 50,
  portionLabel: 'fatia',
  portionQuantity: 2,
  kcal: 124.4,
  proteinG: 4.7,
  carbsG: 25,
  fatG: 1.7,
  ...over,
});

describe('plano alimentar', () => {
  it('kcal/dia é o meio da faixa e os macros também', () => {
    const g = {
      kcalMin: 1760,
      kcalMax: 1920,
      proteinMinG: 130,
      proteinMaxG: 150,
      carbsMinG: 175,
      carbsMaxG: 205,
      fatMinG: 52,
      fatMaxG: 64,
    };
    expect(planKcalPerDay(g)).toBe('1.840');
    expect(planMacrosLine(g)).toBe('P 140 · C 190 · G 58');
  });

  it('medida caseira no plural, só antes do "de"', () => {
    expect(planPortionText(food())).toBe('2 fatias');
    expect(planPortionText(food({ portionLabel: 'fatia média', portionQuantity: 1 }))).toBe(
      '1 fatia média',
    );
    expect(planPortionText(food({ portionLabel: 'filé pequeno', portionQuantity: 2 }))).toBe(
      '2 filés pequenos',
    );
    expect(planPortionText(food({ portionLabel: 'col. de sopa', portionQuantity: 4 }))).toBe(
      '4 col. de sopa',
    );
    expect(planPortionText(food({ portionLabel: 'unidade', portionQuantity: 1.5 }))).toBe(
      '1,5 unidades',
    );
    expect(planPortionText(food({ portionLabel: null, portionQuantity: null }))).toBe('50 g');
  });

  it('macros do alimento, carboidrato primeiro como na prancha', () => {
    expect(planFoodMacros(food())).toBe('C 25 · P 4,7 · G 1,7');
  });

  it('dias na meta na semana', () => {
    expect(planWeekText({ inRangeDays: 5, days: 7 })).toBe('5/7 na semana');
  });

  it('o aceite diz o que muda antes de mudar', () => {
    const plan = {
      version: 2,
      applyGoals: true,
      author: { name: 'Helena Personal' },
      goals: { kcalMin: 1760, kcalMax: 1920 },
    } as never;
    expect(acceptPlanText(plan, true)).toBe(
      'Suas metas do dia passam a ser 1.760–1.920 kcal, as do plano. As refeições do plano viram refeições salvas. O plano em uso hoje sai e fica no histórico.',
    );
    expect(acceptPlanText({ ...(plan as object), applyGoals: false } as never, false)).toBe(
      'Suas metas do dia continuam as suas. As refeições do plano viram refeições salvas.',
    );
  });

  it('linha do alimento: medida e kcal', () => {
    expect(planFoodLine(food())).toBe('2 fatias · 124 kcal');
  });

  it('opção: número e kcal', () => {
    expect(optionTitle({ position: 0, kcal: 619.6 } as never)).toBe('Opção 1 · 620 kcal');
  });

  const item = (over: Partial<PlanItem> = {}): PlanItem => ({
    ...food(),
    equivalenceGroup: 'Carboidrato',
    equivalents: [],
    swap: null,
    ...over,
  });
  const tapioca = food({
    id: 'e1',
    foodName: 'Polvilho, doce',
    grams: 40,
    portionLabel: 'col. de sopa de goma',
    kcal: 136,
  });

  it('diferença de kcal da troca, com o sinal certo', () => {
    expect(swapDiffText(item(), tapioca)).toBe('+12 kcal no dia');
    expect(swapDiffText(item(), food({ kcal: 90 }))).toBe('−34 kcal no dia');
    expect(swapDiffText(item(), food({ kcal: 124 }))).toBe('Mesmas calorias');
    expect(swapDiffText(item(), null)).toBe('É o que já está no plano.');
  });

  it('botão da folha de troca', () => {
    expect(swapCtaText(item(), tapioca)).toBe('Trocar por polvilho, doce');
    expect(swapCtaText(item(), null)).toBe('Manter pão, trigo, forma, integral');
  });

  it('item trocado diz o que entrou e no lugar de quê', () => {
    const swapped = item({
      swap: { id: 's', equivalentId: 'e1', foodName: 'Polvilho, doce', grams: 40, kcal: 136 },
    });
    expect(swappedLine(swapped)).toBe('40 g · 136 kcal · no lugar de pão, trigo, forma, integral');
  });

  it('o aviso da troca só promete que alguém vê quando a pessoa compartilhou', () => {
    expect(swapToastText({ teamSees: true, viewerName: 'Helena' })).toBe(
      'Troca registrada · Helena vê no seu diário',
    );
    expect(swapToastText({ teamSees: false, viewerName: null })).toBe(
      'Troca registrada · fica só no seu diário',
    );
    // Alguém da equipe vê, mas não quem escreveu o plano: sem nome, nunca "só no diário".
    expect(swapToastText({ teamSees: true, viewerName: null })).toBe(
      'Troca registrada · sua equipe vê no seu diário',
    );
    // Nome sem compartilhamento não vaza: quem manda é o teamSees.
    expect(swapToastText({ teamSees: false, viewerName: 'Helena' })).toBe(
      'Troca registrada · fica só no seu diário',
    );
  });
});

describe('nutritionPlanApi', () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    fetchMock
      .mockReset()
      .mockImplementation(
        async () =>
          new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }),
      );
    configureApiClient({
      resolveUrl: (path) => path,
      fetch: fetchMock as unknown as typeof fetch,
    });
  });
  afterEach(() => resetApiClient());

  it('fala com as rotas do plano', async () => {
    await nutritionPlanApi.get('2026-11-15');
    await nutritionPlanApi.accept('p1');
    await nutritionPlanApi.logMeal('m1', { optionId: 'o1' });
    await nutritionPlanApi.swap({ itemId: 'i1', equivalentId: 'e1', date: '2026-11-15' });
    await nutritionPlanApi.undoSwap('s1');

    const calls = fetchMock.mock.calls.map(([url, init]) => [
      String(url),
      (init as RequestInit | undefined)?.method ?? 'GET',
      (init as RequestInit | undefined)?.body ?? null,
    ]);
    expect(calls).toEqual([
      [expect.stringContaining('/api/nutrition/plan?date=2026-11-15'), 'GET', null],
      [expect.stringContaining('/api/nutrition/plan/accept'), 'POST', '{"planId":"p1"}'],
      [expect.stringContaining('/api/nutrition/plan/meals/m1/log'), 'POST', '{"optionId":"o1"}'],
      [
        expect.stringContaining('/api/nutrition/plan/swaps'),
        'POST',
        '{"itemId":"i1","equivalentId":"e1","date":"2026-11-15"}',
      ],
      [expect.stringContaining('/api/nutrition/plan/swaps/s1'), 'DELETE', null],
    ]);
  });
});
