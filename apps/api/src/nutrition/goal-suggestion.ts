import type { ActivityLevel, BiologicalSex, BodyObjective } from '@prisma/client';
import { isCalendarDay } from '../progress/helpers/log-day';
import { GOAL_LIMITS } from './user-goals.service';

/**
 * Sugestão de metas a partir do perfil (onboarding e `suggest_nutrition_goals`).
 *
 * Gasto pela Mifflin-St Jeor, a de menor erro em adultos sem medição de
 * composição corporal, vezes o fator de atividade de praxe. É ponto de partida,
 * não prescrição: a pessoa edita tudo antes de salvar, e a tela diz isso.
 */

export interface SuggestionProfile {
  sex: BiologicalSex;
  /** YYYY-MM-DD. */
  birthDate: string;
  heightCm: number;
  weightKg: number;
  activityLevel: ActivityLevel;
  objective: BodyObjective;
}

export interface SuggestedGoals {
  kcalMin: number;
  kcalMax: number;
  proteinMinG: number;
  proteinMaxG: number;
  carbsMinG: number;
  carbsMaxG: number;
  fatMinG: number;
  fatMaxG: number;
  weeklyWorkouts: number;
  dailyStepsTarget: number;
  dailyWaterTargetMl: number;
}

export interface GoalSuggestion {
  age: number;
  /** Metabolismo basal, kcal/dia. */
  bmr: number;
  /** Gasto total estimado, kcal/dia. */
  tdee: number;
  /** Centro da faixa de kcal, já com o ajuste do objetivo. */
  targetKcal: number;
  goals: SuggestedGoals;
}

export const SUGGESTION_LIMITS = {
  minAge: 16,
  maxAge: 100,
  minHeightCm: 100,
  maxHeightCm: 250,
  minWeightKg: 30,
  maxWeightKg: 300,
} as const;

const ACTIVITY: Record<ActivityLevel, { factor: number; steps: number; workouts: number }> = {
  SEDENTARY: { factor: 1.2, steps: 6000, workouts: 2 },
  LIGHT: { factor: 1.375, steps: 7500, workouts: 3 },
  MODERATE: { factor: 1.55, steps: 9000, workouts: 4 },
  ACTIVE: { factor: 1.725, steps: 10000, workouts: 5 },
  VERY_ACTIVE: { factor: 1.9, steps: 12000, workouts: 6 },
};

/** Proteína em g por kg de peso: mais alta no déficit, para preservar massa magra. */
const PROTEIN_G_PER_KG: Record<BodyObjective, [number, number]> = {
  LOSE: [1.8, 2.2],
  MAINTAIN: [1.4, 1.8],
  GAIN: [1.6, 2.0],
};

/** Abaixo disso, o déficit vira risco: a sugestão nunca desce daqui. */
const KCAL_FLOOR: Record<BiologicalSex, number> = { FEMALE: 1200, MALE: 1500 };

const round = (n: number, step: number) => Math.round(n / step) * step;
/** Corpos fora da curva não podem gerar uma sugestão que o próprio PUT recusaria. */
const capKcal = (n: number) => Math.min(n, GOAL_LIMITS.kcal);
const capMacro = (n: number) => Math.min(n, GOAL_LIMITS.macroG);

/** Idade completa em `today` (YYYY-MM-DD), sem passar por fuso. */
export function ageOn(birthDate: string, today: string): number {
  const [by, bm, bd] = birthDate.split('-').map(Number);
  const [ty, tm, td] = today.split('-').map(Number);
  const hadBirthday = tm > bm || (tm === bm && td >= bd);
  return ty - by - (hadBirthday ? 0 : 1);
}

/** Mensagem do primeiro dado fora da faixa, ou `null` quando dá para calcular. */
export function profileProblem(profile: SuggestionProfile, today: string): string | null {
  const L = SUGGESTION_LIMITS;
  if (!isCalendarDay(profile.birthDate) || profile.birthDate > today) {
    return 'A data de nascimento não é válida.';
  }
  const age = ageOn(profile.birthDate, today);
  if (age < L.minAge || age > L.maxAge) {
    return `A sugestão vale para quem tem de ${L.minAge} a ${L.maxAge} anos.`;
  }
  if (!(profile.heightCm >= L.minHeightCm && profile.heightCm <= L.maxHeightCm)) {
    return `A altura deve ficar entre ${L.minHeightCm} e ${L.maxHeightCm} cm.`;
  }
  if (!(profile.weightKg >= L.minWeightKg && profile.weightKg <= L.maxWeightKg)) {
    return `O peso deve ficar entre ${L.minWeightKg} e ${L.maxWeightKg} kg.`;
  }
  return null;
}

/** Supõe `profileProblem(profile, today) === null`. */
export function suggestGoals(profile: SuggestionProfile, today: string): GoalSuggestion {
  const age = ageOn(profile.birthDate, today);
  const { weightKg: w, heightCm: h } = profile;
  const bmr = Math.round(10 * w + 6.25 * h - 5 * age + (profile.sex === 'MALE' ? 5 : -161));
  const activity = ACTIVITY[profile.activityLevel];
  const tdee = Math.round(bmr * activity.factor);

  const adjust =
    profile.objective === 'LOSE'
      ? -Math.min(tdee * 0.2, 750)
      : profile.objective === 'GAIN'
        ? Math.min(tdee * 0.1, 400)
        : 0;
  const targetKcal = Math.max(round(tdee + adjust, 10), KCAL_FLOOR[profile.sex]);
  const kcalMin = capKcal(Math.max(round(targetKcal * 0.95, 50), KCAL_FLOOR[profile.sex]));
  const kcalMax = capKcal(Math.max(round(targetKcal * 1.05, 50), kcalMin));

  const [pLo, pHi] = PROTEIN_G_PER_KG[profile.objective];
  const proteinMinG = Math.round(w * pLo);
  const proteinMaxG = Math.round(w * pHi);
  // Gordura entre 25% e 35% das kcal; o carboidrato fecha a conta.
  const fatMinG = Math.round((targetKcal * 0.25) / 9);
  const fatMaxG = Math.round((targetKcal * 0.35) / 9);
  const carbsMinG = capMacro(
    Math.max(0, Math.round((kcalMin - proteinMaxG * 4 - fatMaxG * 9) / 4)),
  );
  const carbsMaxG = capMacro(
    Math.max(carbsMinG, Math.round((kcalMax - proteinMinG * 4 - fatMinG * 9) / 4)),
  );

  const dailyWaterTargetMl = Math.min(Math.max(round(w * 35, 250), 1500), 5000);

  return {
    age,
    bmr,
    tdee,
    targetKcal,
    goals: {
      kcalMin,
      kcalMax,
      proteinMinG,
      proteinMaxG,
      carbsMinG,
      carbsMaxG,
      fatMinG,
      fatMaxG,
      weeklyWorkouts: activity.workouts,
      dailyStepsTarget: activity.steps,
      dailyWaterTargetMl,
    },
  };
}
