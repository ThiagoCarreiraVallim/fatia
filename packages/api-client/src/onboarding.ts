import type { UserGoals } from './nutrition';
import type {
  ActivityLevel,
  BiologicalSex,
  BodyObjective,
  GoalsInput,
  MeUser,
  OnboardingProfile,
} from './users';

/**
 * Assistente de primeira vez, comum ao PWA e ao app.
 *
 * O cálculo mora na API (`goal-suggestion.ts`), para o MCP sugerir o mesmo
 * número; aqui ficam as opções, o formulário e as mesmas faixas da API, para o
 * erro aparecer no campo antes do envio.
 */

export const ONBOARDING_STEPS = [
  { key: 'objective', title: 'Qual é o seu objetivo?' },
  { key: 'body', title: 'Sobre você' },
  { key: 'activity', title: 'Como é a sua rotina?' },
  { key: 'goals', title: 'Suas metas' },
] as const;

export type OnboardingStepKey = (typeof ONBOARDING_STEPS)[number]['key'];

interface Option<T> {
  value: T;
  label: string;
  description: string;
}

export const OBJECTIVE_OPTIONS: Option<BodyObjective>[] = [
  {
    value: 'LOSE',
    label: 'Perder peso',
    description: 'Comer um pouco abaixo do gasto, sem passar fome.',
  },
  { value: 'MAINTAIN', label: 'Manter o peso', description: 'Comer perto do que o corpo gasta.' },
  {
    value: 'GAIN',
    label: 'Ganhar massa',
    description: 'Comer um pouco acima do gasto, com mais proteína.',
  },
];

export const ACTIVITY_OPTIONS: Option<ActivityLevel>[] = [
  {
    value: 'SEDENTARY',
    label: 'Sedentário',
    description: 'Trabalho sentado, quase sem exercício.',
  },
  { value: 'LIGHT', label: 'Leve', description: 'Caminhadas ou treino 1 a 3 vezes por semana.' },
  { value: 'MODERATE', label: 'Moderado', description: 'Treino 3 a 5 vezes por semana.' },
  { value: 'ACTIVE', label: 'Ativo', description: 'Treino puxado 6 ou 7 vezes por semana.' },
  {
    value: 'VERY_ACTIVE',
    label: 'Muito ativo',
    description: 'Trabalho braçal ou dois treinos por dia.',
  },
];

export const SEX_OPTIONS: { value: BiologicalSex; label: string }[] = [
  { value: 'FEMALE', label: 'Feminino' },
  { value: 'MALE', label: 'Masculino' },
];

/** As faixas de `SUGGESTION_LIMITS` da API. */
export const BODY_LIMITS = {
  minAge: 16,
  maxAge: 100,
  minHeightCm: 100,
  maxHeightCm: 250,
  minWeightKg: 30,
  maxWeightKg: 300,
} as const;

export interface BodyForm {
  sex: BiologicalSex | null;
  /** AAAA-MM-DD (o `<input type="date">` já entrega assim). */
  birthDate: string;
  heightCm: string;
  weightKg: string;
}

export type BodyErrors = Partial<Record<keyof BodyForm, string>>;

const fmt = (n: number) => String(n).replace('.', ',');

/** Preenche com o que já se sabe: altura do perfil e a última pesagem. */
export function initialBodyForm(
  me: MeUser | null | undefined,
  latestWeightKg?: number | null,
): BodyForm {
  return {
    sex: me?.sex ?? null,
    birthDate: me?.birthDate ? me.birthDate.slice(0, 10) : '',
    heightCm: me?.heightCm ? fmt(me.heightCm) : '',
    weightKg: latestWeightKg ? fmt(latestWeightKg) : '',
  };
}

/** Idade completa em `today` (AAAA-MM-DD). */
export function ageFromBirthDate(birthDate: string, today: string): number {
  const [by, bm, bd] = birthDate.split('-').map(Number);
  const [ty, tm, td] = today.split('-').map(Number);
  const hadBirthday = tm > bm || (tm === bm && td >= bd);
  return ty - by - (hadBirthday ? 0 : 1);
}

function isCalendarDay(ymd: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return false;
  const [y, m, d] = ymd.split('-').map(Number);
  const utc = new Date(Date.UTC(y, m - 1, d));
  return utc.getUTCFullYear() === y && utc.getUTCMonth() === m - 1 && utc.getUTCDate() === d;
}

function parseNumber(text: string): number | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const value = Number(trimmed.replace(',', '.'));
  return Number.isFinite(value) ? value : NaN;
}

export type BodyParse =
  | { ok: true; body: Pick<OnboardingProfile, 'sex' | 'birthDate' | 'heightCm' | 'weightKg'> }
  | { ok: false; errors: BodyErrors };

export function bodyFromForm(form: BodyForm, today: string): BodyParse {
  const L = BODY_LIMITS;
  const errors: BodyErrors = {};
  if (!form.sex) errors.sex = 'Escolha uma opção.';

  if (!form.birthDate) errors.birthDate = 'Informe a data de nascimento.';
  else if (!isCalendarDay(form.birthDate) || form.birthDate > today) {
    errors.birthDate = 'Data inválida.';
  } else {
    const age = ageFromBirthDate(form.birthDate, today);
    if (age < L.minAge || age > L.maxAge) {
      errors.birthDate = `A sugestão vale de ${L.minAge} a ${L.maxAge} anos.`;
    }
  }

  const height = parseNumber(form.heightCm);
  if (height === null) errors.heightCm = 'Informe a altura.';
  else if (!(height >= L.minHeightCm && height <= L.maxHeightCm)) {
    errors.heightCm = `Entre ${L.minHeightCm} e ${L.maxHeightCm} cm.`;
  }

  const weight = parseNumber(form.weightKg);
  if (weight === null) errors.weightKg = 'Informe o peso.';
  else if (!(weight >= L.minWeightKg && weight <= L.maxWeightKg)) {
    errors.weightKg = `Entre ${L.minWeightKg} e ${L.maxWeightKg} kg.`;
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return {
    ok: true,
    body: {
      sex: form.sex as BiologicalSex,
      birthDate: form.birthDate,
      heightCm: Math.round((height as number) * 10) / 10,
      weightKg: Math.round((weight as number) * 10) / 10,
    },
  };
}

/** Campos editáveis do último passo, na ordem da tela, em pares mínimo/máximo. */
export const GOAL_RANGES = [
  { label: 'Calorias', unit: 'kcal', min: 'kcalMin', max: 'kcalMax' },
  { label: 'Proteína', unit: 'g', min: 'proteinMinG', max: 'proteinMaxG' },
  { label: 'Carboidrato', unit: 'g', min: 'carbsMinG', max: 'carbsMaxG' },
  { label: 'Gordura', unit: 'g', min: 'fatMinG', max: 'fatMaxG' },
] as const;

export const GOAL_SINGLES = [
  { label: 'Água por dia', unit: 'mL', key: 'dailyWaterTargetMl' },
  { label: 'Passos por dia', unit: 'passos', key: 'dailyStepsTarget' },
  { label: 'Treinos por semana', unit: '', key: 'weeklyWorkouts' },
] as const;

export type GoalsForm = Record<keyof GoalsInput, string>;
export type GoalsErrors = Partial<Record<keyof GoalsInput, string>>;

/** Os tetos de `GOAL_LIMITS` da API. */
const GOAL_CAP: Record<keyof GoalsInput, number> = {
  kcalMin: 10_000,
  kcalMax: 10_000,
  proteinMinG: 1_000,
  proteinMaxG: 1_000,
  carbsMinG: 1_000,
  carbsMaxG: 1_000,
  fatMinG: 1_000,
  fatMaxG: 1_000,
  dailyWaterTargetMl: 10_000,
  dailyStepsTarget: 100_000,
  weeklyWorkouts: 14,
};

export function goalsToForm(goals: GoalsInput | UserGoals): GoalsForm {
  const form = {} as GoalsForm;
  for (const key of Object.keys(GOAL_CAP) as (keyof GoalsInput)[]) form[key] = String(goals[key]);
  return form;
}

export type GoalsParse = { ok: true; goals: GoalsInput } | { ok: false; errors: GoalsErrors };

export function goalsFromForm(form: GoalsForm): GoalsParse {
  const errors: GoalsErrors = {};
  const goals = {} as GoalsInput;
  for (const key of Object.keys(GOAL_CAP) as (keyof GoalsInput)[]) {
    const value = parseNumber(form[key]);
    if (value === null || Number.isNaN(value) || value < 0 || !Number.isInteger(value)) {
      errors[key] = 'Número inteiro.';
    } else if (value > GOAL_CAP[key]) {
      errors[key] = `Até ${GOAL_CAP[key].toLocaleString('pt-BR')}.`;
    } else {
      goals[key] = value;
    }
  }
  for (const { min, max } of GOAL_RANGES) {
    if (!errors[min] && !errors[max] && goals[min] > goals[max]) {
      errors[min] = 'O mínimo passa do máximo.';
    }
  }
  return Object.keys(errors).length > 0 ? { ok: false, errors } : { ok: true, goals };
}
