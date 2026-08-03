/**
 * O template de periodização em blocos (#145).
 *
 * Quatro semanas lineares, deliberadamente pobres: três de acúmulo/pico e uma de
 * deload. A issue pede um modelo "simples e explicável — que o usuário entenda
 * por que a semana é aquela" antes de qualquer coisa mais elaborada, e uma tabela
 * de quatro linhas cabe na frase que a tela mostra.
 *
 * Os fatores **multiplicam a prescrição da #144**, nunca uma carga absoluta. É o
 * que mantém os tetos de `prescribe-load.ts` (5% por sessão, 10% por semana, 5%
 * sobre o recorde) valendo dentro da periodização: se o bloco prescrevesse carga,
 * os tetos ficariam de fora e o risco físico voltaria pela porta dos fundos.
 */

/** Foco da semana. É o que vira rótulo na tela, por isso é união fechada. */
export type BlockFocus = 'accumulation' | 'peak' | 'deload';

/** Espelha o enum `TrainingBlockKind` do Prisma. */
export type BlockKind = 'strength' | 'hypertrophy';

export interface BlockWeekTemplate {
  weekNumber: number;
  focus: BlockFocus;
  /** Multiplicador sobre `Prescription.weightKg`. */
  intensityFactor: number;
  /** Multiplicador sobre `WorkoutPlanExercise.targetSets`. */
  volumeFactor: number;
}

export const BLOCK_WEEKS_TOTAL = 4;

export const BLOCK_TEMPLATE: readonly BlockWeekTemplate[] = [
  { weekNumber: 1, focus: 'accumulation', intensityFactor: 1.0, volumeFactor: 1.0 },
  { weekNumber: 2, focus: 'accumulation', intensityFactor: 1.025, volumeFactor: 1.2 },
  { weekNumber: 3, focus: 'peak', intensityFactor: 1.05, volumeFactor: 1.0 },
  { weekNumber: 4, focus: 'deload', intensityFactor: 0.85, volumeFactor: 0.5 },
];

/**
 * A **única** diferença entre os dois tipos de bloco é a faixa de repetições.
 *
 * Poderia haver mais — cadência, descanso, seleção de exercício. Não há de
 * propósito: cada eixo a mais é uma frase a mais para justificar ao usuário, e a
 * issue avisa que periodização é onde é fácil produzir algo que parece sofisticado
 * e não ajuda ninguém.
 */
export const REP_RANGE_BY_KIND: Readonly<Record<BlockKind, string>> = {
  strength: '4-6',
  hypertrophy: '8-12',
};

export const FOCUS_LABEL: Readonly<Record<BlockFocus, string>> = {
  accumulation: 'acúmulo',
  peak: 'pico',
  deload: 'deload',
};

export const KIND_LABEL: Readonly<Record<BlockKind, string>> = {
  strength: 'força',
  hypertrophy: 'hipertrofia',
};

/**
 * A frase que a tela mostra. Mora aqui, e não no cliente, porque web e mobile
 * mostram a mesma coisa — e porque a explicação é o produto desta issue, não um
 * detalhe de apresentação de cada app.
 */
export function describeWeek(week: {
  weekNumber: number;
  focus: BlockFocus;
  intensityFactor: number;
  volumeFactor: number;
}): string {
  const carga = pontosPercentuais(week.intensityFactor);
  const volume = pontosPercentuais(week.volumeFactor);
  const partes = [
    carga === 0 ? 'carga da sua prescrição' : `carga ${sinal(carga)}%`,
    volume === 0 ? 'volume normal' : `volume ${sinal(volume)}%`,
  ];
  return `Semana ${week.weekNumber} de ${BLOCK_WEEKS_TOTAL} — ${FOCUS_LABEL[week.focus]}: ${partes.join(', ')}.`;
}

/**
 * Uma casa decimal, arredondada antes de virar texto. `(1.025 - 1) * 100` dá
 * 2,4999999999999998 em ponto flutuante: arredondar para inteiro mostraria "+2%"
 * numa semana que sobe 2,5%, e o número da tela deixaria de ser o do template.
 */
function pontosPercentuais(fator: number): number {
  return Math.round((fator - 1) * 1000) / 10;
}

function sinal(pct: number): string {
  const texto = String(pct).replace('.', ',');
  return pct > 0 ? `+${texto}` : texto;
}
