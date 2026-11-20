import { apiFetch } from './http';

/**
 * Programas (#403, Pn-30): os planos com começo e fim que a equipe mandou,
 * por aluno. O progresso só existe quando a pessoa libera Treino para quem
 * olha; sem isso a linha diz só "enviado". Tudo aqui é apresentação.
 */

/** `SENT` = enviado, sem Treino liberado para quem olha. */
export type PlanProgramStatus = 'SENT' | 'SCHEDULED' | 'ACTIVE' | 'ENDING' | 'ENDED';

export interface PlanProgramItem {
  offerId: string;
  membershipId: string;
  name: string;
  title: string;
  authorName: string | null;
  schedule: 'CALENDAR' | 'FLEXIBLE';
  startDate: string | null;
  endDate: string | null;
  status: PlanProgramStatus;
  startsInDays: number | null;
  sharesWorkout: boolean;
  progress: {
    done: number;
    planned: number | null;
    percent: number | null;
    weekNumber: number | null;
    weeks: number | null;
  } | null;
  phases: { week: number; focus: string; startDate: string; endDate: string; current: boolean }[];
  tags: string[];
}

export interface PlanProgramsView {
  counts: { all: number; active: number; ending: number; scheduled: number; ended: number };
  items: PlanProgramItem[];
}

export const planProgramsApi = {
  list: (groupId: string) => apiFetch<PlanProgramsView>(`/api/groups/${groupId}/plan-programs`),
};

export type PlanProgramTab = 'all' | 'active' | 'ending' | 'scheduled' | 'ended';

const TAB_STATUS: Record<Exclude<PlanProgramTab, 'all'>, PlanProgramStatus> = {
  active: 'ACTIVE',
  ending: 'ENDING',
  scheduled: 'SCHEDULED',
  ended: 'ENDED',
};

/** As abas com contagem, na ordem da prancha. */
export function planProgramTabs(
  counts: PlanProgramsView['counts'],
): { key: PlanProgramTab; label: string; count: number }[] {
  return [
    { key: 'all', label: 'Todos', count: counts.all },
    { key: 'active', label: 'Em andamento', count: counts.active },
    { key: 'ending', label: 'Terminando', count: counts.ending },
    { key: 'scheduled', label: 'Agendados', count: counts.scheduled },
    { key: 'ended', label: 'Terminaram', count: counts.ended },
  ];
}

const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** A aba e a busca por aluno ou plano, sem acento. */
export function filterPlanPrograms(
  items: readonly PlanProgramItem[],
  tab: PlanProgramTab,
  query: string,
): PlanProgramItem[] {
  const q = semAcento(query.trim());
  return items.filter((i) => {
    if (tab !== 'all' && i.status !== TAB_STATUS[tab]) return false;
    if (!q) return true;
    return semAcento(i.name).includes(q) || semAcento(i.title).includes(q);
  });
}

const STATUS: Record<PlanProgramStatus, string> = {
  SENT: 'enviado',
  SCHEDULED: 'agendado',
  ACTIVE: 'em andamento',
  ENDING: 'terminando',
  ENDED: 'terminou',
};

export function planProgramStatusLabel(status: PlanProgramStatus): string {
  return STATUS[status];
}

export function planProgramKindLabel(schedule: PlanProgramItem['schedule']): string {
  return schedule === 'CALENDAR' ? 'Calendário' : 'Flexível';
}

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const dia = (ymd: string) => {
  const [, m, d] = ymd.split('-').map(Number);
  return `${d} ${MESES[m! - 1]}`;
};

/** "27 out – 23 nov", ou "sem datas" no flexível. */
export function planProgramDates(i: Pick<PlanProgramItem, 'startDate' | 'endDate'>): string {
  if (!i.startDate) return 'sem datas';
  return i.endDate ? `${dia(i.startDate)} – ${dia(i.endDate)}` : `desde ${dia(i.startDate)}`;
}

/** Dias de uma fase: "27 out – 2 nov". */
export function phaseDates(p: { startDate: string; endDate: string }): string {
  return `${dia(p.startDate)} – ${dia(p.endDate)}`;
}

const primeiroNome = (n: string) => n.trim().split(/\s+/)[0] ?? n;

/** A linha debaixo da barra de progresso (ou no lugar dela). */
export function planProgramProgressLine(i: PlanProgramItem): string {
  if (!i.sharesWorkout) return `${primeiroNome(i.name)} não compartilha Treino`;
  if (i.status === 'SCHEDULED' && i.startsInDays !== null) {
    return i.startsInDays <= 1 ? 'começa amanhã' : `começa em ${i.startsInDays} dias`;
  }
  const p = i.progress;
  if (!p) return i.status === 'SENT' ? 'aguardando o aceite' : '';
  if (p.planned !== null && p.weekNumber !== null && p.weeks !== null) {
    return `semana ${p.weekNumber} de ${p.weeks} · ${p.done} de ${p.planned}`;
  }
  if (p.planned !== null) return `${p.done} de ${p.planned}`;
  return p.done === 1 ? '1 treino feito' : `${p.done} treinos feitos`;
}
