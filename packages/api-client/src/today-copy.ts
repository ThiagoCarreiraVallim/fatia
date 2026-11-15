import { dayMonth, formatDecimal, formatInteger } from './format';
import type { DailyGoal } from './progress';

/**
 * Textos e contas da aba Hoje do redesign (#373): pranchas Al-H1-Hoje, Al-H3-Agua,
 * Al-H4-Peso e Al-H5-Metas. Aqui para o PWA e o app escreverem igual.
 */

/** Um copo, na conta do "faltam N copos" e no "+" do cartão de água. */
export const WATER_GLASS_ML = 250;
/** Atalhos de quantidade da folha de água (Al-H3-Agua). */
export const WATER_QUICK_ML = [250, 500, 750, 1000] as const;
/** Passo do − e do + da folha de peso (Al-H4-Peso). */
export const WEIGHT_STEP_KG = 0.1;
/** Peso de partida da folha quando ainda não há registro. */
export const WEIGHT_FALLBACK_KG = 70;

/** "Metas 2/5", o chip do topo do Hoje. */
export function goalsChipLabel(met: number, total: number): string {
  return `Metas ${met}/${total}`;
}

function nutrientKey(key: string): string | null {
  return key.startsWith('nutrient:') ? key.slice('nutrient:'.length) : null;
}

/**
 * O valor de uma linha de "Metas de hoje": "934 / 1.800–2.200", "0,8 / 2,5 L",
 * "14 / mín 25 g", "Legs · feito".
 */
export function dailyGoalValue(goal: DailyGoal): string {
  if (goal.key === 'workout') {
    const status = goal.met ? 'feito' : 'a fazer';
    return goal.planName ? `${goal.planName} · ${status}` : status;
  }
  if (goal.key === 'water') {
    return `${formatDecimal(goal.current / 1000)} / ${formatDecimal((goal.min ?? 0) / 1000)} L`;
  }
  const unit = goal.key === 'kcal' || goal.key === 'steps' ? '' : ` ${goal.unit}`;
  const current = formatInteger(goal.current);
  let target: string;
  if (goal.min != null && goal.max != null) {
    target = `${formatInteger(goal.min)}–${formatInteger(goal.max)}`;
  } else if (nutrientKey(goal.key) && goal.min != null) {
    target = `mín ${formatInteger(goal.min)}`;
  } else if (nutrientKey(goal.key) && goal.max != null) {
    target = `máx ${formatInteger(goal.max)}`;
  } else {
    target = formatInteger(goal.min ?? goal.max ?? 0);
  }
  return `${current} / ${target}${unit}`;
}

/**
 * Aonde cada linha de "Metas de hoje" leva. Água abre a folha de água e passos
 * a de passos, por cima do Hoje; o resto é rota, igual no PWA e no app.
 */
export type DailyGoalTarget =
  { kind: 'route'; href: string } | { kind: 'water' } | { kind: 'steps' };

export function dailyGoalTarget(key: string): DailyGoalTarget {
  if (key === 'water') return { kind: 'water' };
  if (key === 'steps') return { kind: 'steps' };
  if (key === 'workout') return { kind: 'route', href: '/workout/history' };
  if (nutrientKey(key)) return { kind: 'route', href: '/nutrition/nutrient-targets' };
  return { kind: 'route', href: '/nutrition' };
}

/** Tom do ícone de uma meta, no mesmo vocabulário do `chipic` da prancha. */
export type GoalTone = 'lime' | 'blue' | 'water' | 'amber';

/** Ícone (nome do DS) e tom de cada linha de "Metas de hoje". */
export function dailyGoalVisual(goal: Pick<DailyGoal, 'key' | 'met'>): {
  icon: 'flame' | 'apple' | 'drop' | 'steps' | 'dumbbell' | 'sliders';
  tone: GoalTone;
} {
  switch (goal.key) {
    case 'kcal':
      return { icon: 'flame', tone: 'lime' };
    case 'protein':
      return { icon: 'apple', tone: 'blue' };
    case 'water':
      return { icon: 'drop', tone: 'water' };
    case 'steps':
      return { icon: 'steps', tone: 'amber' };
    case 'workout':
      return { icon: 'dumbbell', tone: 'lime' };
    default:
      return { icon: 'sliders', tone: goal.met ? 'lime' : 'blue' };
  }
}

/**
 * A linha de uma meta pessoal no cartão do Hoje: "70,2 kg · faltam 2,2",
 * "3/4 na semana", "meta 12 livros".
 */
export function personalGoalProgress(goal: {
  kind: string;
  unit: string;
  targetValue: number;
  currentValue: number | null;
  progressPercent: number | null;
}): { text: string; percent: number } {
  const percent = Math.max(0, Math.min(100, Math.round(goal.progressPercent ?? 0)));
  const cur = goal.currentValue;
  if (cur === null) return { text: `meta ${formatTrim(goal.targetValue)} ${goal.unit}`, percent };
  if (goal.kind === 'weight') {
    const left = Math.abs(goal.targetValue - cur);
    const tail = left < 0.05 ? 'meta batida' : `faltam ${formatDecimal(left)}`;
    return { text: `${formatDecimal(cur)} ${goal.unit} · ${tail}`, percent };
  }
  if (goal.kind === 'workout_frequency') {
    return { text: `${formatTrim(cur)}/${formatTrim(goal.targetValue)} na semana`, percent };
  }
  return { text: `${formatTrim(cur)}/${formatTrim(goal.targetValue)} ${goal.unit}`, percent };
}

/** Inteiro sem casa; fracionário com uma. */
function formatTrim(n: number): string {
  return Number.isInteger(n) ? formatInteger(n) : formatDecimal(n);
}

/** "faltam 7 copos", "falta 1 copo" ou "meta batida". */
export function waterLeftLabel(totalMl: number, targetMl: number): string {
  const cups = Math.max(0, Math.ceil((targetMl - totalMl) / WATER_GLASS_ML));
  if (cups === 0) return 'meta batida';
  return cups === 1 ? 'falta 1 copo' : `faltam ${cups} copos`;
}

/** O toast do "+" do cartão de água: "+250 mL · 1.050 mL hoje". */
export function waterAddedToast(addedMl: number, totalMl: number): string {
  return `+${formatInteger(addedMl)} mL · ${formatInteger(totalMl)} mL hoje`;
}

/** O toast de um atalho da folha de água: o desfazer é apagar na lista. */
export function waterSheetAddedToast(addedMl: number): string {
  return `+${formatInteger(addedMl)} mL · desfazer na lista`;
}

export const WATER_DELETED_TOAST = 'Registro apagado';
export const INBOX_EMPTY_TOAST = 'Sem novos avisos';

/** "/8 mil" ao lado dos passos do dia. */
export function stepsTargetShort(target: number): string {
  if (target < 1000) return `/${formatInteger(target)}`;
  const mil = target / 1000;
  return `/${Number.isInteger(mil) ? mil : formatDecimal(mil)} mil`;
}

/** "−2,5" com o sinal de menos tipográfico; "+0,3"; "0,0". */
export function signedKg(kg: number): string {
  const r = Math.round(kg * 10) / 10;
  if (r === 0) return '0,0';
  return `${r > 0 ? '+' : '−'}${formatDecimal(Math.abs(r))}`;
}

/** "−2,5 em 30 dias" no cartão de peso; nulo sem variação. */
export function weightChange30dLabel(kg: number | null): string | null {
  return kg === null ? null : `${signedKg(kg)} em 30 dias`;
}

const WEEKDAYS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];

function utcDay(iso: string): number {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

/**
 * "−0,2 desde sexta": a diferença para o registro anterior, com o dia dele
 * escrito como se fala — ontem, o dia da semana até 6 dias atrás, a data depois.
 */
export function weightDeltaSinceLabel(
  deltaKg: number,
  previousDate: string,
  today: string,
): string {
  const days = Math.round((utcDay(today) - utcDay(previousDate)) / 86_400_000);
  let when: string;
  if (days <= 0) when = 'hoje cedo';
  else if (days === 1) when = 'ontem';
  else if (days < 7) when = WEEKDAYS[new Date(utcDay(previousDate)).getUTCDay()];
  else when = dayMonth(previousDate).replace(/^0/, '');
  return `${signedKg(deltaKg)} desde ${when}`;
}

/** "6 exercícios" no cartão de próximo treino. */
export function nextWorkoutDetail(exerciseCount: number | null): string | null {
  if (exerciseCount === null) return null;
  return exerciseCount === 1 ? '1 exercício' : `${exerciseCount} exercícios`;
}

/**
 * O traço do mini-gráfico de 30 dias (Al-H4-Peso): pontos igualmente espaçados,
 * o mais pesado no alto. Margem de 10% em cima e embaixo para o traço não colar
 * na borda. Uma linha `path` serve ao SVG da web e ao `react-native-svg`.
 */
export function weightSparkPath(values: readonly number[], width: number, height: number): string {
  if (values.length === 0) return '';
  const pad = height * 0.1;
  if (values.length === 1) {
    const y = round1(height / 2);
    return `M0 ${y} L${width} ${y}`;
  }
  const max = Math.max(...values);
  const min = Math.min(...values);
  const range = max - min;
  const step = width / (values.length - 1);
  return values
    .map((v, i) => {
      const y = range === 0 ? height / 2 : pad + ((max - v) / range) * (height - 2 * pad);
      return `${i === 0 ? 'M' : 'L'}${round1(i * step)} ${round1(y)}`;
    })
    .join(' ');
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/** O cartão de "Compartilhar meu dia" (Al-H5-Metas): o formato de `ShareCard` das duas apps. */
export interface DayShareCard {
  kind: 'day';
  headline: string;
  caption: string;
  stats: { label: string; value: string }[];
}

/**
 * Metas batidas, água, passos e sequência. Peso e comida não entram: o cartão
 * de compartilhar nunca leva corpo (prancha Compartilhar), e caloria é comida.
 */
export function dayShareCard(input: {
  dailyGoals: { met: number; total: number };
  water: { todayMl: number };
  steps: { today: number };
  streakDays: number;
}): DayShareCard {
  return {
    kind: 'day',
    headline: `${input.dailyGoals.met} de ${input.dailyGoals.total}`,
    caption: 'Metas de hoje batidas',
    stats: [
      { label: 'Água', value: `${formatDecimal(input.water.todayMl / 1000)} L` },
      { label: 'Passos', value: formatInteger(input.steps.today) },
      {
        label: 'Sequência',
        value: input.streakDays === 1 ? '1 dia' : `${input.streakDays} dias`,
      },
    ],
  };
}

/** O texto que vai junto (WhatsApp, folha de compartilhar do sistema). */
export function dayShareMessage(card: DayShareCard, who: string | null): string {
  const stats = card.stats.map((s) => `${s.label} ${s.value}`).join(' · ');
  return `${who ? `${who} · ` : ''}${card.caption}: ${card.headline} · ${stats} — fatia`;
}
