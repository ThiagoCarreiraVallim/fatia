import {
  dayOfMonth,
  shiftDay,
  WEEKDAY_LETTERS,
  type MuscleTone,
  type SetsLevel,
  type TrainingWeek,
  type WorkoutCheckinInput,
} from '@fatia/api-client';

/**
 * Contas da aba Treino do redesign (#377) que não dependem de tela: as cores do
 * "Seus músculos hoje", a faixa da semana e o corpo das respostas da equipe.
 */

/**
 * Descansado na cor da marca, recuperando em passos; recente fica de fora e o
 * `MuscleDiagram` o apaga — o mesmo tom que a silhueta antiga usava.
 * Recebe a paleta (e não importa `colors`) porque os tokens são getters do tema.
 */
export function restToneColors(
  tones: Record<string, MuscleTone>,
  palette: { primary: string; steps: string },
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [muscle, tone] of Object.entries(tones)) {
    if (tone === 'rested') out[muscle] = palette.primary;
    else if (tone === 'recovering') out[muscle] = palette.steps;
  }
  return out;
}

/** A opacidade (alfa hex) de cada nível de séries: 35%, 65% e cheio. */
const SETS_LEVEL_ALPHA = { 1: '59', 2: 'A6', 3: '' } as const;

/**
 * O "Séries por músculo" (#476) pinta o corpo com a cor da marca, mais forte
 * quanto mais perto da meta da semana. Recebe a cor (e não importa `colors`)
 * porque os tokens são getters do tema.
 */
export function setsLevelColors(
  levels: Record<string, SetsLevel>,
  primary: string,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [muscle, level] of Object.entries(levels)) {
    out[muscle] = `${primary}${SETS_LEVEL_ALPHA[level]}`;
  }
  return out;
}

/**
 * A semana arrastada enquanto a resposta não chega (#479): os sete dias, sem
 * treino marcado. Os dias vêm de `weekPages`, então a faixa já tem as datas.
 */
export function emptyTrainingWeek(monday: string, today: string): TrainingWeek {
  return {
    start: monday,
    days: Array.from({ length: 7 }, (_, i) => {
      const date = shiftDay(monday, i);
      return { date, trained: false, active: false, today: date === today };
    }),
    done: 0,
    target: null,
  };
}

const WEEKDAY_NAMES = ['segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado', 'domingo'];

export interface WeekChip {
  date: string;
  letter: string;
  day: number;
  state: 'trained' | 'active' | 'rest';
  today: boolean;
  label: string;
}

/** Os sete chips da "Semana", segunda a domingo. */
export function weekChips(week: TrainingWeek): WeekChip[] {
  return week.days.slice(0, 7).map((d, i) => {
    const state: WeekChip['state'] = d.active ? 'active' : d.trained ? 'trained' : 'rest';
    const day = dayOfMonth(d.date);
    const parts = [`${WEEKDAY_NAMES[i]}, dia ${day}`];
    if (d.today) parts.push('hoje');
    if (state === 'active') parts.push('treino em andamento');
    else if (state === 'trained') parts.push('treinou');
    return {
      date: d.date,
      letter: WEEKDAY_LETTERS[i] ?? '',
      day,
      state,
      today: d.today,
      label: parts.join(', '),
    };
  });
}

/** O corpo do "Enviar": só o que foi respondido; o local da dor só com dor. */
export function checkinBody(form: {
  fatigue: number | null;
  pain: boolean | null;
  painLocation: string;
}): WorkoutCheckinInput {
  const body: WorkoutCheckinInput = {};
  if (form.fatigue != null) body.fatigue = form.fatigue;
  if (form.pain != null) body.pain = form.pain;
  const where = form.painLocation.trim();
  if (form.pain && where) body.painLocation = where;
  return body;
}

const GROUP_COLORS = {
  peito: 'protein',
  costas: 'water',
  pernas: 'primary',
  ombro: 'steps',
  braço: 'carbs',
  core: 'fat',
  cardio: 'danger',
} as const;

export type GroupColorName = (typeof GROUP_COLORS)[keyof typeof GROUP_COLORS] | 'mutedForeground';

/**
 * O token de cada grupo muscular, as cores do canvas (prancha `Al-T3-Sessao`):
 * a barra do cartão de plano e o chip do grupo no Como fazer. É um nome, e não
 * a cor, porque `colors` é getter do tema e precisa ser lido no componente.
 */
export function groupColorName(group: string): GroupColorName {
  return GROUP_COLORS[group as keyof typeof GROUP_COLORS] ?? 'mutedForeground';
}
