/**
 * As telas de Progresso do redesign (#382): G1 Progresso, G5 Recordes, G6 Gráficos,
 * G9/G10 Metas, G11 Conquistas e G12 Constância.
 *
 * O que é regra de apresentação (que texto aparece, em que ordem, que cor) mora aqui para
 * a web e o app dizerem a mesma coisa. Os componentes só desenham.
 */
import { formatDecimal, formatInteger } from './format';
import type { CreateGoalInput, Goal, GoalKind } from './goals';
import type { MealType } from './nutrition';
import type {
  Achievement,
  CardioProgress,
  ConsistencyArea,
  ConsistencyRange,
  ConsistencyReport,
  StepsProgress,
  StrengthProgress,
  WeightProgress,
} from './progress';
import { kgToLoad, loadNumber, loadUnitLabel, type LoadUnit } from './units';
import type { PersonalRecordEntry, RecordsOverview } from './workout';

const MONTHS_SHORT = [
  'jan',
  'fev',
  'mar',
  'abr',
  'mai',
  'jun',
  'jul',
  'ago',
  'set',
  'out',
  'nov',
  'dez',
];
const MONTHS_LONG = [
  'janeiro',
  'fevereiro',
  'março',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro',
];
const WEEKDAYS_SHORT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

/** "4 nov" a partir de `YYYY-MM-DD`, sem o zero na frente (como na prancha). */
export function shortDay(date: string): string {
  const month = Number(date.slice(5, 7));
  const day = Number(date.slice(8, 10));
  if (!month || !day) return '—';
  return `${day} ${MONTHS_SHORT[month - 1]}`;
}

/** "4 nov" de um instante ISO, no fuso de quem está olhando. */
export function shortDayOf(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`;
}

/** `YYYY-MM-DD` de um `Date`, no fuso local. */
export function localDateKey(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** 68 → "68", 68.5 → "68,5": sem ",0" sobrando. */
function trimNumber(value: number): string {
  const fixed = (Math.round(value * 10) / 10).toFixed(1);
  return fixed.endsWith('.0') ? fixed.slice(0, -2) : fixed.replace('.', ',');
}

// Datas como dia de calendário: meio-dia UTC não escorrega de dia com fuso nenhum.
function utcNoon(date: string): Date {
  return new Date(`${date}T12:00:00Z`);
}
function addDays(date: string, n: number): string {
  const d = utcNoon(date);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function weekday(date: string): number {
  return utcNoon(date).getUTCDay();
}

// ---------------------------------------------------------------------------------------------
// Constância (Al-G12)
// ---------------------------------------------------------------------------------------------

export const CONSISTENCY_RANGE_OPTIONS: { value: ConsistencyRange; label: string }[] = [
  { value: 'month', label: '30 dias' },
  { value: 'quarter', label: '90 dias' },
  { value: 'year', label: '1 ano' },
];

/** Cabeçalho das colunas da grade do mês, de segunda a domingo. */
export const CONSISTENCY_WEEKDAY_LABELS = ['S', 'T', 'Q', 'Q', 'S', 'S', 'D'];

export interface ConsistencyCell {
  date: string;
  /** Dia do mês, para a grade de 30 dias. */
  day: number;
  /** `outside`: antes do período; `future`: depois de hoje (contorno, sem cor). */
  kind: 'outside' | 'past' | 'future';
  /** Áreas cumpridas no dia, de 0 a 4. */
  level: number;
}

/**
 * A grade do período, alinhada por semana (segunda a domingo). Em ordem de dia: a web e o
 * app arrumam em linhas de 7 (mês) ou em colunas de 7 (trimestre).
 */
export function consistencyCells(report: ConsistencyReport): ConsistencyCell[] {
  const byDate = new Map(report.days.map((d) => [d.date, d.count]));
  const back = (weekday(report.from) + 6) % 7;
  const forward = (7 - weekday(report.to)) % 7;
  const start = addDays(report.from, -back);
  const end = addDays(report.to, forward);
  const cells: ConsistencyCell[] = [];
  for (let date = start; date <= end; date = addDays(date, 1)) {
    const kind = date < report.from ? 'outside' : date > report.to ? 'future' : 'past';
    cells.push({
      date,
      day: Number(date.slice(8, 10)),
      kind,
      level: kind === 'past' ? Math.min(4, byDate.get(date) ?? 0) : 0,
    });
  }
  return cells;
}

export interface ConsistencyMonth {
  key: string;
  /** Inicial do mês, minúscula ("n"). */
  label: string;
  name: string;
  percent: number;
  current: boolean;
}

/** O ano em 12 barras: % de dias ativos de cada mês, terminando no mês de hoje. */
export function consistencyYearMonths(report: ConsistencyReport): ConsistencyMonth[] {
  const totals = new Map<string, { active: number; total: number }>();
  for (const d of report.days) {
    const key = d.date.slice(0, 7);
    const t = totals.get(key) ?? { active: 0, total: 0 };
    t.total += 1;
    if (d.count > 0) t.active += 1;
    totals.set(key, t);
  }
  const [year, month] = report.to.split('-').map(Number) as [number, number];
  const out: ConsistencyMonth[] = [];
  for (let i = 11; i >= 0; i--) {
    const idx = (year * 12 + (month - 1) - i) as number;
    const y = Math.floor(idx / 12);
    const m = idx % 12;
    const key = `${y}-${String(m + 1).padStart(2, '0')}`;
    const t = totals.get(key);
    out.push({
      key,
      label: MONTHS_LONG[m]!.charAt(0),
      name: MONTHS_LONG[m]!,
      percent: t && t.total > 0 ? Math.round((t.active / t.total) * 100) : 0,
      current: i === 0,
    });
  }
  return out;
}

export interface ConsistencyStat {
  value: string;
  label: string;
  /** O número da sequência leva a chama. */
  fire: boolean;
}

export function consistencyStats(report: ConsistencyReport): ConsistencyStat[] {
  const streak = report.streak.periodos;
  return [
    { value: `${report.activeDays}/${report.totalDays}`, label: 'dias ativos', fire: false },
    { value: String(streak), label: streak === 1 ? 'dia seguido' : 'dias seguidos', fire: true },
    { value: String(report.record), label: 'recorde', fire: false },
  ];
}

export function consistencyGridTitle(report: ConsistencyReport): string {
  if (report.range === 'quarter') return 'Últimas 13 semanas';
  if (report.range === 'year') return 'Mês a mês';
  const first = MONTHS_LONG[Number(report.from.slice(5, 7)) - 1]!;
  const last = MONTHS_LONG[Number(report.to.slice(5, 7)) - 1]!;
  return capitalize(first === last ? first : `${first} e ${last}`);
}

export function consistencyGridCaption(report: ConsistencyReport): string {
  if (report.range === 'quarter') return 'cada coluna é uma semana';
  if (report.range === 'year') return '% de dias ativos';
  return `${shortDay(report.from)} – ${shortDay(report.to)} · cor = áreas cumpridas no dia`;
}

export interface ConsistencyAreaRow {
  area: ConsistencyArea;
  label: string;
  icon: 'apple' | 'dumbbell' | 'drop' | 'steps';
  /** Token de cor do design: `primary`, `protein`, `water`, `steps`. */
  tone: 'primary' | 'protein' | 'water' | 'steps';
  /** "24/30", ou "sem meta" quando a área não tem meta definida. */
  text: string;
  percent: number;
}

const AREA_META: Record<ConsistencyArea, Omit<ConsistencyAreaRow, 'area' | 'text' | 'percent'>> = {
  meal: { label: 'Alimentação', icon: 'apple', tone: 'primary' },
  workout: { label: 'Treinos', icon: 'dumbbell', tone: 'protein' },
  water: { label: 'Água', icon: 'drop', tone: 'water' },
  steps: { label: 'Passos', icon: 'steps', tone: 'steps' },
};

export function consistencyAreaRows(report: ConsistencyReport): ConsistencyAreaRow[] {
  return (['meal', 'workout', 'water', 'steps'] as const).map((area) => {
    const { days, of } = report.byArea[area];
    return {
      area,
      ...AREA_META[area],
      text: of === null ? 'sem meta' : `${days}/${of}`,
      percent: of ? Math.min(100, Math.round((days / of) * 100)) : 0,
    };
  });
}

/**
 * A linha de dica embaixo da grade. Aponta o que vai bem, nunca cobra: "o dia que mais falha"
 * da prancha virou só o lado bom (a sequência já tolera falta; a tela não precisa culpar).
 */
export function consistencyTip(report: ConsistencyReport): string {
  const active = report.days.filter((d) => d.count > 0);
  if (active.length === 0) return 'Um registro já conta o dia: refeição, treino, água ou passos.';

  if (report.range === 'year') {
    const best = consistencyYearMonths(report).reduce((a, b) => (b.percent > a.percent ? b : a));
    return `Seu melhor mês foi ${best.name}, com ${best.percent}% de dias ativos.`;
  }

  if (report.range === 'quarter') {
    const last = report.days.slice(-28).filter((d) => d.count > 0).length;
    const before = report.days.slice(-56, -28).filter((d) => d.count > 0).length;
    if (last > before) return 'Subiu nas últimas 4 semanas.';
    if (last === before) return 'Firme nas últimas 4 semanas.';
    return `${last} dias ativos nas últimas 4 semanas.`;
  }

  const rates = WEEKDAYS_SHORT.map((_, wd) => {
    const of = report.days.filter((d) => weekday(d.date) === wd);
    const on = of.filter((d) => d.count > 0).length;
    return { wd, rate: of.length ? on / of.length : 0 };
  });
  const top = [...rates]
    .filter((r) => r.rate > 0)
    .sort((a, b) => b.rate - a.rate || ((a.wd + 6) % 7) - ((b.wd + 6) % 7))
    .slice(0, 2)
    .sort((a, b) => ((a.wd + 6) % 7) - ((b.wd + 6) % 7));
  const names = top.map((r) => WEEKDAYS_SHORT[r.wd]!);
  if (names.length === 1) return `${names[0]} é seu dia mais forte.`;
  return `${names[0]} e ${names[1]!.toLowerCase()} são seus dias mais fortes.`;
}

// ---------------------------------------------------------------------------------------------
// Conquistas (Al-G11)
// ---------------------------------------------------------------------------------------------

/** Nome de ícone do `@fatia/design` por conquista. */
export const ACHIEVEMENT_ICONS: Record<string, string> = {
  first_meal: 'apple',
  first_workout: 'dumbbell',
  plan_created: 'file',
  first_pr: 'trophy',
  streak_7: 'flame',
  streak_30: 'flame',
  first_full_week: 'target',
  workouts_100: 'medal',
  challenge_finished: 'star',
  challenge_podium: 'trophy',
};

export function achievementIcon(key: string): string {
  return ACHIEVEMENT_ICONS[key] ?? 'medal';
}

const MEAL_TYPE_LABEL: Record<MealType, string> = {
  BREAKFAST: 'café da manhã',
  LUNCH: 'almoço',
  DINNER: 'jantar',
  SNACK: 'lanche',
};

function contextLine(a: Achievement): string | null {
  const c = (a.context ?? {}) as Record<string, unknown>;
  if (typeof c.mealType === 'string') return MEAL_TYPE_LABEL[c.mealType as MealType] ?? null;
  if (typeof c.exerciseName === 'string' && typeof c.weightKg === 'number') {
    return `${c.exerciseName} ${trimNumber(c.weightKg)} kg`;
  }
  if (typeof c.planName === 'string') return c.planName;
  if (typeof c.challengeTitle === 'string') return c.challengeTitle;
  return null;
}

/** A linha do cartão de detalhe da conquista selecionada. */
export function achievementDetail(a: Achievement): { unlocked: boolean; text: string } {
  if (a.unlockedAt) {
    const ctx = contextLine(a);
    return {
      unlocked: true,
      text: `Desbloqueada em ${shortDayOf(a.unlockedAt)}${ctx ? ` · ${ctx}` : ''}`,
    };
  }
  if (a.progress) {
    const left = Math.max(0, a.progress.target - a.progress.current);
    return { unlocked: false, text: `Bloqueada · faltam ${left}` };
  }
  const cond = a.condition ? a.condition.charAt(0).toLowerCase() + a.condition.slice(1) : '';
  return { unlocked: false, text: cond ? `Bloqueada · ${cond}` : 'Bloqueada' };
}

export function achievementTally(list: Achievement[]): { got: number; total: number } {
  return { got: list.filter((a) => a.unlockedAt).length, total: list.length };
}

// ---------------------------------------------------------------------------------------------
// Recordes (Al-G5)
// ---------------------------------------------------------------------------------------------

export type RecordGroupFilter = 'all' | 'pernas' | 'costas' | 'peito' | 'braço';

export const RECORD_GROUP_FILTERS: { value: RecordGroupFilter; label: string }[] = [
  { value: 'all', label: 'Todos' },
  { value: 'pernas', label: 'Pernas' },
  { value: 'costas', label: 'Costas' },
  { value: 'peito', label: 'Peito' },
  { value: 'braço', label: 'Braço' },
];

export const RECORDS_NOTE =
  'O destaque compara, em %, o 1RM estimado do começo e do fim do mês. Assim dá para comparar exercícios com cargas bem diferentes.';

function loadInt(kg: number, unit: LoadUnit): string {
  return formatInteger(kgToLoad(kg, unit));
}

export interface RecordHighlight {
  title: string;
  percent: string;
  scale: string;
  /** Onde o começo do mês fica na barra (o fim é 100%). */
  barPercent: number;
}

export function recordHighlight(overview: RecordsOverview, unit: LoadUnit): RecordHighlight | null {
  const h = overview.highlight;
  const ev = h?.monthEvolution;
  if (!h || !ev) return null;
  return {
    title: h.exerciseName,
    percent: `+${Math.round(ev.percent)}%`,
    scale: `1RM ${loadInt(ev.startE1RM, unit)} → ${loadInt(ev.endE1RM, unit)} ${loadUnitLabel(unit)}`,
    barPercent: ev.endE1RM > 0 ? Math.round((ev.startE1RM / ev.endE1RM) * 100) : 0,
  };
}

export interface RecordRow {
  id: number;
  title: string;
  subtitle: string;
  value: string;
  unit: string;
}

function isStrength(r: PersonalRecordEntry): boolean {
  return r.type === 'strength' && r.maxWeightKg !== null;
}

/** Recordes de força do grupo, do maior 1RM estimado para o menor. */
export function strengthRecordRows(
  overview: RecordsOverview,
  group: RecordGroupFilter,
  unit: LoadUnit,
): RecordRow[] {
  return overview.records
    .filter(isStrength)
    .filter((r) => group === 'all' || r.muscleGroup === group)
    .sort((a, b) => (b.estimated1RM ?? b.maxWeightKg ?? 0) - (a.estimated1RM ?? a.maxWeightKg ?? 0))
    .map((r) => ({
      id: r.exerciseId,
      title: r.exerciseName,
      subtitle: [
        r.repsAtMax !== null ? `${r.repsAtMax} reps` : null,
        r.estimated1RM !== null ? `1RM ~${loadInt(r.estimated1RM, unit)}` : null,
        r.achievedAt ? shortDayOf(r.achievedAt) : null,
      ]
        .filter(Boolean)
        .join(' · '),
      value: loadNumber(r.maxWeightKg, unit),
      unit: loadUnitLabel(unit),
    }));
}

/** Quantos recordes de força a pessoa tem: o "7 recordes" do G1. */
export function strengthRecordCount(overview: RecordsOverview): number {
  return overview.records.filter(isStrength).length;
}

// ---------------------------------------------------------------------------------------------
// Metas (Al-G9, Al-G10)
// ---------------------------------------------------------------------------------------------

export type GoalTab = 'active' | 'completed' | 'archived';

export const GOAL_TABS: { value: GoalTab; label: string }[] = [
  { value: 'active', label: 'Ativas' },
  { value: 'completed', label: 'Concluídas' },
  { value: 'archived', label: 'Arquivadas' },
];

/** Meta vencida fica nas ativas, com o selo "prazo passou": ainda dá para dar novo prazo. */
export function goalTab(goal: Goal): GoalTab {
  if (goal.status === 'completed') return 'completed';
  if (goal.status === 'archived') return 'archived';
  return 'active';
}

export type GoalBadgeTone = 'ok' | 'warn' | 'pro' | 'mute';

export function goalBadge(goal: Goal): { label: string; tone: GoalBadgeTone } {
  switch (goal.status) {
    case 'expired':
      return { label: 'prazo passou', tone: 'warn' };
    case 'completed':
      return { label: 'concluída', tone: 'pro' };
    case 'archived':
      return { label: 'arquivada', tone: 'mute' };
    default:
      return { label: 'ativa', tone: 'ok' };
  }
}

function goalValue(goal: Goal): string {
  const cur = goal.currentValue;
  const showTarget = goal.status === 'active' || goal.status === 'archived';
  switch (goal.kind) {
    case 'weight':
      return `${cur === null ? '—' : formatDecimal(cur)} kg${showTarget ? ` · alvo ${trimNumber(goal.targetValue)}` : ''}`;
    case 'body_fat':
      return `${cur === null ? '—' : trimNumber(cur)}%${showTarget ? ` · alvo ${trimNumber(goal.targetValue)}%` : ''}`;
    case 'workout_frequency':
      return `${cur === null ? '—' : formatDecimal(cur)} de ${trimNumber(goal.targetValue)}`;
    case 'step_count':
      return `média ${cur === null ? '—' : formatInteger(cur)}${showTarget ? ` · alvo ${formatInteger(goal.targetValue)}` : ''}`;
    default:
      return `${cur === null ? '—' : trimNumber(cur)} de ${trimNumber(goal.targetValue)}${goal.unit ? ` ${goal.unit}` : ''}`;
  }
}

/** A linha de baixo do cartão: onde está, o alvo e o prazo. */
export function goalSubtitle(goal: Goal): string {
  let tail: string;
  if (goal.status === 'completed') tail = `concluída em ${shortDayOf(goal.completedAt)}`;
  else if (goal.status === 'expired') tail = `prazo era ${shortDayOf(goal.deadline)}`;
  else tail = goal.deadline ? `até ${shortDayOf(goal.deadline)}` : 'sem prazo';
  return `${goalValue(goal)} · ${tail}`;
}

export function goalProgress(goal: Goal): number {
  if (goal.status === 'completed') return 100;
  if (goal.progressPercent === null) return 0;
  return Math.max(0, Math.min(100, Math.round(goal.progressPercent)));
}

export const GOAL_KIND_ICONS: Record<GoalKind, string> = {
  weight: 'scale',
  body_fat: 'ruler',
  workout_frequency: 'dumbbell',
  step_count: 'steps',
  custom: 'target',
};

export interface GoalKindOption {
  kind: GoalKind;
  label: string;
  icon: string;
  /** O que vai para a API (e aparece ao lado do alvo). */
  unit: string;
  /** Passo do − e + do alvo. */
  step: number;
  initialTarget: number;
  /** Atualiza sozinha (peso, treinos, passos) ou a pessoa marca o progresso. */
  auto: boolean;
  placeholder: string;
}

export const GOAL_KIND_OPTIONS: GoalKindOption[] = [
  {
    kind: 'weight',
    label: 'Peso',
    icon: 'scale',
    unit: 'kg',
    step: 0.5,
    initialTarget: 70,
    auto: true,
    placeholder: 'Chegar a 68 kg',
  },
  // % de gordura ainda é marcada à mão: a fonte automática (a avaliação) chega com a #383.
  {
    kind: 'body_fat',
    label: '% gordura',
    icon: 'ruler',
    unit: '%',
    step: 0.5,
    initialTarget: 20,
    auto: false,
    placeholder: 'Baixar para 20%',
  },
  {
    kind: 'workout_frequency',
    label: 'Treinos/sem',
    icon: 'dumbbell',
    unit: 'treinos',
    step: 1,
    initialTarget: 4,
    auto: true,
    placeholder: '4 treinos por semana',
  },
  {
    kind: 'step_count',
    label: 'Passos/dia',
    icon: 'steps',
    unit: 'passos',
    step: 500,
    initialTarget: 10000,
    auto: true,
    placeholder: '10 mil passos por dia',
  },
  {
    kind: 'custom',
    label: 'Outra',
    icon: 'target',
    unit: 'vezes',
    step: 1,
    initialTarget: 10,
    auto: false,
    placeholder: 'Ler 12 livros no ano',
  },
];

export function goalKindOption(kind: GoalKind): GoalKindOption {
  return GOAL_KIND_OPTIONS.find((o) => o.kind === kind) ?? GOAL_KIND_OPTIONS[4]!;
}

export function goalAutoText(kind: GoalKind): string {
  return goalKindOption(kind).auto
    ? 'Atualiza sozinha a cada registro.'
    : 'Você marca o progresso à mão.';
}

/** Os textos do G9: o rodapé (fala só do que de fato se atualiza sozinho hoje). */
export const GOALS_FOOTER =
  'Peso, treinos e passos atualizam sozinhos. Também dá para criar pelo Claude.';

function defaultGoalTitle(kind: GoalKind, target: number): string {
  switch (kind) {
    case 'weight':
      return `Chegar a ${trimNumber(target)} kg`;
    case 'body_fat':
      return `Chegar a ${trimNumber(target)}% de gordura`;
    case 'workout_frequency':
      return `${trimNumber(target)} treinos por semana`;
    case 'step_count':
      return `${target % 1000 === 0 ? `${target / 1000} mil` : formatInteger(target)} passos por dia`;
    default:
      return `Chegar a ${trimNumber(target)}`;
  }
}

/** O prazo é o fim do dia escolhido, no fuso de quem cria. */
export function goalDeadlineIso(date: string): string {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  return new Date(y, m - 1, d, 23, 59, 59).toISOString();
}

export type GoalDeadlineChoice = 'none' | 'year_end' | 'pick';

/** As opções de prazo do G10: sem prazo, o fim do ano e escolher uma data. */
export function goalDeadlineChoices(
  today: Date,
): { value: GoalDeadlineChoice; label: string; date: string | null }[] {
  return [
    { value: 'none', label: 'Sem prazo', date: null },
    { value: 'year_end', label: '31 dez', date: `${today.getFullYear()}-12-31` },
    { value: 'pick', label: 'Escolher', date: null },
  ];
}

export function goalCreateInput(draft: {
  kind: GoalKind;
  title: string;
  target: number;
  /** `YYYY-MM-DD` ou `null` para sem prazo. */
  deadline: string | null;
}): CreateGoalInput {
  const option = goalKindOption(draft.kind);
  return {
    kind: draft.kind,
    title: draft.title.trim() || defaultGoalTitle(draft.kind, draft.target),
    targetValue: draft.target,
    unit: option.unit,
    ...(draft.deadline ? { deadline: goalDeadlineIso(draft.deadline) } : {}),
  };
}

// ---------------------------------------------------------------------------------------------
// Gráficos (Al-G1, Al-G6)
// ---------------------------------------------------------------------------------------------

export type ChartKind = 'weight' | 'steps' | 'strength' | 'cardio';

export const CHART_KINDS: { value: ChartKind; label: string; icon: string }[] = [
  { value: 'weight', label: 'Peso', icon: 'scale' },
  { value: 'steps', label: 'Passos', icon: 'steps' },
  { value: 'strength', label: 'Força', icon: 'dumbbell' },
  { value: 'cardio', label: 'Cardio', icon: 'heart' },
];

export const CHART_RANGES: { value: number; label: string }[] = [
  { value: 14, label: '14d' },
  { value: 30, label: '30d' },
  { value: 90, label: '90d' },
  { value: 180, label: '180d' },
];

/** O período do G1. */
export const OVERVIEW_RANGES: { value: number; label: string }[] = [
  { value: 30, label: '30d' },
  { value: 90, label: '90d' },
  { value: 365, label: '1 ano' },
];

export type StrengthChartMetric = 'max_weight' | 'estimated_1rm' | 'total_volume';

export const STRENGTH_METRICS: { value: StrengthChartMetric; label: string }[] = [
  { value: 'max_weight', label: 'Carga máx' },
  { value: 'estimated_1rm', label: '1RM est.' },
  { value: 'total_volume', label: 'Volume' },
];

export const CHART_NOTES: Record<ChartKind, string> = {
  weight: 'Peso entra pelo Hoje ou pela balança conectada.',
  steps: 'Passos chegam do Apple Saúde ou Health Connect.',
  strength: 'Força usa a maior carga de cada sessão.',
  cardio: 'Cardio soma os exercícios de esteira, bike e corrida dos seus treinos.',
};

/** Variação em % do primeiro valor para o último; `null` sem dois pontos ou partindo de zero. */
export function trendPercent(values: number[]): number | null {
  if (values.length < 2) return null;
  const first = values[0]!;
  const last = values[values.length - 1]!;
  if (first === 0) return null;
  return Math.round(((last - first) / first) * 100);
}

/** "+4%", "−3%", "0%". */
export function signedPercent(p: number): string {
  if (p > 0) return `+${p}%`;
  if (p < 0) return `−${Math.abs(p)}%`;
  return '0%';
}

/** "−0,4 kg" / "+1,2 kg". */
export function signedDelta(value: number, unit: string, digits = 1): string {
  const abs = formatDecimal(Math.abs(value), digits);
  const sign = value > 0 ? '+' : value < 0 ? '−' : '';
  return `${sign}${abs}${unit ? ` ${unit}` : ''}`;
}

/** O `d` de um `<path>` de linha que ocupa a caixa (y cresce para baixo). */
export function linePath(values: number[], width: number, height: number): string {
  if (values.length === 0) return '';
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pad = 2;
  const step = values.length > 1 ? width / (values.length - 1) : 0;
  return values
    .map((v, i) => {
      const x = Math.round(i * step * 10) / 10;
      const y = Math.round((pad + (1 - (v - min) / span) * (height - pad * 2)) * 10) / 10;
      return `${i === 0 ? 'M' : 'L'}${x} ${y}`;
    })
    .join(' ');
}

/** Altura de cada barra em % do maior valor (mínimo 4% para a barra existir). */
export function barHeights(values: number[]): number[] {
  const max = Math.max(0, ...values);
  if (max === 0) return values.map(() => 4);
  return values.map((v) => Math.max(4, Math.round((v / max) * 100)));
}

/** Junta a série em `n` baldes somando (passos, cardio): as 12 barras da prancha. */
export function bucketize(values: number[], n: number, mode: 'sum' | 'avg' = 'sum'): number[] {
  if (values.length <= n) return values;
  const size = values.length / n;
  return Array.from({ length: n }, (_, i) => {
    const slice = values.slice(Math.floor(i * size), Math.floor((i + 1) * size));
    const total = slice.reduce((a, b) => a + b, 0);
    return mode === 'avg' && slice.length ? total / slice.length : total;
  });
}

/** "7:24" de segundos por km. */
export function formatPace(secondsPerKm: number | null): string {
  if (secondsPerKm === null || !Number.isFinite(secondsPerKm) || secondsPerKm <= 0) return '—';
  const total = Math.round(secondsPerKm);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

/** Ritmo médio do cardio no período: soma do tempo pela soma da distância. */
export function averagePace(cardio: CardioProgress): number | null {
  const withDistance = cardio.points.filter((p) => p.distanceMeters && p.distanceMeters > 0);
  const meters = withDistance.reduce((a, p) => a + (p.distanceMeters ?? 0), 0);
  const seconds = withDistance.reduce((a, p) => a + p.durationSeconds, 0);
  return meters > 0 ? seconds / (meters / 1000) : null;
}

export interface ChartSummaryItem {
  label: string;
  value: string;
}

export function weightSummary(w: WeightProgress): ChartSummaryItem[] {
  const values = w.points.map((p) => p.weightKg);
  const avg = values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
  const fmt = (v: number | null | undefined) => (v == null ? '—' : `${formatDecimal(v)} kg`);
  return [
    { label: 'no início', value: fmt(values[0]) },
    { label: 'média', value: fmt(avg) },
    { label: 'agora', value: fmt(w.currentWeightKg ?? values.at(-1)) },
  ];
}

export function stepsSummary(s: StepsProgress): ChartSummaryItem[] {
  return [
    { label: 'melhor dia', value: s.bestDay ? formatInteger(s.bestDay.steps) : '—' },
    { label: 'média', value: s.points.length ? formatInteger(s.averageDaily) : '—' },
    {
      label: 'dias na meta',
      value: s.goalTarget === null ? 'sem meta' : String(s.daysWithGoalReached),
    },
  ];
}

/** Quantas sessões no período bateram a melhor marca até então. */
export function newBestCount(values: number[]): number {
  let best = -Infinity;
  let count = 0;
  values.forEach((v, i) => {
    if (i > 0 && v > best) count += 1;
    best = Math.max(best, v);
  });
  return count;
}

export function strengthSummary(s: StrengthProgress, unit: LoadUnit): ChartSummaryItem[] {
  const isVolume = s.metric === 'total_volume';
  const fmt = (v: number | null) =>
    v === null
      ? '—'
      : isVolume
        ? `${formatInteger(kgToLoad(v, unit))} ${loadUnitLabel(unit)}`
        : `${loadNumber(v, unit)} ${loadUnitLabel(unit)}`;
  return [
    { label: 'no início', value: fmt(s.startValue) },
    { label: 'agora', value: fmt(s.currentValue) },
    { label: 'recordes', value: String(newBestCount(s.points.map((p) => p.value))) },
  ];
}

export function cardioSummary(c: CardioProgress): ChartSummaryItem[] {
  const pace = averagePace(c);
  const longest = Math.max(0, ...c.points.map((p) => p.distanceMeters ?? 0));
  return [
    { label: 'sessões', value: String(c.points.length) },
    { label: 'média', value: pace === null ? '—' : `${formatPace(pace)} /km` },
    { label: 'maior distância', value: longest > 0 ? `${formatDecimal(longest / 1000)} km` : '—' },
  ];
}
