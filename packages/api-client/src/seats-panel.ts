import type { SeatInvoice, SeatProgram, SeatsOverview } from './community-admin';
import { seatChangeHint, shortPanelDate } from './community-panel';
import { formatBRL } from './plan';

/**
 * Assentos e faturas (#403, Pn-07 e Pn-07v): os cartões, a faixa da fatura
 * vencida, as linhas de faturas e programas e o painel "Ajustar assentos".
 * Tudo aqui é apresentação; valores e prazos vêm da API (preço do pool,
 * `graceEndsAt`), nunca fixos.
 */

export type ChipTone = 'ok' | 'warn' | 'info' | 'neutral' | 'muted';

export interface Chip {
  label: string;
  tone: ChipTone;
}

export interface StatCard {
  value: string;
  sub: string;
}

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const MESES_LONGOS = [
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
/** Mesmo teto da API (`ASSENTOS_MAX`). */
export const SEATS_MAX = 1000;
/** Mês de programa: 31 dias, como a API (`DIAS_DO_MES_DE_PROGRAMA`). */
const DIAS_DO_MES_DE_PROGRAMA = 31;
const DIA_MS = 86_400_000;
/** O provedor (Asaas) conta dias em Brasília. */
const FUSO_MS = 3 * 3_600_000;

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;
const partes = (ymd: string) => ymd.split('-').map(Number) as [number, number, number];

/** "10 dez", de um `YYYY-MM-DD`. */
export function seatDayLabel(ymd: string): string {
  const [, m, d] = partes(ymd);
  return `${d} ${MESES[m - 1]}`;
}

/** "1 a 30 nov" no mesmo mês; "27 out a 23 nov" entre meses. */
export function dayRangeLabel(start: string, end: string): string {
  const [ya, ma, da] = partes(start);
  const [yb, mb] = partes(end);
  if (ya === yb && ma === mb) return `${da} a ${seatDayLabel(end)}`;
  return `${seatDayLabel(start)} a ${seatDayLabel(end)}`;
}

function diasEntre(a: string, b: string): number {
  const [ya, ma, da] = partes(a);
  const [yb, mb, db] = partes(b);
  return Math.round((Date.UTC(yb, mb - 1, db) - Date.UTC(ya, ma - 1, da)) / DIA_MS);
}

function mesAnterior(ymd: string): string {
  const [a, m, d] = partes(ymd);
  const ano = m === 1 ? a - 1 : a;
  const mes = m === 1 ? 12 : m - 1;
  const ultimo = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
  return `${ano}-${String(mes).padStart(2, '0')}-${String(Math.min(d, ultimo)).padStart(2, '0')}`;
}

/** A data em Brasília, `YYYY-MM-DD`. */
const diaLocal = (d: Date) => new Date(d.getTime() - FUSO_MS).toISOString().slice(0, 10);

const mesDe = (ymd: string) => MESES_LONGOS[partes(ymd)[1] - 1]!;
const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function carencia(dias: number): string {
  return dias === 1 ? 'falta 1 dia' : `faltam ${dias} dias`;
}

/** Os quatro cartões do topo: em uso, preço, próxima fatura e pagamento. */
export function seatStatCards(o: SeatsOverview): {
  inUse: StatCard;
  price: StatCard;
  next: StatCard;
  payment: StatCard & { tone: ChipTone };
} {
  const pool = o.pool;
  const vivo = pool && pool.status !== 'CANCELED' && pool.status !== 'EXPIRED' ? pool : null;
  const livres = vivo ? Math.max(0, vivo.seats - o.assigned) : 0;
  const inUse: StatCard = vivo
    ? {
        value: `${o.assigned}/${vivo.seats}`,
        sub: livres === 0 ? 'nenhum livre' : plural(livres, 'livre', 'livres'),
      }
    : { value: '0', sub: 'sem assentos' };
  const price: StatCard = { value: formatBRL(o.unitPriceCents), sub: 'por mês' };
  const n = o.nextInvoice;
  const next: StatCard = n
    ? {
        value: formatBRL(n.amountCents),
        sub: `${n.seats} × ${formatBRL(n.unitPriceCents)} · vence ${shortPanelDate(n.dueAt)}`,
      }
    : { value: '—', sub: vivo?.cancelAtPeriodEnd ? 'cancelados no fim do período' : 'sem fatura' };

  let payment: StatCard & { tone: ChipTone };
  if (!vivo) payment = { value: 'Sem assentos', sub: 'compre para dar PRO', tone: 'muted' };
  else if (vivo.status === 'PAST_DUE') {
    const dias = vivo.graceDaysLeft ?? 0;
    payment = {
      value: 'Vencida',
      sub: dias > 0 ? `${carencia(dias)} da carência` : 'IA dos membros pausada',
      tone: 'warn',
    };
  } else if (vivo.status === 'PENDING') {
    payment = { value: 'Aguardando', sub: 'o primeiro pagamento', tone: 'info' };
  } else {
    payment = { value: 'Em dia', sub: vivo.manual ? 'cortesia' : 'pelo Asaas', tone: 'ok' };
  }
  return { inUse, price, next, payment };
}

/**
 * A faixa da fatura vencida (Pn-07v). Os dias vêm do `graceEndsAt`; depois da
 * carência, só a IA pausa — nada do que os membros registraram some.
 */
export function overdueSeatBanner(
  o: SeatsOverview,
): { title: string; text: string; payUrl: string | null } | null {
  const pool = o.pool;
  if (!pool || pool.status !== 'PAST_DUE') return null;
  const f = o.overdueInvoice;
  const qual = f?.dueDate ? `Fatura de ${mesDe(f.dueDate)} vencida` : 'Fatura vencida';
  const payUrl = f?.invoiceUrl ?? pool.paymentUrl ?? null;
  const dias = pool.graceDaysLeft ?? 0;
  if (dias > 0) {
    return {
      title: `${qual} · ${carencia(dias)}`,
      text: 'Depois disso o PRO dos membros pausa. O registro deles continua; só a IA para.',
      payUrl,
    };
  }
  return {
    title: `${qual} · a IA dos membros está pausada`,
    text: 'O registro deles continua. Pague para a IA voltar.',
    payUrl,
  };
}

/** Uma linha da tabela de faturas. */
export function seatInvoiceRow(f: SeatInvoice): {
  title: string;
  sub: string | null;
  amount: string;
  amountSub: string | null;
  due: string;
  status: Chip;
  muted: boolean;
} {
  const quando = f.dueDate ?? f.createdAt.slice(0, 10);
  const title =
    f.kind === 'ADJUSTMENT'
      ? f.seats
        ? `Ajuste +${f.seats} ${f.seats === 1 ? 'assento' : 'assentos'}`
        : 'Ajuste de assentos'
      : f.kind === 'PROGRAM'
        ? 'Programa'
        : capital(mesDe(quando));
  const sub = f.kind !== 'ADJUSTMENT' && f.seats ? plural(f.seats, 'assento', 'assentos') : null;
  const amountSub =
    f.kind === 'ADJUSTMENT' && f.proRataDays
      ? `proporcional a ${plural(f.proRataDays, 'dia', 'dias')}`
      : null;
  const status: Chip =
    f.status === 'PAID'
      ? { label: 'paga', tone: 'ok' }
      : f.status === 'OVERDUE'
        ? { label: 'vencida', tone: 'warn' }
        : f.status === 'VOID'
          ? { label: 'anulada', tone: 'muted' }
          : f.kind === 'SUBSCRIPTION'
            ? { label: 'aberta', tone: 'neutral' }
            : { label: 'pendente', tone: 'info' };
  return {
    title,
    sub,
    amount: formatBRL(f.amountCents),
    amountSub,
    due: f.dueDate ? seatDayLabel(f.dueDate) : '—',
    status,
    muted: f.status === 'VOID',
  };
}

/** Uma linha do bloco Programas (Pn-07). */
export function seatProgramRow(p: SeatProgram): {
  name: string;
  sub: string | null;
  seats: string;
  period: string;
  amount: string;
  status: Chip;
} {
  let status: Chip;
  if (p.status === 'ENDED') status = { label: 'terminou', tone: 'muted' };
  else if (p.chargeStatus === 'PENDING') status = { label: 'aguardando pagamento', tone: 'info' };
  else if (p.chargeStatus === 'PAST_DUE') status = { label: 'pagamento vencido', tone: 'warn' };
  else if (p.chargeStatus === 'CANCELED' || p.chargeStatus === 'EXPIRED') {
    status = { label: 'cancelado', tone: 'muted' };
  } else if (p.status === 'SCHEDULED') status = { label: 'agendado', tone: 'info' };
  else status = { label: 'em andamento', tone: 'ok' };
  return {
    name: p.name,
    sub:
      p.note ??
      (p.kind === 'CHALLENGE' && p.challengeTitle ? `quem entrar no ${p.challengeTitle}` : null),
    seats: p.kind === 'CHALLENGE' ? `até ${p.seats}` : String(p.seats),
    period: dayRangeLabel(p.startDate, p.endDate),
    amount: formatBRL(p.amountCents),
    status,
  };
}

/**
 * O painel "Ajustar assentos": o mínimo é o que está em uso; o valor mensal
 * novo e, no aumento, o proporcional que sai agora (a mesma conta da API,
 * `proRataAumento`). O valor final é o da fatura do Asaas.
 */
export function seatAdjustPreview(
  o: SeatsOverview,
  seats: number,
  now: Date = new Date(),
): {
  min: number;
  max: number;
  ok: boolean;
  monthly: string;
  proRata: string | null;
  hint: string | null;
} {
  const pool = o.pool;
  const min = Math.max(1, o.assigned);
  const ok = Number.isInteger(seats) && seats >= min && seats <= SEATS_MAX;
  let proRata: string | null = null;
  if (pool && pool.currentPeriodEnd && seats > pool.seats) {
    const fim = diaLocal(new Date(pool.currentPeriodEnd));
    const noPeriodo = diasEntre(mesAnterior(fim), fim);
    const restantes = Math.min(noPeriodo, Math.max(0, diasEntre(diaLocal(now), fim)));
    const cents =
      noPeriodo > 0
        ? Math.round(((seats - pool.seats) * o.unitPriceCents * restantes) / noPeriodo)
        : 0;
    proRata = formatBRL(cents);
  }
  return {
    min,
    max: SEATS_MAX,
    ok,
    monthly: formatBRL(seats * o.unitPriceCents),
    proRata,
    hint: ok ? seatChangeHint(o, seats) : null,
  };
}

/** O preço do programa antes de criar: assentos × preço por mês começado (31 dias). */
export function programPreviewCents(
  seats: number,
  unitCents: number,
  startDate: string,
  endDate: string,
): number {
  const dias = diasEntre(startDate, endDate) + 1;
  return seats * unitCents * Math.max(1, Math.ceil(dias / DIAS_DO_MES_DE_PROGRAMA));
}
