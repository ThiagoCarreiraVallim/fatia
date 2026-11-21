import { apiFetch } from './http';
import type { MealType, NutrientProgress } from './nutrition';
import { GOAL_RANGES } from './onboarding';
import type { GoalsInput } from './users';

/**
 * Plano alimentar do profissional, lado do aluno (#376, ADR 045), e os
 * formulários das metas do dia e dos nutrientes (pranchas Al-N5/N5b/N5c/N6/N7).
 *
 * Tudo que é texto da tela mora aqui para o PWA e o app dizerem a mesma coisa.
 */

// ---------------------------------------------------------------------------
// Tipos (espelham `NutritionPlanService` na API)

export type NutritionPlanStatus = 'SENT' | 'ACCEPTED' | 'SUPERSEDED';

export interface PlanFood {
  id: string;
  foodName: string;
  grams: number;
  portionLabel: string | null;
  portionQuantity: number | null;
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}

export interface PlanSwap {
  id: string;
  equivalentId: string;
  foodName: string;
  grams: number;
  kcal: number;
}

export interface PlanItem extends PlanFood {
  equivalenceGroup: string | null;
  equivalents: PlanFood[];
  /** A troca ativa no dia pedido, se houver. */
  swap: PlanSwap | null;
}

export interface PlanOption {
  id: string;
  position: number;
  /** Totais com as trocas do dia aplicadas. */
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  items: PlanItem[];
}

export interface PlanMeal {
  id: string;
  mealType: MealType;
  name: string;
  /** "07:00" (#407): a hora sugerida, quando o plano tem. */
  time?: string | null;
  position: number;
  logged: { mealId: string; optionId: string } | null;
  options: PlanOption[];
}

export interface PlanGoals {
  kcalMin: number;
  kcalMax: number;
  proteinMinG: number;
  proteinMaxG: number;
  carbsMinG: number;
  carbsMaxG: number;
  fatMinG: number;
  fatMaxG: number;
}

export interface NutritionPlan {
  id: string;
  version: number;
  status: NutritionPlanStatus;
  author: { name: string } | null;
  sentAt: string;
  acceptedAt: string | null;
  goals: PlanGoals;
  applyGoals: boolean;
  note: string | null;
  /** "O que mudou" (#405), da versão 2 em diante. */
  changeNote: string | null;
  meals: PlanMeal[];
}

export interface NutritionPlanOverview {
  date: string;
  active: NutritionPlan | null;
  pending: NutritionPlan | null;
  /** Alguém da equipe (ativo, com Alimentação liberada) vê o diário. */
  teamSees: boolean;
  viewerName: string | null;
  week: { inRangeDays: number; days: number };
}

export interface PlanSwapResult {
  swap: PlanSwap & { itemId: string; date: string };
  replaced: string;
  teamSees: boolean;
  viewerName: string | null;
}

export const nutritionPlanApi = {
  get: (date?: string) =>
    apiFetch<NutritionPlanOverview>(`/api/nutrition/plan${date ? `?date=${date}` : ''}`),
  accept: (planId: string) =>
    apiFetch<NutritionPlan>('/api/nutrition/plan/accept', {
      method: 'POST',
      body: JSON.stringify({ planId }),
    }),
  logMeal: (planMealId: string, body: { optionId?: string; eatenAt?: string } = {}) =>
    apiFetch<{ mealId: string; date: string }>(
      `/api/nutrition/plan/meals/${encodeURIComponent(planMealId)}/log`,
      { method: 'POST', body: JSON.stringify(body) },
    ),
  swap: (body: { itemId: string; equivalentId: string; date?: string }) =>
    apiFetch<PlanSwapResult>('/api/nutrition/plan/swaps', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  undoSwap: (swapId: string) =>
    apiFetch<{ undone: true; restored: string }>(
      `/api/nutrition/plan/swaps/${encodeURIComponent(swapId)}`,
      { method: 'DELETE' },
    ),
};

// ---------------------------------------------------------------------------
// Número digitado (teclado decimal, vírgula do pt-BR)

const fmt = (n: number, digits = 0) =>
  n.toLocaleString('pt-BR', { maximumFractionDigits: digits, minimumFractionDigits: 0 });

/**
 * Lê um número como a pessoa digita no Brasil: `2,5`, `1.800`, `1.800,5`.
 * Sem vírgula, um ponto seguido de três dígitos é milhar (`1.800`) e qualquer
 * outro é decimal (`2.5`, do teclado em inglês). Vazio é `null`; o resto, `NaN`.
 */
export function parseTypedDecimal(text: string): number | null {
  const t = text.trim().replace(/\s/g, '');
  if (t === '') return null;
  let normalized: string;
  if (t.includes(',')) {
    if (!/^\d{1,3}(\.\d{3})*(,\d+)?$|^\d+(,\d+)?$/.test(t)) return Number.NaN;
    normalized = t.replace(/\./g, '').replace(',', '.');
  } else if (/^\d{1,3}(\.\d{3})+$/.test(t)) {
    normalized = t.replace(/\./g, '');
  } else {
    if (!/^\d+(\.\d+)?$/.test(t)) return Number.NaN;
    normalized = t;
  }
  return Number(normalized);
}

/** O inverso, para preencher o campo: vírgula decimal, sem milhar. */
export function formatDecimalInput(n: number | null): string {
  if (n == null || !Number.isFinite(n)) return '';
  return String(Math.round(n * 100) / 100).replace('.', ',');
}

const NOT_A_NUMBER = 'Digite um número, como 2,5.';
const rangeText = (min: number, max: number) =>
  `O mínimo (${fmt(min, 2)}) passa do máximo (${fmt(max, 2)}).`;

// ---------------------------------------------------------------------------
// Metas do dia (Al-N6)

/** O formulário como a pessoa digita: tudo texto, a água em litros. */
export interface GoalsDraft {
  kcalMin: string;
  kcalMax: string;
  proteinMinG: string;
  proteinMaxG: string;
  carbsMinG: string;
  carbsMaxG: string;
  fatMinG: string;
  fatMaxG: string;
  waterL: string;
  weeklyWorkouts: string;
  dailyStepsTarget: string;
}

/** Uma linha de erro por faixa (chave = o campo do mínimo) e uma por meta solta. */
export type GoalErrorKey = (typeof GOAL_RANGES)[number]['min'] | 'water' | 'workouts' | 'steps';

/** Os tetos de `GOAL_LIMITS` da API. */
const RANGE_CAP = {
  kcalMin: 10_000,
  proteinMinG: 1_000,
  carbsMinG: 1_000,
  fatMinG: 1_000,
} as const;

/** Quanto cada − e + da prancha Al-N6 anda. */
export const GOAL_STEP: Record<keyof GoalsDraft, number> = {
  kcalMin: 50,
  kcalMax: 50,
  proteinMinG: 5,
  proteinMaxG: 5,
  carbsMinG: 5,
  carbsMaxG: 5,
  fatMinG: 5,
  fatMaxG: 5,
  waterL: 0.25,
  weeklyWorkouts: 1,
  dailyStepsTarget: 500,
};

/**
 * Um passo para cima ou para baixo a partir do texto do campo, caindo no
 * múltiplo do passo (1.830 + 50 → 1.850). Vazio ou ilegível começa de zero.
 */
export function stepGoalText(text: string, step: number, direction: 1 | -1): string {
  const typed = parseTypedDecimal(text);
  const current = typed == null || Number.isNaN(typed) ? 0 : typed;
  const snapped =
    direction > 0
      ? Math.floor(current / step + 1e-9) * step + step
      : Math.ceil(current / step - 1e-9) * step - step;
  return formatDecimalInput(Math.max(0, snapped));
}

/**
 * Onde a faixa entra na barra do cartão, em % de uma escala que vai até 1,6×
 * o máximo — assim a faixa fica no meio, com folga dos dois lados.
 */
export function goalBand(minText: string, maxText: string): { left: number; width: number } | null {
  const min = parseTypedDecimal(minText);
  const max = parseTypedDecimal(maxText);
  if (min == null || max == null || Number.isNaN(min) || Number.isNaN(max)) return null;
  if (max <= 0 || min > max) return null;
  const scale = max * 1.6;
  const round = (n: number) => Math.round(n * 10) / 10;
  return { left: round((min / scale) * 100), width: round(((max - min) / scale) * 100) };
}

export function goalsToDraft(g: GoalsInput): GoalsDraft {
  return {
    kcalMin: formatDecimalInput(g.kcalMin),
    kcalMax: formatDecimalInput(g.kcalMax),
    proteinMinG: formatDecimalInput(g.proteinMinG),
    proteinMaxG: formatDecimalInput(g.proteinMaxG),
    carbsMinG: formatDecimalInput(g.carbsMinG),
    carbsMaxG: formatDecimalInput(g.carbsMaxG),
    fatMinG: formatDecimalInput(g.fatMinG),
    fatMaxG: formatDecimalInput(g.fatMaxG),
    waterL: formatDecimalInput(g.dailyWaterTargetMl / 1000),
    weeklyWorkouts: formatDecimalInput(g.weeklyWorkouts),
    dailyStepsTarget: formatDecimalInput(g.dailyStepsTarget),
  };
}

/**
 * Valida o rascunho: cada faixa com mínimo até o máximo, a água em litros, os
 * treinos de 0 a 7. Devolve as metas prontas para a API (inteiras, como ela
 * guarda) ou `null` e um erro por linha.
 */
export function parseGoalsDraft(draft: GoalsDraft): {
  goals: GoalsInput | null;
  errors: Partial<Record<GoalErrorKey, string>>;
} {
  const errors: Partial<Record<GoalErrorKey, string>> = {};
  const out: Partial<GoalsInput> = {};

  for (const r of GOAL_RANGES) {
    const min = parseTypedDecimal(draft[r.min]);
    const max = parseTypedDecimal(draft[r.max]);
    if (min == null || max == null) errors[r.min] = 'Preencha o mínimo e o máximo.';
    else if (Number.isNaN(min) || Number.isNaN(max)) errors[r.min] = NOT_A_NUMBER;
    else if (min > max) errors[r.min] = rangeText(min, max);
    else if (max > RANGE_CAP[r.min]) errors[r.min] = `Até ${fmt(RANGE_CAP[r.min])} ${r.unit}.`;
    else {
      out[r.min] = Math.round(min);
      out[r.max] = Math.round(max);
    }
  }

  const water = parseTypedDecimal(draft.waterL);
  if (water == null || Number.isNaN(water)) errors.water = NOT_A_NUMBER;
  else if (water > 10) errors.water = 'Até 10 litros.';
  else out.dailyWaterTargetMl = Math.round(water * 1000);

  const workouts = parseTypedDecimal(draft.weeklyWorkouts);
  if (workouts == null || Number.isNaN(workouts)) errors.workouts = NOT_A_NUMBER;
  else if (workouts > 7) errors.workouts = 'Entre 0 e 7 dias.';
  else out.weeklyWorkouts = Math.round(workouts);

  const steps = parseTypedDecimal(draft.dailyStepsTarget);
  if (steps == null || Number.isNaN(steps)) errors.steps = NOT_A_NUMBER;
  else if (steps > 100_000) errors.steps = 'Até 100.000 passos.';
  else out.dailyStepsTarget = Math.round(steps);

  return Object.keys(errors).length > 0
    ? { goals: null, errors }
    : { goals: out as GoalsInput, errors };
}

// ---------------------------------------------------------------------------
// Nutrientes (Al-N7)

/** Erro da faixa de um nutriente, ou `null` se ela pode ser salva. */
export function nutrientRangeError(min: number | null, max: number | null): string | null {
  if (Number.isNaN(min) || Number.isNaN(max)) return NOT_A_NUMBER;
  if (min == null && max == null) return 'Defina um mínimo ou um máximo.';
  if (min != null && max != null && min > max) return rangeText(min, max);
  return null;
}

export interface NutrientPreset {
  nutrientKey: string;
  label: string;
  unit: string;
  suggestMax?: number;
  suggestMin?: number;
}

/** Os nutrientes de um toque da tela Al-N7, com a sugestão de partida. */
export const NUTRIENT_PRESETS: readonly NutrientPreset[] = [
  { nutrientKey: 'sodium_mg', label: 'Sódio', unit: 'mg', suggestMax: 2000 },
  { nutrientKey: 'sugar_g', label: 'Açúcar', unit: 'g', suggestMax: 50 },
  { nutrientKey: 'fiber_g', label: 'Fibra', unit: 'g', suggestMin: 25 },
  { nutrientKey: 'saturated_fat_g', label: 'Gordura saturada', unit: 'g', suggestMax: 22 },
  { nutrientKey: 'caffeine_mg', label: 'Cafeína', unit: 'mg', suggestMax: 400 },
  { nutrientKey: 'cholesterol_mg', label: 'Colesterol', unit: 'mg', suggestMax: 300 },
  { nutrientKey: 'potassium_mg', label: 'Potássio', unit: 'mg', suggestMin: 3500 },
  { nutrientKey: 'calcium_mg', label: 'Cálcio', unit: 'mg', suggestMin: 1000 },
  { nutrientKey: 'iron_mg', label: 'Ferro', unit: 'mg', suggestMin: 8 },
];

/** Unidades de um nutriente que a pessoa cria. */
export const NUTRIENT_UNITS = ['g', 'mg', 'µg', 'ml'] as const;

/**
 * A chave de um nutriente que a pessoa cria ("Ômega 3" em g → `omega_3_g`).
 * Ninguém precisa digitar uma chave; vazio quando o nome não tem letra nem número.
 */
export function customNutrientKey(name: string, unit: string): string {
  const slug = name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 34); // a API aceita 40 na chave, com o sufixo da unidade
  if (!slug) return '';
  const u = unit === 'µg' ? 'mcg' : unit.toLowerCase();
  return `${slug}_${u}`;
}

/** "faltam 11 g", "passou 400 mg"… — o status do dia em palavras. */
export function nutrientStatusText(p: NutrientProgress): string {
  const amount = (n: number) => `${fmt(n, 1)} ${p.unit}`;
  if (p.status === 'none') return 'sem meta';
  if (p.status === 'under') return `faltam ${amount((p.min ?? 0) - p.total)}`;
  if (p.status === 'over') return `passou ${amount(p.total - (p.max ?? 0))}`;
  if (p.min != null && p.max != null) return 'na faixa';
  return p.min != null ? 'alvo batido' : 'dentro do limite';
}

// ---------------------------------------------------------------------------
// Plano alimentar (Al-N5, N5b, N5c)

const mid = (a: number, b: number) => Math.round((a + b) / 2);

/** O número grande do cabeçalho: o meio da faixa de kcal. */
export function planKcalPerDay(g: PlanGoals): string {
  return fmt(mid(g.kcalMin, g.kcalMax));
}

export function planMacrosLine(g: PlanGoals): string {
  return `P ${mid(g.proteinMinG, g.proteinMaxG)} · C ${mid(g.carbsMinG, g.carbsMaxG)} · G ${mid(
    g.fatMinG,
    g.fatMaxG,
  )}`;
}

/** Palavras antes do primeiro "de" vão ao plural: "2 filés pequenos", "4 col. de sopa". */
function pluralize(label: string): string {
  const words = label.split(' ');
  const cut = words.indexOf('de');
  return words
    .map((w, i) => ((cut === -1 || i < cut) && /[aeiouáéíóúâêô]$/i.test(w) ? `${w}s` : w))
    .join(' ');
}

/** A medida caseira, ou os gramas quando o plano não deu uma. */
export function planPortionText(f: Pick<PlanFood, 'grams' | 'portionLabel' | 'portionQuantity'>) {
  if (!f.portionLabel || f.portionQuantity == null) return `${fmt(f.grams, 1)} g`;
  const label = f.portionQuantity > 1 ? pluralize(f.portionLabel) : f.portionLabel;
  return `${fmt(f.portionQuantity, 2)} ${label}`;
}

export function planFoodLine(f: PlanFood): string {
  return `${planPortionText(f)} · ${fmt(Math.round(f.kcal))} kcal`;
}

export function optionTitle(o: Pick<PlanOption, 'position' | 'kcal'>): string {
  return `Opção ${o.position + 1} · ${fmt(Math.round(o.kcal))} kcal`;
}

const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

/** O que a folha de troca diz da escolha. `null` = manter o do plano. */
export function swapDiffText(item: PlanFood, equivalent: PlanFood | null): string {
  if (!equivalent) return 'É o que já está no plano.';
  const diff = Math.round(equivalent.kcal) - Math.round(item.kcal);
  if (diff === 0) return 'Mesmas calorias';
  return `${diff > 0 ? '+' : '−'}${fmt(Math.abs(diff))} kcal no dia`;
}

export function swapCtaText(item: PlanFood, equivalent: PlanFood | null): string {
  return equivalent ? `Trocar por ${lower(equivalent.foodName)}` : `Manter ${lower(item.foodName)}`;
}

/** Linha do item trocado (Al-N5c): o que entrou e no lugar de quê. */
export function swappedLine(item: PlanItem): string {
  if (!item.swap) return planFoodLine(item);
  return `${fmt(item.swap.grams, 1)} g · ${fmt(Math.round(item.swap.kcal))} kcal · no lugar de ${lower(
    item.foodName,
  )}`;
}

/**
 * O aviso depois da troca. Só diz que alguém vê quando a pessoa compartilha
 * Alimentação com quem escreveu o plano (ADR 045); o nome vem sem artigo para
 * não errar o gênero de quem atende.
 */
export function swapToastText(r: Pick<PlanSwapResult, 'teamSees' | 'viewerName'>): string {
  if (!r.teamSees) return 'Troca registrada · fica só no seu diário';
  return r.viewerName
    ? `Troca registrada · ${r.viewerName} vê no seu diário`
    : 'Troca registrada · sua equipe vê no seu diário';
}

/** "C 25 · P 4,7 · G 1,7" — na ordem da folha de troca. */
export function planFoodMacros(f: Pick<PlanFood, 'carbsG' | 'proteinG' | 'fatG'>): string {
  return `C ${fmt(f.carbsG, 1)} · P ${fmt(f.proteinG, 1)} · G ${fmt(f.fatG, 1)}`;
}

export function planWeekText(week: NutritionPlanOverview['week']): string {
  return `${week.inRangeDays}/${week.days} na semana`;
}

/** O que o diálogo de aceite avisa antes de trocar o plano e as metas. */
export function acceptPlanText(
  plan: Pick<NutritionPlan, 'applyGoals' | 'goals'>,
  replacesActive: boolean,
): string {
  const goals = plan.applyGoals
    ? `Suas metas do dia passam a ser ${fmt(plan.goals.kcalMin)}–${fmt(plan.goals.kcalMax)} kcal, as do plano.`
    : 'Suas metas do dia continuam as suas.';
  const old = replacesActive ? ' O plano em uso hoje sai e fica no histórico.' : '';
  return `${goals} As refeições do plano viram refeições salvas.${old}`;
}
