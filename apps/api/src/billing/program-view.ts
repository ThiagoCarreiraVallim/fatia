import type { ProgramKind, SubscriptionStatus } from '@prisma/client';
import type { PrismaService } from '../common/prisma.service';
import { addDaysIso, dateInTz } from '../progress/helpers/date-tz';
import { FUSO_DO_PROVEDOR } from './seat-pricing';

/**
 * Como um programa (#403) aparece no painel: na tela de assentos (Pn-07) e na
 * lista de programas. Separado do service para a visão dos assentos ler sem
 * depender dele.
 */
export interface ProgramView {
  id: string;
  name: string;
  note: string | null;
  kind: ProgramKind;
  challengeId: string | null;
  challengeTitle: string | null;
  seats: number;
  /** Quem tem o assento do programa agora (não revogado). */
  assigned: number;
  /** Primeiro e último dia, `YYYY-MM-DD` no fuso do provedor (inclusivos). */
  startDate: string;
  endDate: string;
  amountCents: number;
  /**
   * `PENDING` aguardando, `ACTIVE` paga ou sem cobrança, `PAST_DUE` vencida,
   * `CANCELED` estornada, contestada ou apagada (o PRO acabou).
   */
  chargeStatus: SubscriptionStatus;
  status: ProgramStatus;
}

export type ProgramStatus = 'SCHEDULED' | 'ACTIVE' | 'ENDED' | 'CANCELED';

/**
 * O status sai das datas, como o direito: nada grava "terminou". Cobrança
 * estornada, contestada ou apagada encerra o programa, como no direito.
 */
export function programStatus(
  p: { startsAt: Date; endsAt: Date; chargeStatus: SubscriptionStatus },
  now: Date,
): ProgramStatus {
  if (p.chargeStatus === 'CANCELED' || p.chargeStatus === 'EXPIRED') return 'CANCELED';
  if (now < p.startsAt) return 'SCHEDULED';
  if (now >= p.endsAt) return 'ENDED';
  return 'ACTIVE';
}

/** Terminados aparecem por mais este tempo na tela de assentos. */
const ENDED_VISIBLE_DAYS = 31;

const PROGRAM_SELECT = {
  id: true,
  name: true,
  note: true,
  kind: true,
  challengeId: true,
  challenge: { select: { title: true } },
  seats: true,
  startsAt: true,
  endsAt: true,
  amountCents: true,
  chargeStatus: true,
  _count: { select: { assignments: { where: { revokedAt: null } } } },
} as const;

/**
 * Os programas da comunidade: os que valem ou vão valer, e os terminados há
 * pouco. Sempre filtrado por `groupId` (isolamento na aplicação, ADR 010).
 */
export async function listPrograms(
  prisma: Pick<PrismaService, 'groupProgram'>,
  groupId: string,
  now: Date = new Date(),
  where: { id?: string } = {},
): Promise<ProgramView[]> {
  const rows = await prisma.groupProgram.findMany({
    where: {
      groupId,
      canceledAt: null,
      ...where,
      ...(where.id
        ? {}
        : { endsAt: { gt: new Date(now.getTime() - ENDED_VISIBLE_DAYS * 86_400_000) } }),
    },
    orderBy: [{ startsAt: 'asc' }, { createdAt: 'asc' }],
    select: PROGRAM_SELECT,
  });
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    note: r.note,
    kind: r.kind,
    challengeId: r.challengeId,
    challengeTitle: r.challenge?.title ?? null,
    seats: r.seats,
    assigned: r._count.assignments,
    startDate: dateInTz(r.startsAt, FUSO_DO_PROVEDOR),
    // `endsAt` é a virada do último dia: o último dia é a véspera.
    endDate: addDaysIso(dateInTz(r.endsAt, FUSO_DO_PROVEDOR), -1),
    amountCents: r.amountCents,
    chargeStatus: r.chargeStatus,
    status: programStatus(r, now),
  }));
}
