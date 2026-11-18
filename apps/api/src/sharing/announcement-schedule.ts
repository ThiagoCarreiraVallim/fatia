import { AnnouncementRepeat } from '@fatia/db';
import type { PrismaService } from '../common/prisma.service';

/**
 * A agenda dos comunicados que repetem (#394). Toda ocorrência é contada a
 * partir da âncora (o primeiro horário marcado), no fuso da comunidade: "todo
 * mês no dia 31" cai no último dia dos meses curtos e volta ao 31 depois, e
 * "toda terça às 9h" continua às 9h quando o fuso muda de horário.
 */

interface Local {
  y: number;
  m: number; // 0 a 11
  d: number;
  h: number;
  min: number;
}

function partsIn(date: Date, timezone: string): Local {
  const p = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hourCycle: 'h23',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
  })
    .formatToParts(date)
    .reduce<Record<string, number>>((acc, x) => {
      if (x.type !== 'literal') acc[x.type] = Number(x.value);
      return acc;
    }, {});
  return { y: p.year!, m: p.month! - 1, d: p.day!, h: p.hour!, min: p.minute! };
}

/** Quanto o fuso está à frente do UTC (em ms) naquele instante. */
function offsetAt(date: Date, timezone: string): number {
  const l = partsIn(date, timezone);
  const comoUtc = Date.UTC(l.y, l.m, l.d, l.h, l.min);
  return comoUtc - Math.floor(date.getTime() / 60_000) * 60_000;
}

/** O instante de uma hora local no fuso. Na hora que não existe, cai na seguinte. */
function fromLocal(l: Local, timezone: string): Date {
  const ingenuo = Date.UTC(l.y, l.m, l.d, l.h, l.min);
  let t = ingenuo - offsetAt(new Date(ingenuo), timezone);
  t = ingenuo - offsetAt(new Date(t), timezone);
  return new Date(t);
}

/** A k-ésima ocorrência depois da âncora (k = 0 é a própria âncora). */
function occurrence(anchor: Local, k: number, repeat: AnnouncementRepeat, tz: string): Date {
  if (repeat === AnnouncementRepeat.MONTHLY) {
    const meses = anchor.m + k;
    const y = anchor.y + Math.floor(meses / 12);
    const m = ((meses % 12) + 12) % 12;
    const ultimo = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
    return fromLocal({ ...anchor, y, m, d: Math.min(anchor.d, ultimo) }, tz);
  }
  const passo = repeat === AnnouncementRepeat.WEEKLY ? 7 : 1;
  // O dia do calendário anda em UTC puro; a hora local é aplicada no fuso.
  const dia = new Date(Date.UTC(anchor.y, anchor.m, anchor.d + k * passo));
  return fromLocal(
    { ...anchor, y: dia.getUTCFullYear(), m: dia.getUTCMonth(), d: dia.getUTCDate() },
    tz,
  );
}

/** O primeiro índice cuja ocorrência passa de `after`. */
function firstIndexAfter(
  anchorAt: Date,
  anchor: Local,
  after: Date,
  repeat: AnnouncementRepeat,
  tz: string,
): number {
  const diaMs = 86_400_000;
  const periodo =
    repeat === AnnouncementRepeat.MONTHLY
      ? 28 * diaMs
      : repeat === AnnouncementRepeat.WEEKLY
        ? 7 * diaMs
        : diaMs;
  // Estimativa por baixo e anda para a frente: poucas voltas mesmo anos depois.
  let k = Math.max(0, Math.floor((after.getTime() - anchorAt.getTime()) / periodo) - 2);
  if (repeat === AnnouncementRepeat.MONTHLY) {
    const a = partsIn(after, tz);
    k = Math.max(0, (a.y - anchor.y) * 12 + (a.m - anchor.m) - 1);
  }
  while (occurrence(anchor, k, repeat, tz).getTime() <= after.getTime()) k += 1;
  return k;
}

/** O próximo disparo depois de `after`, contado da âncora; nulo sem repetição. */
export function nextOccurrence(
  anchorAt: Date,
  after: Date,
  repeat: AnnouncementRepeat,
  timezone: string,
): Date | null {
  if (repeat === AnnouncementRepeat.NONE) return null;
  const anchor = partsIn(anchorAt, timezone);
  return occurrence(
    anchor,
    firstIndexAfter(anchorAt, anchor, after, repeat, timezone),
    repeat,
    timezone,
  );
}

/**
 * O disparo devido em `now`: o último horário que já passou (ao voltar de uma
 * queda, os atrasados viram um só) e o próximo depois de `now`.
 */
export function dueOccurrence(
  anchorAt: Date,
  planned: Date,
  now: Date,
  repeat: AnnouncementRepeat,
  timezone: string,
): { at: Date; next: Date | null } {
  if (repeat === AnnouncementRepeat.NONE) return { at: planned, next: null };
  const anchor = partsIn(anchorAt, timezone);
  const k = firstIndexAfter(anchorAt, anchor, now, repeat, timezone);
  const ultimo = k > 0 ? occurrence(anchor, k - 1, repeat, timezone) : planned;
  return {
    at: ultimo.getTime() > planned.getTime() ? ultimo : planned,
    next: occurrence(anchor, k, repeat, timezone),
  };
}

/**
 * Cancela os agendados de uma associação: quem saiu, foi banido ou perdeu o
 * papel de comunicar não publica mais em nome da equipe. O que já saiu fica.
 */
export function cancelScheduledAnnouncementsOp(
  prisma: PrismaService,
  membershipId: string,
  at: Date,
) {
  return prisma.groupAnnouncement.updateMany({
    where: { membershipId, canceledAt: null, nextRunAt: { not: null } },
    data: { canceledAt: at, nextRunAt: null },
  });
}
