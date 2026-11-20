import type { PlanOfferStatus, PlanSchedule } from '@fatia/db';
import { planEndDate } from '../workout/helpers/planned-schedule';
import type { MemberPlanStatus } from './member-file.types';

/** O que se lê de uma versão de oferta para saber o estado do plano. */
export interface OfferVersionState {
  id: string;
  version: number;
  status: PlanOfferStatus;
  title: string;
  schedule: PlanSchedule;
  startDate: string | null;
  weeks: number | null;
}

export interface OfferState<V extends OfferVersionState> {
  status: MemberPlanStatus;
  /** A versão que vale: a aceita, ou a última mandada. */
  shown: V;
  accepted: V | null;
  latest: V;
  /** Último dia do plano de calendário (inclusivo). */
  endDate: string | null;
  /** Semana corrente do plano de calendário em andamento. */
  weekNumber: number | null;
}

const daysBetween = (from: string, to: string) =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);

/**
 * O estado de um plano que a equipe mandou, lido das datas (#402, #403): a
 * ficha da pessoa e os Programas (Pn-30) leem igual. Nada grava "terminou".
 */
export function offerState<V extends OfferVersionState>(
  versions: V[],
  endedAt: Date | null,
  today: string,
): OfferState<V> | null {
  const latest = versions.at(-1);
  if (!latest) return null;
  const accepted = versions.filter((v) => v.status === 'ACCEPTED').at(-1) ?? null;
  const shown = accepted ?? latest;
  const endDate =
    shown.schedule === 'CALENDAR' && shown.startDate && shown.weeks
      ? planEndDate(shown.startDate, shown.weeks)
      : null;

  let status: MemberPlanStatus;
  if (endedAt) status = 'ENDED';
  else if (accepted) {
    if (endDate && endDate < today) status = 'ENDED';
    else if (shown.startDate && shown.schedule === 'CALENDAR' && shown.startDate > today) {
      status = 'SCHEDULED';
    } else status = 'ACTIVE';
  } else if (latest.status === 'PENDING') status = 'PENDING';
  else if (latest.status === 'DECLINED') status = 'DECLINED';
  // Substituída sem nunca ter sido aceita (a pessoa saiu e voltou, por exemplo).
  else status = 'ENDED';

  const running =
    status === 'ACTIVE' && shown.schedule === 'CALENDAR' && shown.startDate && shown.weeks;
  return {
    status,
    shown,
    accepted,
    latest,
    endDate,
    weekNumber: running
      ? Math.min(Math.floor(daysBetween(shown.startDate!, today) / 7) + 1, shown.weeks!)
      : null,
  };
}
