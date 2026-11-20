import { formatInteger } from './format';
import { apiFetch } from './http';
import type { Food, MealType } from './nutrition';
import type { NutritionPlanStatus } from './nutrition-plan';
import { formatQuantity } from './portions';

/**
 * O editor de plano alimentar da equipe (#407, pranchas Pn-24 a Pn-24c). Tipos
 * espelham `nutrition-document.ts` e `NutritionCopyService` da API; as contas
 * da tela (totais, "dentro da meta", grupos) e os textos moram aqui para o
 * painel e o app dizerem a mesma coisa. Nada aqui é gerado pela IA (ADR 045).
 */

// ---------------------------------------------------------------------------
// Tipos

export type KeyMacro = 'carbs' | 'protein' | 'fat' | 'kcal';
export const KEY_MACROS: KeyMacro[] = ['carbs', 'protein', 'fat', 'kcal'];
export const KEY_MACRO_LABEL: Record<KeyMacro, string> = {
  carbs: 'carboidrato',
  protein: 'proteína',
  fat: 'gordura',
  kcal: 'calorias',
};

export interface NutritionTargets {
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}

export interface Macros {
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}

/** Um alimento da base com a quantidade, já com os macros (o servidor recalcula). */
export interface NutritionFoodSnap extends Macros {
  foodId: number | null;
  groupId: number | null;
  foodName: string;
  grams: number;
  nutrients: Record<string, number> | null;
  portionLabel: string | null;
  portionQuantity: number | null;
}

export interface NutritionItemDoc extends NutritionFoodSnap {
  /** Chave estável: casa o item entre versões (as trocas do aluno seguem). */
  key: string;
  groupKey: string | null;
}

export interface NutritionMealDoc {
  key: string;
  name: string;
  /** "07:00", ou nulo. */
  time: string | null;
  mealType: MealType | null;
  /** Ao menos uma; opção sem itens é a refeição "sem sugestão". */
  options: Array<{ items: NutritionItemDoc[] }>;
}

export interface EquivalenceGroupDoc {
  key: string;
  name: string;
  keyMacro: KeyMacro;
  foods: NutritionFoodSnap[];
}

/** O plano no editor (o que a API devolve e, sem os macros, o que recebe). */
export interface NutritionDocument {
  targets: NutritionTargets | null;
  adjustToStudent: boolean;
  meals: NutritionMealDoc[];
  groups: EquivalenceGroupDoc[];
}

interface FoodAmountInput {
  foodId: number;
  grams: number;
  portionLabel?: string | null;
  portionQuantity?: number | null;
}

/** O que vai no corpo: alimento, quantidade e chaves; nome e macros saem da base. */
export interface NutritionDocumentInput {
  targets: NutritionTargets | null;
  adjustToStudent?: boolean;
  meals: Array<{
    key?: string;
    name: string;
    time?: string | null;
    mealType?: MealType | null;
    options: Array<{
      items: Array<FoodAmountInput & { key?: string; groupKey?: string | null }>;
    }>;
  }>;
  groups: Array<{ key: string; name: string; keyMacro: KeyMacro; foods: FoodAmountInput[] }>;
}

/** A cópia de um aluno no editor (Pn-24c). */
export interface NutritionCopy {
  planId: string;
  membershipId: string;
  studentName: string;
  title: string;
  authorName: string | null;
  /** "Ver original": o modelo da biblioteca de onde a cópia saiu. */
  template: { id: string; title: string } | null;
  version: { id: string; version: number; status: NutritionPlanStatus };
  /** Há uma versão nova esperando o aceite da pessoa. */
  pendingUpdate: boolean;
  document: NutritionDocument;
  /** Trocas de hoje em diante que a pessoa já fez e que seguem na versão nova. */
  swapsKept: number;
}

export interface SaveNutritionCopyInput {
  document: NutritionDocumentInput;
  changeNote?: string;
  /** "Avisar a Ana no app". Padrão: avisa. */
  notify?: boolean;
  /** A versão que o editor abriu: se outra pessoa salvou depois, a API responde 409. */
  baseVersionId?: string;
}

const member = (groupId: string, membershipId: string) =>
  `/api/groups/${groupId}/members/${membershipId}`;

/** A cópia do plano alimentar pela ficha (#407): ler e salvar (versão nova). */
export const nutritionCopyApi = {
  get: (groupId: string, membershipId: string, planId: string) =>
    apiFetch<NutritionCopy>(`${member(groupId, membershipId)}/nutrition-plans/${planId}/copy`),
  save: (groupId: string, membershipId: string, planId: string, input: SaveNutritionCopyInput) =>
    apiFetch<{ planId: string; version: number }>(
      `${member(groupId, membershipId)}/nutrition-plans/${planId}/copy`,
      { method: 'PUT', body: JSON.stringify(input) },
    ),
};

// ---------------------------------------------------------------------------
// Limites (os da API)

export const MAX_PLAN_MEALS = 8;
export const MAX_MEAL_OPTIONS = 4;
export const MAX_EQUIVALENCE_GROUPS = 20;
export const MAX_GROUP_FOODS = 8;
export const MAX_MEAL_NAME = 40;
export const MAX_GROUP_NAME = 40;
/** "Dentro da meta": a mesma folga de kcal que o plano grava (±5%). */
export const KCAL_TOLERANCE = 0.05;
/** Equivalentes: a mesma quantidade do macro-chave, ±10%. */
export const EQUIVALENT_TOLERANCE = 0.1;

export const NUTRITION_DISCLAIMER =
  'Plano alimentar não é conselho clínico: quem monta responde pelo conteúdo. Só alimentos da TACO, sem sugestão da IA.';

// ---------------------------------------------------------------------------
// Contas e textos

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Chave nova para refeição, item ou grupo. */
export function newKey(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `k-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Um alimento da busca na quantidade escolhida, com os macros da regra de 3. */
export function foodSnap(
  food: Pick<
    Food,
    'id' | 'name' | 'groupId' | 'kcalPer100g' | 'proteinPer100g' | 'carbsPer100g' | 'fatPer100g'
  >,
  grams: number,
  portion?: { label: string; quantity: number } | null,
): NutritionFoodSnap {
  const r = grams / 100;
  return {
    foodId: food.id,
    groupId: food.groupId,
    foodName: food.name,
    grams,
    kcal: round2(food.kcalPer100g * r),
    proteinG: round2(food.proteinPer100g * r),
    carbsG: round2(food.carbsPer100g * r),
    fatG: round2(food.fatPer100g * r),
    nutrients: null,
    portionLabel: portion?.label ?? null,
    portionQuantity: portion ? portion.quantity : null,
  };
}

/** O mesmo alimento noutra quantidade: os macros acompanham as gramas. */
export function withGrams<T extends NutritionFoodSnap>(
  item: T,
  grams: number,
  portion?: { label: string; quantity: number } | null,
): T {
  const f = item.grams > 0 ? grams / item.grams : 0;
  return {
    ...item,
    grams,
    kcal: round2(item.kcal * f),
    proteinG: round2(item.proteinG * f),
    carbsG: round2(item.carbsG * f),
    fatG: round2(item.fatG * f),
    portionLabel: portion?.label ?? null,
    portionQuantity: portion ? portion.quantity : null,
  };
}

export function sumMacros(items: Macros[]): Macros {
  return items.reduce<Macros>(
    (a, i) => ({
      kcal: round2(a.kcal + i.kcal),
      proteinG: round2(a.proteinG + i.proteinG),
      carbsG: round2(a.carbsG + i.carbsG),
      fatG: round2(a.fatG + i.fatG),
    }),
    { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 },
  );
}

/**
 * O total do dia: em cada refeição, a opção escolhida na tela (`chosen`, pela
 * chave da refeição), ou a primeira. É o que o aluno come se seguir o plano.
 */
export function documentTotals(
  doc: Pick<NutritionDocument, 'meals'>,
  chosen: Record<string, number> = {},
): Macros {
  return sumMacros(
    doc.meals.map((m) => {
      const o = m.options[chosen[m.key] ?? 0] ?? m.options[0];
      return sumMacros(o?.items ?? []);
    }),
  );
}

/** "dentro da meta", "+374 acima da meta", "−120 abaixo da meta" (kcal ±5%). */
export function targetStatus(
  totalKcal: number,
  targets: NutritionTargets | null,
): { tone: 'ok' | 'over' | 'under'; label: string } | null {
  if (!targets || !(targets.kcal > 0)) return null;
  const total = Math.round(totalKcal);
  const folga = targets.kcal * KCAL_TOLERANCE;
  const diff = total - targets.kcal;
  if (Math.abs(diff) <= folga) return { tone: 'ok', label: 'dentro da meta' };
  return diff > 0
    ? { tone: 'over', label: `+${formatInteger(diff)} acima da meta` }
    : { tone: 'under', label: `−${formatInteger(-diff)} abaixo da meta` };
}

/** Em quantas refeições o grupo aparece (uma refeição conta uma vez). */
export function groupUsage(doc: Pick<NutritionDocument, 'meals'>, groupKey: string): number {
  return doc.meals.filter((m) =>
    m.options.some((o) => o.items.some((i) => i.groupKey === groupKey)),
  ).length;
}

export function groupUsageLabel(n: number): string {
  if (n === 0) return 'ainda sem uso';
  return n === 1 ? 'usado em 1 refeição' : `usado em ${n} refeições`;
}

/** O selo do item: "Carboidrato 2 · 5 opções". */
export function groupChip(group: Pick<EquivalenceGroupDoc, 'name' | 'foods'>): string {
  const n = group.foods.length;
  return `${group.name} · ${n} ${n === 1 ? 'opção' : 'opções'}`;
}

/** Grupo com menos de 2 alimentos não dá troca: o aluno não vê o Trocar. */
export function groupProblem(group: Pick<EquivalenceGroupDoc, 'foods'>): string | null {
  if (group.foods.length >= 2) return null;
  return group.foods.length === 0
    ? 'Grupo vazio. Adicione ao menos 2 alimentos.'
    : 'Adicione ao menos 2 alimentos. Com 1 só, o botão Trocar some para o aluno.';
}

function keyOf(f: Macros, key: KeyMacro): number {
  return key === 'kcal'
    ? f.kcal
    : key === 'protein'
      ? f.proteinG
      : key === 'carbs'
        ? f.carbsG
        : f.fatG;
}

/**
 * Alimentos do grupo fora de ±10% do macro-chave do primeiro (a referência).
 * Só aviso: no envio, o servidor acerta a quantidade de cada troca pelo item.
 */
export function groupOutliers(group: Pick<EquivalenceGroupDoc, 'foods' | 'keyMacro'>): number[] {
  const ref = group.foods[0];
  if (!ref) return [];
  const alvo = keyOf(ref, group.keyMacro);
  if (!(alvo > 0)) return [];
  return group.foods.flatMap((f, i) =>
    i > 0 && Math.abs(keyOf(f, group.keyMacro) - alvo) / alvo > EQUIVALENT_TOLERANCE + 1e-9
      ? [i]
      : [],
  );
}

/** "100 g · 4 × colher de sopa", ou "120 g". */
export function amountLine(
  item: Pick<NutritionFoodSnap, 'grams' | 'portionLabel' | 'portionQuantity'>,
): string {
  const g = `${formatInteger(Math.round(item.grams))} g`;
  if (!item.portionLabel || !item.portionQuantity) return g;
  return `${formatQuantity(item.portionQuantity)} × ${item.portionLabel} · ${g}`;
}

/** "C 28 · P 2,5 · G 0,2": macros curtos da linha do grupo. */
export function macroLine(f: Macros): string {
  const n = (v: number) => (Math.round(v * 10) / 10).toLocaleString('pt-BR');
  return `C ${n(f.carbsG)} · P ${n(f.proteinG)} · G ${n(f.fatG)}`;
}

/** O que impede salvar. Grupo com 1 alimento e refeição vazia são só aviso. */
export function nutritionDocumentProblems(doc: NutritionDocument): string[] {
  const out: string[] = [];
  if (!doc.targets || !(doc.targets.kcal > 0)) out.push('Defina as calorias por dia.');
  if (doc.meals.length > MAX_PLAN_MEALS) out.push(`Um plano tem até ${MAX_PLAN_MEALS} refeições.`);
  for (const m of doc.meals) {
    if (!m.name.trim()) out.push('Toda refeição precisa de nome.');
    if (m.time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(m.time)) {
      out.push(`O horário de ${m.name || 'uma refeição'} vai no formato 07:00.`);
    }
    for (const o of m.options) {
      for (const it of o.items) {
        if (it.foodId === null) {
          out.push(`"${it.foodName}" não é um alimento da TACO: troque antes de salvar.`);
        }
      }
    }
  }
  for (const g of doc.groups) {
    if (!g.name.trim()) out.push('Todo grupo de equivalentes precisa de nome.');
  }
  return [...new Set(out)];
}

/** Avisos que não impedem salvar (Pn-24b). */
export function nutritionDocumentWarnings(doc: NutritionDocument): string[] {
  const out: string[] = [];
  for (const m of doc.meals) {
    if (m.options.every((o) => o.items.length === 0)) {
      out.push(`${m.name}: nenhum item. O aluno vê "sem sugestão".`);
    }
  }
  for (const g of doc.groups) {
    if (groupUsage(doc, g.key) > 0 && groupProblem(g)) {
      out.push(`${g.name}: ${groupProblem(g)}`);
    }
  }
  return out;
}

const amountInput = (f: NutritionFoodSnap): FoodAmountInput => ({
  foodId: f.foodId as number,
  grams: f.grams,
  ...(f.portionLabel ? { portionLabel: f.portionLabel, portionQuantity: f.portionQuantity } : {}),
});

/** O documento da tela como corpo da API (sem nomes e macros). */
export function toNutritionInput(doc: NutritionDocument): NutritionDocumentInput {
  return {
    targets: doc.targets,
    adjustToStudent: doc.adjustToStudent,
    meals: doc.meals.map((m) => ({
      key: m.key,
      name: m.name.trim(),
      time: m.time || null,
      mealType: m.mealType,
      options: m.options.map((o) => ({
        items: o.items.map((i) => ({ ...amountInput(i), key: i.key, groupKey: i.groupKey })),
      })),
    })),
    groups: doc.groups.map((g) => ({
      key: g.key,
      name: g.name.trim(),
      keyMacro: g.keyMacro,
      foods: g.foods.map(amountInput),
    })),
  };
}

/** Move um elemento da lista uma casa para cima (-1) ou para baixo (+1). */
export function moveAt<T>(list: T[], index: number, dir: -1 | 1): T[] {
  const j = index + dir;
  if (index < 0 || j < 0 || j >= list.length) return list;
  const out = [...list];
  [out[index], out[j]] = [out[j]!, out[index]!];
  return out;
}

/** Plano novo: metas vazias e as quatro refeições de sempre, sem itens. */
export function emptyNutritionDocument(): NutritionDocument {
  const meal = (name: string, time: string, mealType: MealType): NutritionMealDoc => ({
    key: newKey(),
    name,
    time,
    mealType,
    options: [{ items: [] }],
  });
  return {
    targets: null,
    adjustToStudent: true,
    meals: [
      meal('Café da manhã', '07:00', 'BREAKFAST'),
      meal('Almoço', '12:30', 'LUNCH'),
      meal('Lanche', '16:00', 'SNACK'),
      meal('Jantar', '19:30', 'DINNER'),
    ],
    groups: [],
  };
}

/** O nome do próximo grupo: "Carboidrato 3" se já há 1 e 2. */
export function nextGroupName(
  groups: Pick<EquivalenceGroupDoc, 'name'>[],
  keyMacro: KeyMacro,
): string {
  const base =
    keyMacro === 'carbs'
      ? 'Carboidrato'
      : keyMacro === 'protein'
        ? 'Proteína'
        : keyMacro === 'fat'
          ? 'Gordura'
          : 'Troca';
  let n = 1;
  const nomes = new Set(groups.map((g) => g.name));
  while (nomes.has(`${base} ${n}`)) n += 1;
  return `${base} ${n}`;
}
