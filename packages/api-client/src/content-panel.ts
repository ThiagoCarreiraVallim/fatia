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
import type { GroupRole } from './community';
import { equipmentLabel, type GymEquipmentState } from './community-exercises';

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
  const frase = `${texto.charAt(0).toUpperCase()}${texto.slice(1)}.`;
  // #396: trocar as metas não apaga as de antes.
  return r.goalsHistoryWritten ? `${frase} As de antes ficaram no histórico.` : frase;
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

// ---------------------------------------------------------------- vitrine do membro (#396)

/** Nome do autor que apagou a conta, como a API devolve. */
const TEAM_AUTHOR = 'Equipe';

const ROLE_SHORT: Partial<Record<GroupRole, string>> = {
  OWNER: 'dono',
  PROFESSIONAL: 'profissional',
  CREATOR: 'criador de conteúdo',
};

const KIND_SHORT: Record<TemplateKind, string> = { WORKOUT: 'treino', NUTRITION: 'alimentação' };

/** "treino · 4 exercícios · intermediário · Bruno" — a linha do plano na aba Conteúdo (Cm-12). */
export function memberTemplateLine(
  t: Pick<PlanTemplate, 'kind' | 'exercises' | 'meals' | 'level' | 'authorName'>,
): string {
  const partes: string[] = [KIND_SHORT[t.kind]];
  if (t.kind === 'WORKOUT') partes.push(plural(t.exercises.length, 'exercício', 'exercícios'));
  else if (t.meals.length) partes.push(plural(t.meals.length, 'refeição', 'refeições'));
  if (t.level) partes.push(PLAN_LEVEL_LABEL[t.level].toLowerCase());
  if (t.authorName && t.authorName !== TEAM_AUTHOR) partes.push(t.authorName);
  return partes.join(' · ');
}

/** "Bruno (dono)". Membro e quem já saiu da comunidade aparecem só pelo nome. */
export function authorWithRole(name: string, role: GroupRole | null): string {
  const papel = role ? ROLE_SHORT[role] : undefined;
  return papel ? `${name} (${papel})` : name;
}

/** O alto do cartão da dica: "Fixada · hábitos" ou "nutrição · Helena" (Cm-12). */
export function tipEyebrow(t: Pick<GroupTip, 'pinned' | 'category' | 'authorName'>): string {
  const categoria = TIP_CATEGORY_LABEL[t.category].toLowerCase();
  return t.pinned ? `Fixada · ${categoria}` : `${categoria} · ${t.authorName}`;
}

/** "Bruno · dono · 3 nov": quem escreveu a dica e quando, no fuso da pessoa (Cm-15). */
export function tipByline(
  t: Pick<GroupTip, 'authorName' | 'authorRole' | 'publishedAt'>,
  timezone: string,
): string {
  const partes = [t.authorName];
  const papel = t.authorRole ? ROLE_SHORT[t.authorRole] : undefined;
  if (papel) partes.push(papel);
  if (t.publishedAt) {
    const quando = new Intl.DateTimeFormat('pt-BR', {
      day: 'numeric',
      month: 'short',
      timeZone: timezone,
    })
      .format(new Date(t.publishedAt))
      .replace(' de ', ' ')
      .replace('.', '');
    partes.push(quando);
  }
  return partes.join(' · ');
}

export type TipShortcut = 'water' | 'workout';

/**
 * O atalho no pé da dica (Cm-15): "Registrar água" quando ela fala de água ou
 * hidratação, "Ir para o treino" na dica de treino. Sem atalho no resto.
 */
export function tipShortcut(t: Pick<GroupTip, 'category' | 'title' | 'body'>): TipShortcut | null {
  // Começo de palavra à mão: o `\b` do JS não vê o "Á" como letra ("aguarde" não conta).
  if (/(^|[^\p{L}])(água(?!\p{L})|agua(?!\p{L})|hidrat)/iu.test(`${t.title} ${t.body}`)) {
    return 'water';
  }
  if (t.category === 'WORKOUT') return 'workout';
  return null;
}

/** "Equipamentos da academia" (Cm-12): os da lista no rótulo de tela, depois os próprios. */
export function gymEquipmentLabels(state: GymEquipmentState): string[] {
  return [...state.equipment.map(equipmentLabel), ...state.customEquipment];
}
