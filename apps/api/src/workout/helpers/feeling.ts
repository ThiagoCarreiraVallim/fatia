/**
 * A escala de 5 do canvas (#377): 😎 Leve, 🙂 Firme, 😐 Puxado, 😣 Muito
 * puxado, 🥵 No limite — "sobravam 4 ou mais" até "não sobrava nada". É a
 * mesma pergunta que o RPE faz (repetições na reserva), então a sensação de
 * cada série mora no `SessionSet.rpe` (6 a 10) e a do treino em
 * `WorkoutSession.feeling` (1 a 5).
 */
export const FEELING_MIN = 1;
export const FEELING_MAX = 5;

/** 1 → RPE 6 … 5 → RPE 10. */
export function feelingToRpe(feeling: number): number {
  return Math.min(10, Math.max(6, Math.round(feeling) + 5));
}

/** RPE 6 ou menos → 1 (Leve) … 10 → 5 (No limite). Sem RPE, sem sensação. */
export function rpeToFeeling(rpe: number | null | undefined): number | null {
  if (rpe == null || Number.isNaN(rpe)) return null;
  return Math.min(FEELING_MAX, Math.max(FEELING_MIN, Math.round(rpe) - 5));
}

/** A sensação média de um conjunto de séries, arredondada. Nula se nenhuma tem RPE. */
export function averageFeeling(rpes: readonly (number | null | undefined)[]): number | null {
  const valores = rpes.map(rpeToFeeling).filter((f): f is number => f !== null);
  if (valores.length === 0) return null;
  return Math.round(valores.reduce((a, b) => a + b, 0) / valores.length);
}
