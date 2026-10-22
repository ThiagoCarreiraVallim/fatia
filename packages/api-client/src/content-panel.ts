import type {
  AdoptResult,
  GroupTip,
  NutritionGoalsInput,
  PlanLevel,
  PlanTemplate,
  TemplateKind,
  TipCategory,
} from './community-content';
import type { UserGoals } from './nutrition';

/**
 * Textos e regras dos planos prontos e dicas (Fase 7a), iguais na web e no
 * app. Quem decide o que cada papel pode é a API.
 */

export const TEMPLATE_KIND_LABEL: Record<TemplateKind, string> = {
  WORKOUT: 'Treino',
  NUTRITION: 'Nutrição',
};

export const PLAN_LEVELS: readonly PlanLevel[] = ['beginner', 'intermediate', 'advanced'];

export const PLAN_LEVEL_LABEL: Record<PlanLevel, string> = {
  beginner: 'Iniciante',
  intermediate: 'Intermediário',
  advanced: 'Avançado',
};

export const TIP_CATEGORIES: readonly TipCategory[] = ['WORKOUT', 'NUTRITION', 'HABITS', 'GENERAL'];

export const TIP_CATEGORY_LABEL: Record<TipCategory, string> = {
  WORKOUT: 'Treino',
  NUTRITION: 'Nutrição',
  HABITS: 'Hábitos',
  GENERAL: 'Geral',
};

export const MAX_TIP_BODY = 4000;
export const MAX_SUGGESTED_MEALS = 8;

/** Rascunho ou publicado, para o selo da bancada da equipe. */
export function contentStatusLabel(item: Pick<PlanTemplate | GroupTip, 'publishedAt'>): string {
  return item.publishedAt ? 'Publicado' : 'Rascunho';
}

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

/** "Treino · 6 exercícios · Intermediário" — a linha de baixo do cartão. */
export function planTemplateSummary(
  t: Pick<PlanTemplate, 'kind' | 'exercises' | 'meals' | 'goals' | 'level'>,
): string {
  const partes: string[] = [TEMPLATE_KIND_LABEL[t.kind]];
  if (t.kind === 'WORKOUT') {
    partes.push(plural(t.exercises.length, 'exercício', 'exercícios'));
  } else {
    if (t.goals) partes.push(`${t.goals.kcalMin}–${t.goals.kcalMax} kcal`);
    if (t.meals.length) partes.push(plural(t.meals.length, 'refeição', 'refeições'));
  }
  if (t.level) partes.push(PLAN_LEVEL_LABEL[t.level]);
  return partes.join(' · ');
}

export interface GoalDiffRow {
  label: string;
  current: string;
  next: string;
  changed: boolean;
}

const faixa = (min: number | null | undefined, max: number | null | undefined, unidade: string) =>
  min == null || max == null ? '—' : `${min}–${max} ${unidade}`;

/**
 * Metas de agora contra as do plano, linha a linha — o que a pessoa vê antes
 * de marcar "aplicar as metas". Sem metas atuais, a coluna da esquerda diz
 * "—", e toda linha conta como mudança.
 */
export function nutritionDiff(
  current: Pick<UserGoals, keyof NutritionGoalsInput> | null | undefined,
  next: NutritionGoalsInput,
): GoalDiffRow[] {
  const linhas: [string, keyof NutritionGoalsInput, keyof NutritionGoalsInput, string][] = [
    ['Calorias', 'kcalMin', 'kcalMax', 'kcal'],
    ['Proteína', 'proteinMinG', 'proteinMaxG', 'g'],
    ['Carboidrato', 'carbsMinG', 'carbsMaxG', 'g'],
    ['Gordura', 'fatMinG', 'fatMaxG', 'g'],
  ];
  return linhas.map(([label, min, max, unidade]) => {
    const atual = faixa(current?.[min], current?.[max], unidade);
    const nova = faixa(next[min], next[max], unidade);
    return { label, current: atual, next: nova, changed: atual !== nova };
  });
}

/** O que dizer depois de adotar. */
export function adoptResultMessage(r: AdoptResult): string {
  if (r.kind === 'WORKOUT') return 'Plano adicionado aos seus treinos.';
  const partes: string[] = [];
  if (r.mealsSaved) partes.push(`${plural(r.mealsSaved, 'refeição salva', 'refeições salvas')}`);
  if (r.mealsAlreadySaved) partes.push('as refeições já estavam salvas');
  if (r.goalsApplied) partes.push('metas atualizadas');
  if (!partes.length) return 'Nada mudou.';
  const texto = partes.join(', ');
  return `${texto.charAt(0).toUpperCase()}${texto.slice(1)}.`;
}

/** Dicas para a vitrine do membro: fixadas primeiro, depois as mais novas. */
export function sortTips<T extends Pick<GroupTip, 'pinned' | 'publishedAt'>>(tips: T[]): T[] {
  return [...tips].sort(
    (a, b) =>
      Number(b.pinned) - Number(a.pinned) ||
      (b.publishedAt ?? '').localeCompare(a.publishedAt ?? ''),
  );
}

/** Metas preenchidas por inteiro e com mínimo até o máximo, ou o motivo. */
export function goalsProblem(
  g: Partial<Record<keyof NutritionGoalsInput, number | null>>,
): string | null {
  const pares: [keyof NutritionGoalsInput, keyof NutritionGoalsInput, string][] = [
    ['kcalMin', 'kcalMax', 'calorias'],
    ['proteinMinG', 'proteinMaxG', 'proteína'],
    ['carbsMinG', 'carbsMaxG', 'carboidrato'],
    ['fatMinG', 'fatMaxG', 'gordura'],
  ];
  for (const [min, max, nome] of pares) {
    const a = g[min];
    const b = g[max];
    if (a == null || b == null || !Number.isFinite(a) || !Number.isFinite(b)) {
      return `Preencha o mínimo e o máximo de ${nome}.`;
    }
    if (a < 0 || b < 0) return `Os valores de ${nome} não podem ser negativos.`;
    if (a > b) return `O mínimo de ${nome} passa do máximo.`;
  }
  return null;
}
