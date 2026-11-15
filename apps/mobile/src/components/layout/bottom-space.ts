/**
 * As medidas do que fica embaixo das telas (#369), as mesmas do PWA: a barra
 * flutua 22 px acima da área segura e tem 68; a barra "treino em andamento"
 * tem 56 e fica 10 acima dela.
 */
export const NAV_BOTTOM = 22;
export const NAV_HEIGHT = 68;
export const ACTIVE_WORKOUT_BAR_HEIGHT = 56;
export const ACTIVE_WORKOUT_BAR_GAP = 10;

/** Respiro no fim da tela sem barra (tarefas de foco). */
const BREATHING_ROOM = 16;
/**
 * Respiro entre o fim do conteúdo e a barra flutuante: o último botão e o fim
 * da lista ficam ~32 px acima dela (pranchas: `padding-bottom` 124–132 px).
 */
const NAV_CLEARANCE = 32;

/** O `paddingBottom` das telas para nada ficar atrás das barras. */
export function screenBottomPadding(opts: {
  safeBottom: number;
  navVisible: boolean;
  workoutBar: boolean;
}): number {
  if (!opts.navVisible) return opts.safeBottom + BREATHING_ROOM;
  const workout = opts.workoutBar ? ACTIVE_WORKOUT_BAR_HEIGHT + ACTIVE_WORKOUT_BAR_GAP : 0;
  return opts.safeBottom + NAV_BOTTOM + NAV_HEIGHT + NAV_CLEARANCE + workout;
}
