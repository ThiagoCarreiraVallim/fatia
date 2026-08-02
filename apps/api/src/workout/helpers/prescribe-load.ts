import { estimate1RM } from './estimate-1rm';

/**
 * Prescrição de carga e repetições da próxima sessão (#144).
 *
 * Dupla progressão com autorregulação por RPE, **determinística**: mesma
 * entrada, mesma saída, sem modelo e sem estado. A regra inteira mora aqui —
 * inclusive os tetos — porque é a parte que precisa ser testável sem banco.
 *
 * A alternativa avaliada e descartada foi ajustar uma reta no 1RM estimado e
 * extrapolar. É literalmente o "extrapolar tendência ao infinito" que a épica
 * proíbe, Epley erra muito acima de 10 reps e o erro entraria composto — e o
 * resultado não é explicável, não dá para dizer "porque na última você fez 12
 * com RPE 7".
 */

/** Sessões consideradas. Três dão dois intervalos, o bastante para o teto semanal. */
export const HISTORY_WINDOW = 3;

/**
 * Menos que isto é chute: uma única sessão não diz se a carga foi fácil ou se
 * foi a primeira tentativa da vida. Melhor não sugerir do que sugerir errado.
 */
const MIN_SESSIONS = 2;

/** RPE médio até aqui = sobrou reserva. */
const EASY_RPE = 7;
/** RPE médio daqui para cima = repetir, nunca subir. */
const HARD_RPE = 9;

/** Passo de carga por mecânica. Mecânica desconhecida usa o passo menor. */
const COMPOUND_STEP_KG = 2.5;
const ISOLATION_STEP_KG = 1.25;

/** Menor anilha que existe na prática. Toda sugestão é múltipla dela. */
const PLATE_KG = 0.5;

/** Teto por sessão: nenhum salto passa disto sobre a carga base. */
const SESSION_CAP = 0.05;
/** Teto por semana, sobre a carga da sessão mais antiga dos últimos 7 dias. */
const WEEKLY_CAP = 0.1;
/** Teto absoluto sobre o recorde de todos os tempos. */
const PR_CAP = 1.05;

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/** Faixa usada quando o chamador não sabe o alvo (treino livre, "AMRAP"). */
const DEFAULT_REP_RANGE: RepRange = { min: 8, max: 12 };

export interface RepRange {
  min: number;
  max: number;
}

export interface PrescriptionSet {
  weightKg: number;
  reps: number;
  rpe: number | null;
}

export interface PrescriptionSession {
  startedAt: Date;
  sets: PrescriptionSet[];
}

export interface PrescribeLoadInput {
  /** Sessões com séries de força válidas, da **mais recente** para a mais antiga. */
  sessions: PrescriptionSession[];
  /** `Exercise.mechanic`: "compound" | "isolation" | null. */
  mechanic: string | null;
  /** Faixa alvo do plano, como "8-12" ou "5". Ausente = faixa padrão. */
  targetReps?: string | null;
  /** Maior carga já registrada no exercício, de `getPersonalRecord`. */
  personalRecordKg: number | null;
}

/** Qual sinal decidiu a prescrição. Ver a nota sobre RPE ausente em `averageRpe`. */
export type PrescriptionBasis = 'rpe' | 'reps';

export type PrescriptionAction = 'increase_load' | 'increase_reps' | 'hold';

export interface Prescription {
  status: 'ok';
  weightKg: number;
  reps: number;
  restSeconds: number;
  basis: PrescriptionBasis;
  action: PrescriptionAction;
  /** `true` quando algum teto (ou a granularidade da anilha) cortou o salto. */
  capped: boolean;
}

export type PrescriptionOutcome =
  Prescription | { status: 'insufficient_history' } | { status: 'cardio_exercise' };

export function prescribeLoad(input: PrescribeLoadInput): PrescriptionOutcome {
  const sessions = input.sessions.filter((s) => s.sets.length > 0).slice(0, HISTORY_WINDOW);
  if (sessions.length < MIN_SESSIONS) return { status: 'insufficient_history' };

  const last = sessions[0];
  const base = bestSet(last.sets);
  const range = parseRepRange(input.targetReps);
  const avgRpe = averageRpe(last.sets);
  const basis: PrescriptionBasis = avgRpe === null ? 'reps' : 'rpe';

  let action = decideAction(avgRpe, base, last.sets, range);
  let weightKg = base.weightKg;
  let reps = action === 'hold' ? base.reps : Math.min(base.reps + 1, range.max);
  let capped = false;

  if (action === 'increase_load') {
    const step = input.mechanic === 'compound' ? COMPOUND_STEP_KG : ISOLATION_STEP_KG;
    const capResult = applyCaps(base.weightKg, step, sessions, input.personalRecordKg);
    weightKg = capResult.weightKg;
    capped = capResult.capped;

    if (weightKg > base.weightKg) {
      // Dupla progressão: carga sobe, reps voltam ao piso da faixa.
      reps = range.min;
    } else {
      // O teto comeu o salto inteiro. Voltar as reps ao piso agora seria uma
      // regressão travestida de progressão — mesma carga com menos repetição.
      action = 'hold';
      reps = base.reps;
    }
  }

  return {
    status: 'ok',
    weightKg,
    reps,
    restSeconds: restSecondsFor(input.mechanic, reps),
    basis,
    action,
    capped,
  };
}

function decideAction(
  avgRpe: number | null,
  base: PrescriptionSet,
  lastSets: PrescriptionSet[],
  range: RepRange,
): PrescriptionAction {
  if (base.reps >= range.max) {
    // No topo da faixa não há repetição para somar: ou sobe carga, ou repete.
    if (avgRpe === null) {
      // Dupla progressão pura exige a faixa fechada em **todas** as séries; a
      // melhor série sozinha no topo costuma ser a primeira, ainda descansada.
      return lastSets.every((s) => s.reps >= range.max) ? 'increase_load' : 'hold';
    }
    return avgRpe <= EASY_RPE ? 'increase_load' : 'hold';
  }

  if (avgRpe !== null && avgRpe >= HARD_RPE) return 'hold';
  return 'increase_reps';
}

/**
 * Os três tetos, na ordem em que apertam.
 *
 * O teto absoluto contra o recorde é o que de fato segura os outros dois:
 * `weightKg` é ambíguo em halteres (por halter ou soma dos dois?), o schema não
 * diz e o app não pergunta — teto percentual sobre número ambíguo continua
 * ambíguo, mas "nunca acima de 5% do que já foi levantado" vale em qualquer
 * unidade, porque o recorde está na mesma unidade da base.
 */
function applyCaps(
  baseKg: number,
  step: number,
  sessions: PrescriptionSession[],
  personalRecordKg: number | null,
): { weightKg: number; capped: boolean } {
  let increment = Math.min(step, baseKg * SESSION_CAP);

  if (personalRecordKg !== null) {
    increment = Math.min(increment, Math.max(0, personalRecordKg * PR_CAP - baseKg));
  }

  const weeklyCeiling = weeklyCeilingOf(sessions);
  // Estourou a semana → devolve a carga anterior. Cortar pela metade daria um
  // número que ninguém pediu; repetir a carga é uma resposta que se explica.
  if (baseKg + increment > weeklyCeiling) increment = 0;

  const weightKg = Math.max(baseKg, floorToPlate(baseKg + increment));
  return { weightKg, capped: weightKg < baseKg + step };
}

/**
 * 10% sobre a carga da sessão mais antiga dentro de 7 dias da última.
 *
 * A janela é contada a partir da última sessão, e não de "hoje": quem parou um
 * mês volta com o teto medido no próprio retorno, não numa semana vazia.
 */
function weeklyCeilingOf(sessions: PrescriptionSession[]): number {
  const last = sessions[0];
  const withinWeek = sessions.filter(
    (s) => last.startedAt.getTime() - s.startedAt.getTime() <= WEEK_MS,
  );
  const oldest = withinWeek[withinWeek.length - 1];
  return bestSet(oldest.sets).weightKg * (1 + WEEKLY_CAP);
}

/**
 * A série de referência da sessão é a de maior 1RM estimado, não a mais pesada.
 * Uma tripla pesada de abertura e um conjunto de trabalho mais leve e mais
 * longo são coisas diferentes: o segundo é o que se repete na próxima sessão.
 * Desempate pela carga maior, para não trocar 8 repetições por 20 fáceis.
 */
function bestSet(sets: PrescriptionSet[]): PrescriptionSet {
  return sets.reduce((best, candidate) => {
    const a = estimate1RM(candidate.weightKg, candidate.reps);
    const b = estimate1RM(best.weightKg, best.reps);
    if (a > b) return candidate;
    if (a === b && candidate.weightKg > best.weightKg) return candidate;
    return best;
  });
}

/**
 * `null` quando **nenhuma** série da sessão tem RPE.
 *
 * O RPE é opcional e chega depois — o modal só abre no sucesso do log da série.
 * Quem nunca preenche cai na dupla progressão pura e a sugestão continua certa,
 * mas o `basis` precisa dizer isso, senão a pessoa confia num sinal que não
 * existiu.
 */
function averageRpe(sets: PrescriptionSet[]): number | null {
  const values = sets.map((s) => s.rpe).filter((rpe): rpe is number => rpe !== null);
  if (values.length === 0) return null;
  return values.reduce((sum, rpe) => sum + rpe, 0) / values.length;
}

export function parseRepRange(targetReps?: string | null): RepRange {
  const numbers = targetReps?.match(/\d+/g);
  if (!numbers || numbers.length === 0) return DEFAULT_REP_RANGE;
  const min = Number(numbers[0]);
  const max = numbers.length > 1 ? Number(numbers[1]) : min;
  return { min: Math.min(min, max), max: Math.max(min, max) };
}

/**
 * Descanso derivado da mecânica e da faixa. É a única parte sem lastro no
 * histórico — o app não cronometra o descanso real — e por isso é constante
 * nomeada em vez de fingir ser modelo.
 */
function restSecondsFor(mechanic: string | null, reps: number): number {
  if (mechanic !== 'compound' || reps > 12) return 60;
  return reps <= 6 ? 180 : 90;
}

/** Piso, nunca arredondamento: teto cortado para cima deixaria de ser teto. */
function floorToPlate(kg: number): number {
  return Math.floor(kg / PLATE_KG + 1e-9) * PLATE_KG;
}
