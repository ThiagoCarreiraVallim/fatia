/**
 * O template de periodização em blocos (#145).
 *
 * Quatro semanas lineares, deliberadamente pobres: três de acúmulo/pico e uma de
 * deload. Desde a #379 o bloco vai de 3 a 6 semanas (`blockTemplate`), com os
 * mesmos três focos; a tabela de 4 abaixo continua sendo o padrão. A issue pede um modelo "simples e explicável — que o usuário entenda
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

/** O bloco padrão, e o único que existia antes da #379. */
export const BLOCK_WEEKS_TOTAL = 4;

/** De 3 a 6 semanas, a última sempre de deload (#379). */
export const MIN_BLOCK_WEEKS = 3;
export const MAX_BLOCK_WEEKS = 6;

const DELOAD = { intensityFactor: 0.85, volumeFactor: 0.5 } as const;
/** Quanto a carga sobe por semana de treino, até o pico. */
const INTENSITY_STEP = 0.025;
/** O volume do acúmulo vai de 100% a 120% ao longo das semanas de acúmulo. */
const MAX_VOLUME_GAIN = 0.2;

/** Três casas: 1.025 * 3 em ponto flutuante não é 1.075. */
const round3 = (n: number) => Math.round(n * 1000) / 1000;

/**
 * O bloco de N semanas (#379), com os mesmos três focos de sempre: a última é
 * deload; antes dela, acúmulo e depois pico. Pico = metade das semanas de
 * treino, arredondada para baixo (3 → 1, 4 → 1, 5 → 2, 6 → 2); o resto é
 * acúmulo.
 *
 * A carga sobe 2,5% por semana de treino e o volume do acúmulo sobe até +20%;
 * o pico volta o volume ao normal. Com 4 semanas a regra dá exatamente a
 * tabela de antes (`BLOCK_TEMPLATE`), que é o que mantém iguais os blocos de 4
 * semanas que já existem — e o teste confere número por número.
 */
export function blockTemplate(weeksTotal: number): BlockWeekTemplate[] {
  if (
    !Number.isInteger(weeksTotal) ||
    weeksTotal < MIN_BLOCK_WEEKS ||
    weeksTotal > MAX_BLOCK_WEEKS
  ) {
    throw new RangeError(`O bloco vai de ${MIN_BLOCK_WEEKS} a ${MAX_BLOCK_WEEKS} semanas.`);
  }
  const training = weeksTotal - 1;
  const peaks = Math.floor(training / 2);
  const accumulation = training - peaks;
  const weeks: BlockWeekTemplate[] = [];
  for (let i = 0; i < training; i++) {
    const isAccumulation = i < accumulation;
    weeks.push({
      weekNumber: i + 1,
      focus: isAccumulation ? 'accumulation' : 'peak',
      intensityFactor: round3(1 + INTENSITY_STEP * i),
      volumeFactor:
        isAccumulation && accumulation > 1
          ? round3(1 + (MAX_VOLUME_GAIN * i) / (accumulation - 1))
          : 1.0,
    });
  }
  weeks.push({ weekNumber: weeksTotal, focus: 'deload', ...DELOAD });
  return weeks;
}

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

/**
 * O nome da semana na tela do bloco (Al-T12): o foco, numerado quando se
 * repete ("Acúmulo 2"). A numeração conta só as semanas do mesmo foco.
 */
export function weekLabel(
  week: { weekNumber: number; focus: BlockFocus },
  weeks: ReadonlyArray<{ weekNumber: number; focus: BlockFocus }>,
): string {
  const same = weeks.filter((w) => w.focus === week.focus);
  const name = FOCUS_TITLE[week.focus];
  if (same.length < 2) return name;
  return `${name} ${same.findIndex((w) => w.weekNumber === week.weekNumber) + 1}`;
}

const FOCUS_TITLE: Readonly<Record<BlockFocus, string>> = {
  accumulation: 'Acúmulo',
  peak: 'Pico',
  deload: 'Deload',
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
export function describeWeek(
  week: {
    weekNumber: number;
    focus: BlockFocus;
    intensityFactor: number;
    volumeFactor: number;
  },
  weeksTotal: number = BLOCK_WEEKS_TOTAL,
): string {
  const carga = pontosPercentuais(week.intensityFactor);
  const volume = pontosPercentuais(week.volumeFactor);
  const partes = [
    carga === 0 ? 'carga da sua prescrição' : `carga ${sinal(carga)}%`,
    volume === 0 ? 'volume normal' : `volume ${sinal(volume)}%`,
  ];
  return `Semana ${week.weekNumber} de ${weeksTotal} — ${FOCUS_LABEL[week.focus]}: ${partes.join(', ')}.`;
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
