import {
  challengePeriod,
  CHECKIN_BLOCK_TAG,
  CHECKIN_BLOCK_TEXT,
  formatDecimal,
  formatInteger,
  maxPointsOf,
  METRIC_INFO,
  POINT_ITEMS,
  CREATABLE_CHALLENGE_KINDS,
  CREATABLE_POINT_ITEMS,
  STEPS_SYNC_AVAILABLE,
  POINT_VALUE_MAX,
  REVIEW_REASON_MAX,
  REVIEW_REASON_MIN,
  scoreLabel,
  STEP_SOURCE_LABEL,
  STEP_SOURCES,
  type ActivityItem,
  type Challenge,
  type ChallengeDetail,
  type ChallengeInput,
  type ChallengeKind,
  type ChallengeMetric,
  type ChallengeToday,
  type CheckinEligibility,
  type CheckinWorkout,
  type LeaderboardEntry,
  type PointItem,
  type PointsTable,
  type StepSource,
} from '@fatia/api-client';
import type { IconName } from '@fatia/design';
import { challengeWindow, type DurationChoice, type StartChoice } from './window-choice';

/**
 * O que as telas de desafio do app mostram, sem React: o resumo do cartão
 * (Cm-08), o herói e as abas (Cm-17*), o pódio (Cm-11), a câmera do check-in
 * (Cm-18) e o formulário da equipe (Pn-13). Os valores de hoje (ml, passos)
 * são sempre da própria pessoa; dos outros, só dias ou pontos (ADR 044).
 */

const DAY_KINDS: readonly ChallengeKind[] = ['PHOTO', 'WATER', 'STEPS', 'NUTRITION'];
/** Métricas de antes que contam dias, e cabem numa barra "X de N". */
const DAY_METRICS: readonly ChallengeMetric[] = ['ACTIVE_DAYS', 'STREAK_DAYS'];

const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

/** 2500 → "2,5 L"; 4000 → "4 L". */
export function liters(ml: number): string {
  return `${formatDecimal(ml / 1000).replace(/,0$/, '')} L`;
}

/** 1800 de 2500 → "1,8 de 2,5 L". */
export function litersOf(ml: number, goal: number): string {
  return `${liters(ml).replace(/ L$/, '')} de ${liters(goal)}`;
}

/** "18:54", no relógio do aparelho. */
export function clock(iso: string | Date): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function shortDate(ymd: string): string {
  const [, m, d] = ymd.split('-').map(Number);
  return `${d} ${MONTHS[(m ?? 1) - 1]}`;
}

function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86_400_000);
}

/** "a, b e c". */
function joinPt(list: string[]): string {
  if (list.length <= 1) return list.join('');
  return `${list.slice(0, -1).join(', ')} e ${list.at(-1)}`;
}

function pts(n: number): string {
  return `${formatInteger(n)} ${n === 1 ? 'pt' : 'pts'}`;
}

function streakDays(n: number): string {
  return `${n} ${n === 1 ? 'dia seguido' : 'dias seguidos'}`;
}

// ---------------------------------------------------------------------------
// Resumo do participante: cartão da lista e herói da tela.

export interface ParticipantSummary {
  /** "12 de 30 dias", "86 pts", "3 treinos". */
  progress: string;
  /** Fração para a barra, ou `null` quando não há "de N". */
  pct: number | null;
  /** "4 seguidos", ou `null` sem sequência. */
  streak: string | null;
  /** "5º", ou `null` sem posição. */
  rank: string | null;
}

export function participantSummary(c: Challenge): ParticipantSummary | null {
  if (!c.me) return null;
  const { score, streak, rank } = c.me;
  const days =
    DAY_KINDS.includes(c.kind) || (c.kind === 'METRIC' && DAY_METRICS.includes(c.metric));
  const progress =
    c.kind === 'POINTS'
      ? pts(score)
      : days
        ? `${formatInteger(score)} de ${c.totalDays} dias`
        : scoreLabel(c.metric, score);
  return {
    progress,
    pct: days && c.totalDays > 0 ? Math.min(1, score / c.totalDays) : null,
    streak: streak > 0 ? `${streak} seguidos` : null,
    rank: rank === null ? null : `${rank}º`,
  };
}

/** "12 de 30 dias · 5º", "86 pontos · 2º". */
export function heroTitle(c: Challenge): string {
  const s = participantSummary(c);
  if (!s || !c.me) return '';
  const progress = c.kind === 'POINTS' ? `${formatInteger(c.me.score)} pontos` : s.progress;
  return s.rank ? `${progress} · ${s.rank}` : progress;
}

const SHORT_ITEM: Record<PointItem, string> = {
  workout: 'treino',
  water: 'água',
  steps: 'passos',
  protein: 'proteína',
  kcal: 'calorias',
};

function itemOf(today: ChallengeToday | null, item: PointItem) {
  return today?.items.find((i) => i.item === item) ?? null;
}

/** A linha de baixo do herói: o de hoje, só da própria pessoa. */
export function heroSubtitle(c: ChallengeDetail): string {
  if (!c.me) return '';
  const seq = streakDays(c.me.streak);
  const t = c.status === 'running' ? c.today : null;
  if (!t) return c.me.streak > 0 ? seq : '';
  switch (c.kind) {
    case 'PHOTO':
      return `${seq} · ${t.checkedInAt ? 'check-in de hoje feito' : 'hoje ainda não'}`;
    case 'WATER': {
      const w = itemOf(t, 'water');
      return w?.goal ? `Hoje: ${litersOf(w.value ?? 0, w.goal)}` : seq;
    }
    case 'STEPS': {
      const s = itemOf(t, 'steps');
      return s?.goal
        ? `Hoje: ${formatInteger(s.value ?? 0)} de ${formatInteger(s.goal)} passos`
        : seq;
    }
    case 'NUTRITION': {
      const done = t.items.some((i) => i.done);
      return `${seq} · ${done ? 'hoje na meta' : 'hoje ainda não'}`;
    }
    case 'POINTS': {
      const falta = t.items.filter((i) => !i.done).map((i) => SHORT_ITEM[i.item]);
      const base = `Hoje: ${t.points} de ${t.maxPoints ?? maxPointsOf(c.rules.pointsTable ?? {})}`;
      return falta.length
        ? `${base} · ${falta.length === 1 ? 'falta' : 'faltam'} ${joinPt(falta)}`
        : base;
    }
    default:
      return seq;
  }
}

/** Fração da barra do herói: água e passos pelo de hoje; o resto pelos dias. */
export function heroPct(c: ChallengeDetail): number | null {
  const t = c.status === 'running' ? c.today : null;
  const item =
    c.kind === 'WATER' ? itemOf(t, 'water') : c.kind === 'STEPS' ? itemOf(t, 'steps') : null;
  if (item?.goal) return Math.min(1, (item.value ?? 0) / item.goal);
  if (c.kind === 'POINTS' && t?.maxPoints) return Math.min(1, t.points / t.maxPoints);
  return participantSummary(c)?.pct ?? null;
}

// ---------------------------------------------------------------------------
// Privacidade, botão principal e pontos de hoje.

/** A linha do olho (Cm-17b): quem vê o quê, por tipo. */
export function privacyLine(c: Challenge): string | null {
  switch (c.kind) {
    case 'PHOTO':
      return 'Sua foto é prova: só você e a equipe que revisa veem. Os outros veem só que você fez check-in.';
    case 'WATER':
      return 'Os outros veem só se você bateu a meta no dia. Quantos ml você registrou fica com você.';
    case 'STEPS':
      return `Os outros veem só os dias em que você chegou a ${formatInteger(c.rules.stepsGoal ?? 10000)} passos. Seu total fica com você.`;
    case 'NUTRITION':
      return 'Ninguém vê o que você comeu. O ranking mostra só os dias em que você chegou na sua meta.';
    case 'POINTS':
      return 'O ranking mostra só os pontos. Ninguém vê seus ml, passos, gramas nem a foto do check-in.';
    default:
      return null;
  }
}

/** O desafio tem check-in com foto (o tipo foto, ou pontos com treino na tabela). */
export function usesCheckin(c: Pick<Challenge, 'kind' | 'rules'>): boolean {
  return c.kind === 'PHOTO' || (c.kind === 'POINTS' && (c.rules.pointsTable?.workout ?? 0) > 0);
}

export type ChallengeAction = 'checkin' | 'water' | 'meal' | 'steps';

export interface ChallengeCta {
  label: string;
  action: ChallengeAction;
  icon: IconName;
}

/** O botão preso embaixo da tela do desafio, por tipo. */
export function challengeCta(c: ChallengeDetail): ChallengeCta | null {
  if (!c.me || c.status !== 'running') return null;
  const feito = Boolean(c.today?.checkedInAt);
  if (c.kind === 'PHOTO') {
    return feito ? null : { label: 'Fazer check-in de hoje', action: 'checkin', icon: 'camera' };
  }
  if (c.kind === 'POINTS') {
    if (!usesCheckin(c) || feito) return null;
    return {
      label: `Fazer check-in (+${pts(c.rules.pointsTable?.workout ?? 0)})`,
      action: 'checkin',
      icon: 'camera',
    };
  }
  if (c.kind === 'WATER') return { label: 'Registrar água', action: 'water', icon: 'drop' };
  if (c.kind === 'NUTRITION') return { label: 'Registrar refeição', action: 'meal', icon: 'apple' };
  return null;
}

/** O botão do cartão da lista: só para quem participa, em andamento, com check-in. */
export function listNeedsCheckin(c: Challenge): boolean {
  return Boolean(c.me) && c.status === 'running' && usesCheckin(c);
}

export const POINT_ICON: Record<PointItem, IconName> = {
  workout: 'camera',
  water: 'drop',
  steps: 'steps',
  protein: 'apple',
  kcal: 'flame',
};

const ITEM_ACTION: Record<PointItem, ChallengeAction> = {
  workout: 'checkin',
  water: 'water',
  steps: 'steps',
  protein: 'meal',
  kcal: 'meal',
};

const ITEM_TITLE: Record<PointItem, string> = {
  workout: 'Treino com check-in',
  water: 'Água na meta',
  steps: 'Passos na meta',
  protein: 'Proteína na meta',
  kcal: 'Dia na faixa de calorias',
};

export interface TodayRow {
  item: PointItem;
  icon: IconName;
  title: string;
  detail: string;
  points: string;
  done: boolean;
  action: ChallengeAction;
}

/** "Seus pontos de hoje" (Cm-17c): uma linha por item da tabela. */
export function todayRows(t: ChallengeToday): TodayRow[] {
  return t.items.map((i) => {
    let detail: string;
    if (i.item === 'water' && i.goal) detail = litersOf(i.value ?? 0, i.goal);
    else if (i.item === 'steps' && i.goal)
      detail = `${formatInteger(i.value ?? 0)} de ${formatInteger(i.goal)}`;
    else if (i.item === 'workout')
      detail = i.done
        ? t.checkedInAt
          ? `check-in às ${clock(t.checkedInAt)}`
          : 'check-in feito'
        : 'faça o check-in depois do treino';
    else detail = i.done ? 'na meta hoje' : 'ainda não';
    return {
      item: i.item,
      icon: POINT_ICON[i.item],
      title: ITEM_TITLE[i.item],
      detail,
      points: `+${i.points}`,
      done: i.done,
      action: ITEM_ACTION[i.item],
    };
  });
}

// ---------------------------------------------------------------------------
// Regras (aba Regras do Cm-17*).

export interface RuleLine {
  icon: IconName;
  title: string;
  text: string;
}

const REVIEW_RULE: RuleLine = {
  icon: 'trophy',
  title: 'Resultado depois da revisão',
  text: 'O pódio sai depois do fim, quando a fila de revisão estiver vazia (até 24 h).',
};

export function challengeRules(c: Challenge): RuleLine[] {
  const r = c.rules;
  const min = r.checkin?.minWorkoutMinutes ?? 20;
  const janela = r.checkin?.windowHours ?? 2;
  const meta = r.waterGoalMl ?? 2500;
  const teto = r.dailyCap ?? 4000;
  const passos = formatInteger(r.stepsGoal ?? 10000);
  const fontes = r.allowedStepSources
    .filter((s) => s !== 'MANUAL')
    .map((s) => STEP_SOURCE_LABEL[s]);
  const fontesTexto = fontes.length
    ? `Vêm de ${joinPt(fontes)}. Passos digitados à mão não contam.`
    : 'Vêm do celular ou do relógio. Passos digitados à mão não contam.';
  switch (c.kind) {
    case 'PHOTO':
      return [
        {
          icon: 'camera',
          title: 'Foto tirada na hora, pelo app',
          text: 'A galeria fica fechada. Foto repetida ou já usada é barrada.',
        },
        {
          icon: 'dumbbell',
          title: 'Ligada a um treino registrado',
          text: `O check-in puxa o treino do app. Precisa de pelo menos ${min} min.`,
        },
        {
          icon: 'clock',
          title: `Até ${janela} h depois do treino`,
          text: 'Treino lançado depois, com data passada, não conta.',
        },
        {
          icon: 'check',
          title: 'Um check-in por dia',
          text: 'Vale 1 ponto por dia, mesmo treinando duas vezes.',
        },
        {
          icon: 'lock',
          title: 'A foto é prova',
          text: 'Só você e a equipe que revisa veem. Foto de corpo é anulada. Ela é apagada 30 dias depois do fim.',
        },
        {
          icon: 'alert',
          title: 'Qualquer participante pode sinalizar',
          text: '“Não parece válido” manda o check-in para a equipe, sem mostrar a foto a quem sinalizou. Enquanto isso, ele não conta.',
        },
        {
          icon: 'shield',
          title: 'A equipe decide',
          text: 'Se a equipe anular, a pessoa é avisada com o motivo. Editar o treino depois do check-in também manda para revisão.',
        },
        REVIEW_RULE,
      ];
    case 'WATER':
      return [
        {
          icon: 'target',
          title: 'Conta o dia, não o total',
          text: `Vale 1 ponto por dia em que você chega a ${liters(meta)}. Beber mais não dá mais pontos.`,
        },
        {
          icon: 'shield',
          title: `Até ${liters(teto)} por dia`,
          text: 'Acima disso o app não soma. Água demais também faz mal.',
        },
        {
          icon: 'clock',
          title: 'Só o registro do próprio dia',
          text: 'Dá para corrigir até as 3h da manhã seguinte. Lançar dias passados não conta.',
        },
        {
          icon: 'eye',
          title: 'Os outros não veem seus ml',
          text: 'O ranking mostra só os dias na meta.',
        },
        {
          icon: 'alert',
          title: 'Registro fora do padrão vai para revisão',
          text: 'Ex.: a meta lançada de uma vez, perto da meia-noite, todo dia. Só você e a equipe veem.',
        },
        REVIEW_RULE,
      ];
    case 'STEPS':
      return [
        { icon: 'steps', title: 'Só passos do celular ou relógio', text: fontesTexto },
        {
          icon: 'target',
          title: `Conta o dia com ${passos}`,
          text: '1 ponto por dia. Andar o triplo não vale 3.',
        },
        {
          icon: 'clock',
          title: 'Sincroniza até as 3h',
          text: 'Passos que chegam depois disso não entram no dia.',
        },
        {
          icon: 'alert',
          title: 'Salto estranho vai para revisão',
          text: 'Ex.: 15 mil passos em 10 minutos. Só você e a equipe veem.',
        },
        {
          icon: 'eye',
          title: 'Os outros veem só os dias',
          text: 'Seu total de passos não aparece no ranking.',
        },
        REVIEW_RULE,
      ];
    case 'NUTRITION': {
      const kcal = c.metric === 'KCAL_IN_RANGE_DAYS';
      return [
        {
          icon: 'target',
          title: kcal ? 'Dias na sua faixa de calorias' : 'Dias batendo a sua proteína',
          text: kcal
            ? 'Conta o dia em que você fica dentro da faixa da sua meta. Cada um tem a própria meta.'
            : 'Conta o dia em que você chega no mínimo da sua meta. Cada um tem a própria meta.',
        },
        {
          icon: 'eye',
          title: 'Ninguém vê o que você comeu',
          text: 'O ranking mostra só os dias. Nem gramas, nem calorias, nem refeições.',
        },
        {
          icon: 'clock',
          title: 'Só o próprio dia',
          text: 'Dá para registrar até as 3h da manhã seguinte. Dias passados não contam.',
        },
        {
          icon: 'heart',
          title: 'Nunca “quem come menos”',
          text: 'Desafio de nutrição conta faixa ou mínimo. Nunca menos calorias nem perda de peso.',
        },
      ];
    }
    case 'POINTS': {
      const t = r.pointsTable ?? {};
      const linhas: RuleLine[] = [];
      if (t.workout)
        linhas.push({
          icon: 'camera',
          title: `Treino com check-in: ${pts(t.workout)}`,
          text: `Mesmas regras do check-in com foto: na hora, pelo app, ligado a um treino de ${min} min ou mais. A foto só você e a equipe veem.`,
        });
      if (t.water)
        linhas.push({
          icon: 'drop',
          title: `Água na meta: ${pts(t.water)}`,
          text: `Meta de ${liters(meta)}; até ${liters(teto)} por dia contam.`,
        });
      if (t.steps)
        linhas.push({
          icon: 'steps',
          title: `${passos} passos: ${pts(t.steps)}`,
          text: 'Só passos do celular ou relógio.',
        });
      if (t.protein)
        linhas.push({
          icon: 'apple',
          title: `Proteína na meta: ${pts(t.protein)}`,
          text: 'Ninguém vê o que você comeu.',
        });
      if (t.kcal)
        linhas.push({
          icon: 'flame',
          title: `Dia na faixa de calorias: ${pts(t.kcal)}`,
          text: 'Dentro da faixa, nunca abaixo.',
        });
      linhas.push({
        icon: 'shield',
        title: `Máximo de ${pts(r.maxPointsPerDay ?? maxPointsOf(t))} por dia`,
        text: 'Treinar duas vezes não dobra os pontos.',
      });
      linhas.push({
        icon: 'alert',
        title: 'Qualquer ponto pode ir para revisão',
        text: 'Enquanto a equipe decide, aquele ponto fica pendente.',
      });
      linhas.push(REVIEW_RULE);
      return linhas;
    }
    default:
      return [
        { icon: 'target', title: METRIC_INFO[c.metric].label, text: METRIC_INFO[c.metric].explain },
        {
          icon: 'eye',
          title: 'Só quem participa entra no ranking',
          text: 'Os outros veem seu apelido e sua pontuação, nada além disso.',
        },
      ];
  }
}

// ---------------------------------------------------------------------------
// Atividade.

/** "hoje 18:54", "ontem", "3 nov". */
export function whenLabel(date: string, at: string | null, today: string): string {
  const diff = daysBetween(date, today);
  const dia = diff === 0 ? 'hoje' : diff === 1 ? 'ontem' : shortDate(date);
  return at ? `${dia} ${clock(at)}` : dia;
}

export function activityText(
  item: ActivityItem,
  c: Pick<Challenge, 'kind' | 'metric' | 'rules'>,
): { title: string; detail: string | null } {
  if (item.type === 'checkin') {
    return { title: 'Check-in do treino', detail: null };
  }
  if (c.kind === 'POINTS') {
    const max = c.rules.maxPointsPerDay ?? maxPointsOf(c.rules.pointsTable ?? {});
    const partes = joinPt(
      POINT_ITEMS.filter((p) => item.parts.includes(p)).map((p) => SHORT_ITEM[p]),
    );
    return {
      title:
        item.points >= max ? `Dia completo: ${pts(item.points)}` : `${pts(item.points)} no dia`,
      detail: partes || null,
    };
  }
  if (c.kind === 'WATER') return { title: 'Bateu a meta de água', detail: null };
  if (c.kind === 'STEPS') {
    return { title: `Chegou a ${formatInteger(c.rules.stepsGoal ?? 10000)} passos`, detail: null };
  }
  if (c.kind === 'NUTRITION') {
    return {
      title:
        c.metric === 'KCAL_IN_RANGE_DAYS' ? 'Dia na faixa de calorias' : 'Bateu a proteína do dia',
      detail: null,
    };
  }
  return { title: 'Dia contado', detail: null };
}

/** O selo da linha: em revisão ou anulado. */
export function activityBadge(item: ActivityItem): { label: string; tone: 'warn' | 'bad' } | null {
  if (item.status === 'review') return { label: 'em revisão', tone: 'warn' };
  if (item.status === 'voided') return { label: 'anulado', tone: 'bad' };
  return null;
}

/** A nota do ranking (Cm-17*), por tipo. */
export function rankNote(c: Challenge): string {
  switch (c.kind) {
    case 'PHOTO':
      return 'Check-ins em revisão não contam até a equipe aprovar. Atualiza a cada poucos minutos.';
    case 'WATER':
      return `Conta dias na meta, não litros. Acima de ${liters(c.rules.dailyCap ?? 4000)} no dia o app não soma.`;
    case 'STEPS':
      return 'Só contam passos do celular ou relógio. Passos digitados à mão ficam no seu diário, mas fora do desafio.';
    case 'NUTRITION':
      return 'Cada pessoa compete contra a própria meta. Gramas, calorias e refeições nunca aparecem.';
    case 'POINTS':
      return 'Pontos em revisão ficam pendentes até a equipe decidir.';
    default:
      return 'Atualiza a cada poucos minutos.';
  }
}

/** A pontuação na linha do ranking: "12 dias", "86 pts". */
export function rankScore(c: Pick<Challenge, 'kind' | 'metric'>, score: number): string {
  if (c.kind === 'POINTS') return pts(score);
  if (c.kind === 'METRIC') return scoreLabel(c.metric, score);
  return `${formatInteger(score)} ${score === 1 ? 'dia' : 'dias'}`;
}

/** O subtítulo do cartão: "check-in com foto · 1 a 30 nov · 46 pessoas". */
export function cardSubtitle(c: Challenge, kindLabel: string): string {
  const pessoas = c.participants === 1 ? '1 pessoa' : `${c.participants} pessoas`;
  return `${kindLabel} · ${challengePeriod(c)}${c.status === 'upcoming' && c.participants === 0 ? '' : ` · ${pessoas}`}`;
}

/** O que conta, em minúsculas e curto, para o cartão. */
export function kindShort(c: Pick<Challenge, 'kind' | 'metric' | 'rules'>): string {
  switch (c.kind) {
    case 'PHOTO':
      return 'check-in com foto';
    case 'WATER':
      return `dias com ${liters(c.rules.waterGoalMl ?? 2500)} de água`;
    case 'STEPS':
      return `dias com ${formatInteger(c.rules.stepsGoal ?? 10000)} passos`;
    case 'NUTRITION':
      return c.metric === 'KCAL_IN_RANGE_DAYS' ? 'dias na faixa de calorias' : 'dias na proteína';
    case 'POINTS': {
      const t = c.rules.pointsTable ?? {};
      return `misto · ${joinPt(POINT_ITEMS.filter((i) => (t[i] ?? 0) > 0).map((i) => SHORT_ITEM[i]))}`;
    }
    default:
      return METRIC_INFO[c.metric].label.toLowerCase();
  }
}

// ---------------------------------------------------------------------------
// Pódio (Cm-11).

/**
 * Prata, ouro e bronze, nessa ordem na tela; com menos de 3, só quem tem. Sobe
 * quem tem medalha e pontos (a API só dá a medalha com o resultado fechado), e
 * o empate divide o degrau: dois em 1º ficam lado a lado no meio (#395 M7).
 */
export function podiumOrder(entries: LeaderboardEntry[]): LeaderboardEntry[] {
  const com = entries.filter((e) => e.medal !== null && e.score > 0 && e.rank <= 3);
  return [2, 1, 3].flatMap((rank) => com.filter((e) => e.rank === rank));
}

/** O troféu do 1º: âmbar escuro no claro (contraste ≥ 3:1), dourado no escuro. */
export function trophyColor(theme: 'light' | 'dark'): string {
  return theme === 'light' ? '#b45309' : '#fbbf24';
}

// ---------------------------------------------------------------------------
// Check-in (Cm-18).

export function workoutTitle(e: CheckinEligibility): string {
  if (!e.workout) return `Nenhum treino nas últimas ${e.rules.windowHours} h`;
  return `${e.workout.name} · terminou ${clock(e.workout.endedAt)}`;
}

export function workoutMeta(e: CheckinEligibility): string {
  const w = e.workout;
  if (!w) return 'Registre o treino no app para liberar o check-in';
  if (e.reason === 'already_today' && e.checkedInAt) {
    return `${w.minutes} min · você já fez check-in hoje às ${clock(e.checkedInAt)}`;
  }
  return `${w.minutes} min · ${w.sets} ${w.sets === 1 ? 'série' : 'séries'} · registrado no app`;
}

export type Tone = 'ok' | 'warn' | 'bad';

export function checkinTag(e: CheckinEligibility): { label: string; tone: Tone } {
  if (e.eligible || !e.reason) return { label: 'conta', tone: 'ok' };
  const bad =
    e.reason === 'no_workout' ||
    e.reason === 'not_participant' ||
    e.reason === 'not_running' ||
    e.reason === 'no_photo_checkin';
  return { label: CHECKIN_BLOCK_TAG[e.reason], tone: bad ? 'bad' : 'warn' };
}

/** A dica embaixo do disparador. */
export function checkinHint(e: CheckinEligibility): string {
  if (e.eligible || !e.reason) {
    return 'Só vale foto tirada agora. A galeria fica fechada neste desafio.';
  }
  return CHECKIN_BLOCK_TEXT[e.reason];
}

/** "HOJE 18:57 · PUSH 52 MIN": o carimbo que a revisão mostra sobre a foto. */
export function checkinStamp(now: Date, w: CheckinWorkout | null): string {
  const base = `HOJE ${clock(now)}`;
  return w ? `${base} · ${w.name.toUpperCase()} ${w.minutes} MIN` : base;
}

/** "Push · hoje 18:02–18:54". */
export function workoutSpan(w: CheckinWorkout): string {
  return `${w.name} · hoje ${clock(w.startedAt)}–${clock(w.endedAt)}`;
}

/** "13 de 30 dias · 5 dias seguidos", depois do check-in. */
export function doneSummary(c: Challenge): string {
  const s = participantSummary(c);
  if (!s || !c.me) return '';
  return `${s.progress} · ${streakDays(c.me.streak)}`;
}

/** "Fazer check-in · +1 dia", "Fazer check-in · +3 pts". */
export function checkinButtonLabel(c: Pick<Challenge, 'kind' | 'rules'>): string {
  return c.kind === 'POINTS'
    ? `Fazer check-in · +${pts(c.rules.pointsTable?.workout ?? 0)}`
    : 'Fazer check-in · +1 dia';
}

export interface CapturedPhoto {
  uri: string;
}

export type CheckinState =
  | { step: 'camera' }
  | { step: 'review'; photo: CapturedPhoto; error: string | null }
  | { step: 'sending'; photo: CapturedPhoto }
  | { step: 'done'; detail: ChallengeDetail };

export type CheckinAction =
  | { type: 'shot'; photo: CapturedPhoto }
  | { type: 'retake' }
  | { type: 'send' }
  | { type: 'failed'; message: string }
  | { type: 'succeeded'; detail: ChallengeDetail };

/** Câmera → revisão → envio → feito. Um erro do envio volta à revisão com a mensagem. */
export function checkinReducer(s: CheckinState, a: CheckinAction): CheckinState {
  switch (a.type) {
    case 'shot':
      return s.step === 'camera' ? { step: 'review', photo: a.photo, error: null } : s;
    case 'retake':
      return s.step === 'review' ? { step: 'camera' } : s;
    case 'send':
      return s.step === 'review' ? { step: 'sending', photo: s.photo } : s;
    case 'failed':
      return s.step === 'sending' ? { step: 'review', photo: s.photo, error: a.message } : s;
    case 'succeeded':
      return s.step === 'sending' ? { step: 'done', detail: a.detail } : s;
  }
}

// ---------------------------------------------------------------------------
// Formulário da equipe (Pn-13 no app).

export type MetricKindMetric = 'WORKOUT_SESSIONS' | 'ACTIVE_DAYS' | 'STREAK_DAYS';
export type NutritionMetric = 'PROTEIN_TARGET_DAYS' | 'KCAL_IN_RANGE_DAYS';

export interface ChallengeForm {
  title: string;
  description: string;
  kind: ChallengeKind;
  /** Para o tipo `METRIC`. */
  metric: MetricKindMetric;
  nutritionMetric: NutritionMetric;
  start: StartChoice;
  duration: DurationChoice;
  points: Record<PointItem, number>;
  maxPointsPerDay: number;
  waterGoalMl: number;
  dailyCap: number;
  stepsGoal: number;
  stepSources: StepSource[];
}

/**
 * Os tipos e itens que o formulário oferece: sem passos até a sync de saúde
 * (#395, ADR 047 §7). O app não edita desafio, então não há o caso de manter.
 */
export const FORM_KINDS: readonly ChallengeKind[] = CREATABLE_CHALLENGE_KINDS;
export const FORM_POINT_ITEMS: readonly PointItem[] = CREATABLE_POINT_ITEMS;

/** As fontes que a equipe pode marcar: todas menos a manual. */
export const SELECTABLE_STEP_SOURCES = STEP_SOURCES.filter((s) => s !== 'MANUAL');

export function defaultChallengeForm(): ChallengeForm {
  return {
    title: '',
    description: '',
    kind: 'PHOTO',
    metric: 'ACTIVE_DAYS',
    nutritionMetric: 'PROTEIN_TARGET_DAYS',
    start: 'tomorrow',
    duration: '7',
    points: { workout: 3, water: 1, steps: STEPS_SYNC_AVAILABLE ? 1 : 0, protein: 1, kcal: 0 },
    maxPointsPerDay: 6,
    waterGoalMl: 2500,
    dailyCap: 4000,
    stepsGoal: 10000,
    stepSources: [...SELECTABLE_STEP_SOURCES],
  };
}

/** Os limites dos números do formulário (os mesmos da API). */
export const FORM_LIMITS = {
  point: { min: 0, max: POINT_VALUE_MAX, step: 1 },
  maxPointsPerDay: { min: 1, max: 25, step: 1 },
  waterGoalMl: { min: 500, max: 6000, step: 250 },
  dailyCap: { min: 1000, max: 8000, step: 250 },
  stepsGoal: { min: 1000, max: 50000, step: 1000 },
} as const;

/** Um toque no − ou no +, sem sair do limite. */
export function clampStep(value: number, delta: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value + delta));
}

/** O que vai para a API: só os campos do tipo escolhido. */
export function challengeInputFromForm(f: ChallengeForm, today: string): ChallengeInput {
  const base: ChallengeInput = {
    title: f.title.trim(),
    description: f.description.trim() || null,
    kind: f.kind,
    ...challengeWindow(today, f.start, f.duration),
  };
  switch (f.kind) {
    case 'METRIC':
      return { ...base, metric: f.metric };
    case 'NUTRITION':
      return { ...base, metric: f.nutritionMetric };
    case 'WATER':
      return { ...base, waterGoalMl: f.waterGoalMl, dailyCap: f.dailyCap };
    case 'STEPS':
      return {
        ...base,
        stepsGoal: f.stepsGoal,
        allowedStepSources: f.stepSources.filter((s) => s !== 'MANUAL'),
      };
    case 'POINTS': {
      const table: PointsTable = {};
      for (const i of POINT_ITEMS) if (f.points[i] > 0) table[i] = f.points[i];
      const soma = maxPointsOf(table);
      return {
        ...base,
        pointsTable: table,
        maxPointsPerDay: Math.max(1, Math.min(f.maxPointsPerDay, soma)),
      };
    }
    default:
      return base;
  }
}

/** O que impede mandar o motivo à pessoa, ou `null`. */
export function reviewReasonProblem(reason: string): string | null {
  const r = reason.trim();
  if (r.length < REVIEW_REASON_MIN) return 'Escreva o motivo: a pessoa recebe esse texto.';
  if (r.length > REVIEW_REASON_MAX) return `O motivo tem até ${REVIEW_REASON_MAX} caracteres.`;
  return null;
}
