import type { RestedMuscle, StrengthMuscleGroup, WeeklyMuscleSummary } from './workout';

/**
 * Os textos dos cards da aba Treino (prancha `Al-T-Cards-treino`), iguais na
 * web e no app. Nenhum card depende de "próximo treino".
 */

const GROUP_LABEL: Record<StrengthMuscleGroup, string> = {
  peito: 'Peito',
  costas: 'Costas',
  pernas: 'Pernas',
  ombro: 'Ombros',
  braço: 'Braços',
  core: 'Core',
};

export function muscleGroupLabel(group: StrengthMuscleGroup): string {
  return GROUP_LABEL[group];
}

/** Os músculos do diagrama (chaves `data-muscle`) de cada grupo, para pintar o corpo. */
const MUSCLES_OF_GROUP: Record<StrengthMuscleGroup, string[]> = {
  peito: ['chest'],
  costas: ['lats', 'middle back', 'lower back', 'traps'],
  pernas: ['quadriceps', 'hamstrings', 'glutes', 'calves', 'adductors', 'abductors'],
  ombro: ['shoulders', 'neck'],
  braço: ['biceps', 'triceps', 'forearms'],
  core: ['abdominals'],
};

export function musclesOfGroups(groups: readonly StrengthMuscleGroup[]): string[] {
  return groups.flatMap((g) => MUSCLES_OF_GROUP[g]);
}

/**
 * O tom de cada grupo na silhueta do card: descansado (3+ dias ou sem treino
 * recente), recuperando (2 dias) e recente (ontem ou hoje — o grupo nem está
 * na lista de descansados da API).
 */
export type MuscleTone = 'rested' | 'recovering' | 'recent';

export function bodyTones(
  rested: readonly RestedMuscle[],
): Record<StrengthMuscleGroup, MuscleTone> {
  const tones = Object.fromEntries(
    (Object.keys(GROUP_LABEL) as StrengthMuscleGroup[]).map((g) => [g, 'recent']),
  ) as Record<StrengthMuscleGroup, MuscleTone>;
  for (const r of rested) {
    tones[r.group] = r.daysSince === null || r.daysSince >= 3 ? 'rested' : 'recovering';
  }
  return tones;
}

/** A legenda de pontos ao lado da silhueta (prancha `Al-T-Cards-treino`). */
export const MUSCLE_TONE_LEGEND: readonly { tone: MuscleTone; label: string }[] = [
  { tone: 'rested', label: 'descansado' },
  { tone: 'recovering', label: 'há 2 dias' },
  { tone: 'recent', label: 'ontem ou hoje' },
];

/** "há 3 dias", "ontem", "sem treino recente". */
export function daysAgoLabel(days: number | null): string {
  if (days === null) return 'sem treino recente';
  if (days === 0) return 'hoje';
  if (days === 1) return 'ontem';
  return `há ${days} dias`;
}

function joinPt(parts: string[]): string {
  if (parts.length <= 1) return parts[0] ?? '';
  return `${parts.slice(0, -1).join(', ')} e ${parts.at(-1)}`;
}

/**
 * O título do card "Seus músculos hoje": até dois grupos, os mais descansados
 * que já foram treinados (nunca treinado não é "descansado", é "parado").
 */
export function restedHeadline(rested: readonly RestedMuscle[]): string {
  const trained = rested.filter((r) => r.daysSince !== null).slice(0, 2);
  if (trained.length === 0) {
    return rested.length > 0 ? 'Tudo descansado' : 'Nada descansado ainda';
  }
  const names = trained.map((r, i) =>
    i === 0 ? GROUP_LABEL[r.group] : GROUP_LABEL[r.group].toLowerCase(),
  );
  return `${joinPt(names)} ${trained.length > 1 ? 'descansados' : 'descansado'}`;
}

/** As barras do card "Séries por músculo · semana": a fração da meta, com teto em 1. */
export function weeklySetsBars(summary: WeeklyMuscleSummary): {
  group: StrengthMuscleGroup;
  label: string;
  sets: number;
  ratio: number;
}[] {
  return summary.sets.map((s) => ({
    group: s.group,
    label: GROUP_LABEL[s.group],
    sets: s.sets,
    ratio: summary.target > 0 ? Math.min(1, s.sets / summary.target) : 0,
  }));
}

/** "Último treino · ontem" a partir da data da sessão. */
export function lastWorkoutWhen(startedAt: string, now: Date = new Date()): string {
  const start = new Date(startedAt);
  const day = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diff = Math.round((day(now) - day(start)) / 86_400_000);
  return daysAgoLabel(diff);
}

export type FigureTone = 'surface-3' | 'border-strong' | 'card' | 'transparent';

/**
 * O boneco dos músculos (web e app) vem com cinzas fixos de tema claro: fundo
 * `#F5F5F5`, músculo `#BDBDBD` (nas costas `#AEAEB2`), pele `#E0E0E0` e contorno preto. No escuro isso
 * vira uma caixa branca no card. Cada cinza passa a ser um token do tema — o
 * músculo apagado no cinza do card, a pele um tom acima, o contorno na cor do
 * próprio card (vira o vão entre os músculos) e o fundo some. `null`: não mexe.
 */
export function figureTone(original: string | null | undefined): FigureTone | null {
  switch (original?.toLowerCase()) {
    case '#bdbdbd':
    case '#aeaeb2':
      return 'surface-3';
    case '#e0e0e0':
      return 'border-strong';
    case 'black':
    case '#000':
    case '#000000':
      return 'card';
    case '#f5f5f5':
      return 'transparent';
    default:
      return null;
  }
}
