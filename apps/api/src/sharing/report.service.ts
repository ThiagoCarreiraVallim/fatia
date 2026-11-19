import { BadRequestException, Injectable, NotFoundException, Optional } from '@nestjs/common';
import {
  ChallengeCheckinStatus,
  GroupRole,
  InviteOrigin,
  MembershipStatus,
  PlanOfferStatus,
  ReviewKind,
} from '@fatia/db';
import { PrismaService } from '../common/prisma.service';
import { MIN_CELL } from '../insights/aggregation.service';
import { AnnouncementEmailService } from '../notifications/announcement-email.service';
import { addDaysIso, dateInTz, dayBoundsInTz } from '../progress/helpers/date-tz';
import { requireContentRole } from './content-roles';
import { binarySplit } from './panel.service';
import type {
  InviteOrigins,
  MonthReport,
  OriginKindLabel,
  OriginRow,
  OriginsDays,
  ReportCell,
  ReportChallengeRow,
  ReportSettings,
  ReportWeek,
} from './report.types';

export const ORIGINS_DAYS = [7, 30] as const;
/** Quantos meses para trás o relatório abre, além do atual. */
export const REPORT_MONTHS_BACK = 12;
export const WEEKLY_GOAL_MAX = 100_000;
/** "Voltaram": treinaram de novo depois de 14 dias ou mais sem treinar. */
export const RETURN_GAP_DAYS = 14;
/** Ativou = 1º treino em até 48 h depois de entrar (a mesma regra da #401). */
const ACTIVATION_MS = 48 * 3_600_000;
const DIA_MS = 86_400_000;
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const READ_FORBIDDEN = 'Só o dono vê o relatório da comunidade';
const WRITE_FORBIDDEN = 'Só o dono muda o relatório da comunidade';

/** `YYYY-MM` deslocado `k` meses. */
export function shiftMonth(month: string, k: number): string {
  const [y, m] = month.split('-').map(Number);
  const total = y! * 12 + (m! - 1) + k;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`;
}

const daysInMonth = (month: string) => {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y!, m!, 0)).getUTCDate();
};

const daysBetween = (from: string, to: string) =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DIA_MS);

const round1 = (n: number) => Math.round(n * 10) / 10;
const pct = (a: number, b: number) => Math.round((a / b) * 100);

/**
 * Contagem de pessoas: 0 sai como 0, de 1 a 4 não sai, e só então o número
 * de eventos (`value`) aparece.
 */
function byPeople(people: number, value: number): number | null {
  if (people === 0) return 0;
  return people >= MIN_CELL ? value : null;
}

interface Participant {
  membershipId: string;
  userId: string;
  joined: Date;
}

interface Session {
  id: string;
  userId: string;
  at: Date;
  /** O dia do treino no fuso da comunidade. */
  day: string;
}

/** O núcleo de um mês: quem conta, o período e os treinos dele. */
interface MonthCore {
  month: string;
  start: Date;
  end: Date;
  partial: boolean;
  /** Os dias do período (até ontem no mês atual). */
  days: string[];
  participants: Participant[];
  /** Treinos do período, só depois de a pessoa entrar. */
  sessions: Session[];
  /** Dias com treino de cada pessoa. */
  daysOf: Map<string, Set<string>>;
  active: number | null;
  percent: number | null;
  total: number | null;
  perActiveDays: number | null;
}

/**
 * O relatório do mês e as origens dos convites (#400, Pn-03, Pn-25, Ex-02).
 *
 * Só o dono lê (`insights.read`, como os outros agregados), e a meta da
 * equipe, o e-mail mensal e quem o recebe também são dele (`group.update`).
 *
 * Todo número sai de quem aceitou entrar nas estatísticas (`statsOptIn`),
 * inclusive no denominador, e só treino entra (`AGGREGATION_POLICY.md` §6 e
 * §7). Indicadores de dois lados (ativo / não ativo, voltou / não voltou,
 * terminou / não terminou) usam `binarySplit`: os dois lados com 5 ou mais.
 * Nenhum nome sai daqui.
 */
@Injectable()
export class ReportService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly mail?: AnnouncementEmailService,
  ) {}

  async report(
    viewerId: string,
    groupId: string,
    month?: string,
    now = new Date(),
  ): Promise<MonthReport> {
    await requireContentRole(this.prisma, viewerId, groupId, 'insights.read', READ_FORBIDDEN);
    const { timezone } = await this.prisma.group.findUniqueOrThrow({
      where: { id: groupId },
      select: { timezone: true },
    });
    const atual = dateInTz(now, timezone).slice(0, 7);
    const m = month ?? shiftMonth(atual, -1);
    // O mês é um período nomeado (AGGREGATION_POLICY §4): nada de janela livre.
    if (!MONTH.test(m) || m > atual || m < shiftMonth(atual, -REPORT_MONTHS_BACK)) {
      throw new BadRequestException(
        `O mês vai de ${shiftMonth(atual, -REPORT_MONTHS_BACK)} a ${atual}.`,
      );
    }
    return this.build(groupId, m, now);
  }

  /** O relatório sem conferir papel: a rota já conferiu, e o e-mail mensal também usa. */
  async build(groupId: string, month: string, now = new Date()): Promise<MonthReport> {
    const group = await this.prisma.group.findUniqueOrThrow({
      where: { id: groupId },
      select: { name: true, timezone: true, riskDays: true, weeklySessionsGoal: true },
    });
    const tz = group.timezone;
    const atual = dateInTz(now, tz).slice(0, 7);
    const cur = await this.core(groupId, tz, month, now, true);
    const prev = await this.core(groupId, tz, shiftMonth(month, -1), now, false);
    const n = cur.participants.length;
    const ids = cur.participants.map((p) => p.userId);

    const [returned, atRisk, plans, reviews, challenges] = await Promise.all([
      this.returned(cur),
      this.atRisk(cur, tz, group.riskDays),
      this.plans(groupId, cur),
      this.reviews(groupId, cur),
      this.challenges(groupId, cur, now),
    ]);

    const weeks = this.weeks(cur, n);
    const cheias = weeks.filter((w) => w.days === 7 && !w.suppressed);
    const goal = group.weeklySessionsGoal;

    // Delta só entre dois meses fechados: o mês corrente comparado ao anterior inteiro engana.
    const comparar = !cur.partial;
    const delta = (a: number | null, b: number | null) =>
      comparar && a !== null && b !== null ? a - b : null;
    const deltaPct = (a: number | null, b: number | null) =>
      comparar && a !== null && b !== null && b > 0 ? pct(a - b, b) : null;

    const months = Array.from({ length: REPORT_MONTHS_BACK + 1 }, (_, i) => shiftMonth(atual, -i));

    return {
      month,
      months,
      partial: cur.partial,
      groupName: group.name,
      optIn: n >= MIN_CELL ? n : null,
      riskDays: group.riskDays,
      weeklySessionsGoal: goal,
      activeMembers: {
        value: cur.active,
        percent: cur.percent,
        deltaPts: delta(cur.percent, prev.percent),
        delta: delta(cur.active, prev.active),
      },
      sessions: {
        total: cur.total,
        perActive: cur.active ? round1(cur.total! / cur.active) : null,
        deltaPct: deltaPct(cur.total, prev.total),
      },
      trainingDays: {
        perActive: cur.perActiveDays,
        deltaPct: deltaPct(cur.perActiveDays, prev.perActiveDays),
      },
      returned,
      atRisk,
      plans,
      reviews,
      weeks,
      weeksAverage: cheias.length
        ? Math.round(cheias.reduce((s, w) => s + w.value!, 0) / cheias.length)
        : null,
      weeksOnGoal:
        goal && cheias.length
          ? { hit: cheias.filter((w) => w.value! >= goal).length, of: cheias.length }
          : null,
      activeByDay: this.activeByDay(cur, n),
      challenges: challenges.rows,
      challengeLift: this.lift(cur, ids, challenges.participants),
    };
  }

  // ------------------------------------------------------------ o mês

  private async core(
    groupId: string,
    tz: string,
    month: string,
    now: Date,
    withEarlier: boolean,
  ): Promise<MonthCore & { earlier: Session[] }> {
    const start = dayBoundsInTz(`${month}-01`, tz).start;
    const fimDoMes = dayBoundsInTz(`${shiftMonth(month, 1)}-01`, tz).start;
    // O mês corrente vai até ontem: o dia que anda mudaria o número de uma hora para outra.
    const hoje = dateInTz(now, tz);
    const inicioDeHoje = dayBoundsInTz(hoje, tz).start;
    const end = fimDoMes > inicioDeHoje ? inicioDeHoje : fimDoMes;
    const partial = fimDoMes > inicioDeHoje;
    const ultimo = partial ? addDaysIso(hoje, -1) : `${month}-${daysInMonth(month)}`;
    const days: string[] = [];
    for (let d = `${month}-01`; d <= ultimo && d.startsWith(month); d = addDaysIso(d, 1)) {
      days.push(d);
    }

    const rows = await this.prisma.groupMembership.findMany({
      where: {
        groupId,
        status: MembershipStatus.ACTIVE,
        role: GroupRole.MEMBER,
        statsOptIn: true,
        OR: [{ joinedAt: { lt: end } }, { joinedAt: null, createdAt: { lt: end } }],
      },
      select: { id: true, userId: true, joinedAt: true, createdAt: true },
    });
    const participants = rows.map((r) => ({
      membershipId: r.id,
      userId: r.userId,
      joined: r.joinedAt ?? r.createdAt,
    }));
    const entrou = new Map(participants.map((p) => [p.userId, p.joined]));
    const desde = withEarlier ? new Date(start.getTime() - RETURN_GAP_DAYS * DIA_MS) : start;
    const brutas =
      participants.length && end > start
        ? await this.prisma.workoutSession.findMany({
            where: { userId: { in: [...entrou.keys()] }, completedAt: { gte: desde, lt: end } },
            select: { id: true, userId: true, completedAt: true },
            orderBy: { completedAt: 'asc' },
          })
        : [];
    // Treino de antes de entrar na comunidade não é da comunidade.
    const todas = brutas
      .filter((s) => s.completedAt! >= entrou.get(s.userId)!)
      .map((s) => ({
        id: s.id,
        userId: s.userId,
        at: s.completedAt!,
        day: dateInTz(s.completedAt!, tz),
      }));
    const sessions = todas.filter((s) => s.at >= start);
    const earlier = todas.filter((s) => s.at < start);

    const daysOf = new Map<string, Set<string>>();
    for (const s of sessions) {
      const set = daysOf.get(s.userId) ?? new Set<string>();
      set.add(s.day);
      daysOf.set(s.userId, set);
    }
    const n = participants.length;
    const ativos = daysOf.size;
    const active = binarySplit(ativos, n - ativos);
    const totalDias = [...daysOf.values()].reduce((s, d) => s + d.size, 0);
    return {
      month,
      start,
      end,
      partial,
      days,
      participants,
      sessions,
      earlier,
      daysOf,
      active,
      percent: active === null ? null : pct(active, n),
      total: active === null ? null : sessions.length,
      perActiveDays: active ? round1(totalDias / active) : null,
    };
  }

  /** Voltaram a treinar no mês depois de 14 dias ou mais sem treino. */
  private async returned(cur: MonthCore & { earlier: Session[] }): Promise<number | null> {
    const n = cur.participants.length;
    if (n < MIN_CELL) return null;
    const corte = new Date(cur.start.getTime() - RETURN_GAP_DAYS * DIA_MS);
    const entrou = new Map(cur.participants.map((p) => [p.userId, p.joined]));
    // O último treino de antes da janela de 14 dias: se existe, a volta já está garantida.
    const antigos = await this.prisma.workoutSession.groupBy({
      by: ['userId'],
      where: { userId: { in: [...entrou.keys()] }, completedAt: { lt: corte } },
      _max: { completedAt: true },
    });
    const anterior = new Map<string, number>();
    for (const a of antigos) {
      const t = a._max.completedAt;
      if (t && t >= entrou.get(a.userId)!) anterior.set(a.userId, t.getTime());
    }
    for (const s of cur.earlier) anterior.set(s.userId, s.at.getTime());
    const voltaram = new Set<string>();
    for (const s of cur.sessions) {
      const antes = anterior.get(s.userId);
      if (antes !== undefined && s.at.getTime() - antes >= RETURN_GAP_DAYS * DIA_MS) {
        voltaram.add(s.userId);
      }
      anterior.set(s.userId, s.at.getTime());
    }
    return binarySplit(voltaram.size, n - voltaram.size);
  }

  /**
   * Sem treino há `riskDays` dias ou mais no último dia do período: a mesma
   * regra do "Em risco" (#399), contada só sobre treino (AGGREGATION_POLICY §6).
   * Quem nunca treinou conta da entrada.
   */
  private async atRisk(cur: MonthCore, tz: string, riskDays: number): Promise<number | null> {
    const n = cur.participants.length;
    if (n < MIN_CELL || cur.days.length === 0) return null;
    const ultimos = await this.prisma.workoutSession.groupBy({
      by: ['userId'],
      where: {
        userId: { in: cur.participants.map((p) => p.userId) },
        completedAt: { lt: cur.end },
      },
      _max: { completedAt: true },
    });
    const ultimo = new Map(ultimos.map((u) => [u.userId, u._max.completedAt]));
    const fim = cur.days[cur.days.length - 1]!;
    let emRisco = 0;
    for (const p of cur.participants) {
      const t = ultimo.get(p.userId);
      const desde = t && t > p.joined ? t : p.joined;
      if (daysBetween(dateInTz(desde, tz), fim) >= riskDays) emRisco += 1;
    }
    return binarySplit(emRisco, n - emRisco);
  }

  /** Planos novos que a equipe mandou no mês a quem conta, e a resposta. */
  private async plans(groupId: string, cur: MonthCore): Promise<MonthReport['plans']> {
    const vazio = { sent: null, acceptedPercent: null, declined: null, noResponse: null };
    if (!cur.participants.length) return { ...vazio, sent: 0 };
    const ofertas = await this.prisma.planOffer.findMany({
      where: {
        groupId,
        userId: { in: cur.participants.map((p) => p.userId) },
        versions: { some: { version: 1, sentAt: { gte: cur.start, lt: cur.end } } },
      },
      select: {
        userId: true,
        versions: { select: { status: true }, orderBy: { version: 'desc' } },
      },
    });
    const gente = (f: (o: (typeof ofertas)[number]) => boolean) =>
      new Set(ofertas.filter(f).map((o) => o.userId)).size;
    const aceita = (o: (typeof ofertas)[number]) =>
      o.versions.some((v) => v.status === PlanOfferStatus.ACCEPTED);
    const recusada = (o: (typeof ofertas)[number]) =>
      !aceita(o) && o.versions[0]?.status === PlanOfferStatus.DECLINED;
    const semResposta = (o: (typeof ofertas)[number]) => !aceita(o) && !recusada(o);

    const sent = byPeople(
      gente(() => true),
      ofertas.length,
    );
    if (!sent) return { ...vazio, sent };
    const aceitas = ofertas.filter(aceita).length;
    // Aceitou / não aceitou é de dois lados: os dois com 5 ou mais pessoas.
    if (
      binarySplit(
        gente(aceita),
        gente((o) => !aceita(o)),
      ) === null
    )
      return { ...vazio, sent };
    // "Recusados" e "sem resposta" repartem o "não aceitou": só saem se os dois saem.
    const recusados = byPeople(gente(recusada), ofertas.filter(recusada).length);
    const sem = byPeople(gente(semResposta), ofertas.filter(semResposta).length);
    const reparte = recusados !== null && sem !== null;
    return {
      sent,
      acceptedPercent: pct(aceitas, ofertas.length),
      declined: reparte ? recusados : null,
      noResponse: reparte ? sem : null,
    };
  }

  /** Treinos do mês que a equipe desta comunidade viu ou comentou (#399), e em quanto tempo. */
  private async reviews(groupId: string, cur: MonthCore): Promise<MonthReport['reviews']> {
    const ids = cur.sessions.map((s) => s.id);
    if (!ids.length) return { reviewed: 0, withinDayPercent: null, medianHours: null };
    const [comentarios, vistos] = await Promise.all([
      this.prisma.sessionFeedback.findMany({
        where: { groupId, sessionId: { in: ids } },
        select: { sessionId: true, createdAt: true },
      }),
      this.prisma.reviewSeen.findMany({
        where: { groupId, kind: ReviewKind.WORKOUT, refId: { in: ids } },
        select: { refId: true, seenAt: true },
      }),
    ]);
    const primeira = new Map<string, number>();
    const marca = (id: string, t: Date) => {
      const atual = primeira.get(id);
      if (atual === undefined || t.getTime() < atual) primeira.set(id, t.getTime());
    };
    for (const c of comentarios) marca(c.sessionId, c.createdAt);
    for (const v of vistos) marca(v.refId, v.seenAt);

    const revisadas = cur.sessions.filter((s) => primeira.has(s.id));
    const pessoas = new Set(revisadas.map((s) => s.userId));
    const reviewed = byPeople(pessoas.size, revisadas.length);
    if (!reviewed) return { reviewed, withinDayPercent: null, medianHours: null };

    const espera = revisadas.map((s) => Math.max(0, primeira.get(s.id)! - s.at.getTime()));
    const rapidas = revisadas.filter((_, i) => espera[i]! <= DIA_MS);
    const lentas = revisadas.filter((_, i) => espera[i]! > DIA_MS);
    const ok = (k: number) => k === 0 || k >= MIN_CELL;
    const lado = (l: Session[]) => new Set(l.map((s) => s.userId)).size;
    const ordenadas = [...espera].sort((a, b) => a - b);
    const meio = Math.floor(ordenadas.length / 2);
    const mediana =
      ordenadas.length % 2 ? ordenadas[meio]! : (ordenadas[meio - 1]! + ordenadas[meio]!) / 2;
    return {
      reviewed,
      withinDayPercent:
        ok(lado(rapidas)) && ok(lado(lentas)) ? pct(rapidas.length, revisadas.length) : null,
      medianHours: Math.round(mediana / 3_600_000),
    };
  }

  /** Desafios que tocam o mês, contados só sobre quem aceitou entrar nas estatísticas. */
  private async challenges(
    groupId: string,
    cur: MonthCore,
    now: Date,
  ): Promise<{ rows: ReportChallengeRow[]; participants: Set<string> }> {
    const n = cur.participants.length;
    const porMembership = new Map(cur.participants.map((p) => [p.membershipId, p.userId]));
    const desafios = await this.prisma.groupChallenge.findMany({
      where: { groupId, startsAt: { lt: cur.end }, endsAt: { gt: cur.start } },
      select: {
        id: true,
        title: true,
        kind: true,
        endsAt: true,
        endedEarlyAt: true,
        participants: {
          where: { membershipId: { in: [...porMembership.keys()] } },
          select: {
            id: true,
            membershipId: true,
            score: true,
            checkins: { select: { status: true, reviewedAt: true } },
          },
        },
      },
      orderBy: { startsAt: 'asc' },
    });
    const todos = new Set<string>();
    const rows = desafios.map((d) => {
      for (const p of d.participants) todos.add(porMembership.get(p.membershipId)!);
      const p = d.participants.length;
      const participants = binarySplit(p, n - p);
      const acabou = (d.endedEarlyAt ?? d.endsAt) <= now;
      const pontuaram = d.participants.filter((x) => x.score > 0).length;
      const finished: ReportChallengeRow['finished'] = !acabou
        ? 'running'
        : participants === null
          ? null
          : binarySplit(pontuaram, p - pontuaram);

      const revisados = d.participants.flatMap((x) =>
        x.checkins.filter((c) => c.reviewedAt !== null).map((c) => ({ quem: x.id, ...c })),
      );
      const anulados = revisados.filter((c) => c.status === ChallengeCheckinStatus.VOIDED);
      const mantidos = revisados.filter((c) => c.status !== ChallengeCheckinStatus.VOIDED);
      const lado = (l: { quem: string }[]) => new Set(l.map((c) => c.quem)).size;
      const reviewed = byPeople(lado(revisados), revisados.length);
      // Anulados e mantidos repartem os revisados: os dois lados com 0 ou 5 ou mais.
      const voided =
        reviewed === null
          ? null
          : lado(mantidos) === 0 || lado(mantidos) >= MIN_CELL
            ? byPeople(lado(anulados), anulados.length)
            : null;
      return { id: d.id, title: d.title, kind: d.kind, participants, finished, reviewed, voided };
    });
    return { rows, participants: todos };
  }

  /** "Quem participa de algum desafio registra 2,1× mais dias": dois grupos de 5 ou mais. */
  private lift(cur: MonthCore, ids: string[], participantes: Set<string>): number | null {
    const dentro = ids.filter((id) => participantes.has(id));
    const fora = ids.filter((id) => !participantes.has(id));
    if (dentro.length < MIN_CELL || fora.length < MIN_CELL) return null;
    const media = (l: string[]) =>
      l.reduce((s, id) => s + (cur.daysOf.get(id)?.size ?? 0), 0) / l.length;
    const f = media(fora);
    return f > 0 ? round1(media(dentro) / f) : null;
  }

  /** Blocos de 7 dias a partir do dia 1 (o último pode ser curto). */
  private weeks(cur: MonthCore, n: number): ReportWeek[] {
    const out: ReportWeek[] = [];
    for (let i = 0; i < cur.days.length; i += 7) {
      const bloco = new Set(cur.days.slice(i, i + 7));
      const doBloco = cur.sessions.filter((s) => bloco.has(s.day));
      const gente = new Set(doBloco.map((s) => s.userId)).size;
      const ok = binarySplit(gente, n - gente) !== null;
      out.push({
        key: String(i + 1),
        days: bloco.size,
        value: ok ? doBloco.length : null,
        suppressed: !ok,
      });
    }
    return out;
  }

  /** Membros ativos acumulados até cada dia do mês. */
  private activeByDay(cur: MonthCore, n: number): ReportCell[] {
    const primeiro = new Map<string, string>();
    for (const s of cur.sessions) {
      const d = s.day;
      const atual = primeiro.get(s.userId);
      if (!atual || d < atual) primeiro.set(s.userId, d);
    }
    return cur.days.map((key) => {
      const ate = [...primeiro.values()].filter((d) => d <= key).length;
      const v = binarySplit(ate, n - ate);
      return { key, value: v, suppressed: v === null };
    });
  }

  // ------------------------------------------------------------ origens

  /**
   * Origem dos convites (Pn-25): de quem entrou por link, QR, código ou e-mail
   * com nome ou origem, nos últimos 7 ou 30 dias inteiros (até ontem, no fuso
   * da comunidade), quantos entraram e quantos treinaram em até 48 h.
   *
   * Linha com menos de 5 fica oculta. O total só sai se o que ficou oculto
   * for um bloco seguro (AGGREGATION_POLICY §2: duas linhas ou mais, 5 ou mais
   * pessoas, e folga de 5): senão, total menos as linhas visíveis devolveria a
   * linha pequena. A taxa total segue a mesma ideia sobre as linhas sem taxa.
   */
  async origins(
    viewerId: string,
    groupId: string,
    days: OriginsDays,
    now = new Date(),
  ): Promise<InviteOrigins> {
    await requireContentRole(this.prisma, viewerId, groupId, 'insights.read', READ_FORBIDDEN);
    const { timezone } = await this.prisma.group.findUniqueOrThrow({
      where: { id: groupId },
      select: { timezone: true },
    });
    const hoje = dateInTz(now, timezone);
    const fim = dayBoundsInTz(hoje, timezone).start;
    const inicio = dayBoundsInTz(addDaysIso(hoje, -days), timezone).start;
    const entradas = await this.prisma.groupMembership.findMany({
      where: {
        groupId,
        status: MembershipStatus.ACTIVE,
        role: GroupRole.MEMBER,
        statsOptIn: true,
        joinedAt: { gte: inicio, lt: fim },
        // O convite é desta comunidade e tem nome ou origem.
        joinedViaInvite: { groupId, OR: [{ origin: { not: null } }, { label: { not: null } }] },
      },
      select: {
        userId: true,
        joinedAt: true,
        joinedViaInvite: { select: { origin: true, label: true, email: true, code: true } },
      },
    });
    const sessoes = entradas.length
      ? await this.prisma.workoutSession.findMany({
          where: {
            userId: { in: entradas.map((e) => e.userId) },
            completedAt: { gte: inicio, lte: new Date(fim.getTime() + ACTIVATION_MS) },
          },
          select: { userId: true, completedAt: true },
        })
      : [];

    type Linha = Omit<OriginRow, 'joined' | 'activated' | 'percent'> & {
      e: number;
      a: number;
      b: number;
    };
    const linhas = new Map<string, Linha>();
    for (const m of entradas) {
      const c = m.joinedViaInvite!;
      const kind = originKind(c);
      const label = c.label?.trim() || null;
      const key = `${c.origin ?? ''}|${label ?? ''}|${kind}`;
      const l = linhas.get(key) ?? { key, origin: c.origin, label, kind, e: 0, a: 0, b: 0 };
      l.e += 1;
      const entrou = m.joinedAt!.getTime();
      // A janela de 48 h fecha antes de hoje: o número fica igual o dia todo.
      if (entrou + ACTIVATION_MS <= fim.getTime()) {
        const ativou = sessoes.some(
          (s) =>
            s.userId === m.userId &&
            s.completedAt!.getTime() >= entrou &&
            s.completedAt!.getTime() <= entrou + ACTIVATION_MS,
        );
        if (ativou) l.a += 1;
        else l.b += 1;
      }
      linhas.set(key, l);
    }

    const rows: OriginRow[] = [...linhas.values()]
      .sort((x, y) => y.e - x.e || (x.label ?? '').localeCompare(y.label ?? ''))
      .map(({ e, a, b, ...l }) => {
        const joined = e >= MIN_CELL ? e : null;
        const activated = joined !== null ? binarySplit(a, b) : null;
        return { ...l, joined, activated, percent: activated === null ? null : pct(a, a + b) };
      });

    const todas = [...linhas.values()];
    const ocultas = todas.filter((l) => l.e < MIN_CELL);
    const somaOculta = ocultas.reduce((s, l) => s + l.e, 0);
    const blocoSeguro =
      ocultas.length === 0 ||
      (ocultas.length >= 2 && somaOculta >= MIN_CELL && somaOculta - ocultas.length >= MIN_CELL);
    const joined = blocoSeguro ? todas.reduce((s, l) => s + l.e, 0) : null;

    const A = todas.reduce((s, l) => s + l.a, 0);
    const B = todas.reduce((s, l) => s + l.b, 0);
    const semTaxa = todas.filter((l) => l.e < MIN_CELL || binarySplit(l.a, l.b) === null);
    const restoA = semTaxa.reduce((s, l) => s + l.a, 0);
    const restoB = semTaxa.reduce((s, l) => s + l.b, 0);
    const taxaSegura =
      joined !== null &&
      binarySplit(A, B) !== null &&
      (semTaxa.length === 0 || (restoA >= MIN_CELL && restoB >= MIN_CELL));
    return {
      days,
      joined,
      activated: taxaSegura ? A : null,
      percent: taxaSegura ? pct(A, A + B) : null,
      rows,
    };
  }

  // ------------------------------------------------------------ configurações

  async settings(viewerId: string, groupId: string): Promise<ReportSettings> {
    await requireContentRole(this.prisma, viewerId, groupId, 'group.update', WRITE_FORBIDDEN);
    return this.settingsOf(groupId);
  }

  async updateSettings(
    viewerId: string,
    groupId: string,
    input: { weeklySessionsGoal?: number | null; reportEmailEnabled?: boolean },
  ): Promise<ReportSettings> {
    await requireContentRole(this.prisma, viewerId, groupId, 'group.update', WRITE_FORBIDDEN);
    const meta = input.weeklySessionsGoal;
    if (
      meta !== undefined &&
      meta !== null &&
      (!Number.isInteger(meta) || meta < 1 || meta > WEEKLY_GOAL_MAX)
    ) {
      throw new BadRequestException(
        `A meta vai de 1 a ${WEEKLY_GOAL_MAX.toLocaleString('pt-BR')} sessões por semana.`,
      );
    }
    await this.prisma.group.update({
      where: { id: groupId },
      data: {
        ...(meta !== undefined ? { weeklySessionsGoal: meta } : {}),
        ...(input.reportEmailEnabled !== undefined
          ? { reportEmailEnabled: input.reportEmailEnabled }
          : {}),
      },
    });
    return this.settingsOf(groupId);
  }

  /**
   * Marca quem da equipe recebe o e-mail mensal. O id precisa ser de alguém
   * da equipe ativo NESTA comunidade (senão 404); o dono recebe sempre.
   */
  async setRecipient(
    viewerId: string,
    groupId: string,
    membershipId: string,
    enabled: boolean,
  ): Promise<ReportSettings> {
    await requireContentRole(this.prisma, viewerId, groupId, 'group.update', WRITE_FORBIDDEN);
    const r = await this.prisma.groupMembership.updateMany({
      where: {
        id: membershipId,
        groupId,
        status: MembershipStatus.ACTIVE,
        role: { in: [GroupRole.PROFESSIONAL, GroupRole.CREATOR] },
      },
      data: { reportEmail: enabled },
    });
    if (r.count === 0) throw new NotFoundException('Pessoa da equipe não encontrada');
    return this.settingsOf(groupId);
  }

  private async settingsOf(groupId: string): Promise<ReportSettings> {
    const [g, team] = await Promise.all([
      this.prisma.group.findUniqueOrThrow({
        where: { id: groupId },
        select: { weeklySessionsGoal: true, reportEmailEnabled: true },
      }),
      this.prisma.groupMembership.findMany({
        where: {
          groupId,
          status: MembershipStatus.ACTIVE,
          role: { in: [GroupRole.OWNER, GroupRole.PROFESSIONAL, GroupRole.CREATOR] },
        },
        select: { id: true, role: true, reportEmail: true, user: { select: { name: true } } },
        orderBy: [{ role: 'asc' }, { user: { name: 'asc' } }],
      }),
    ]);
    return {
      weeklySessionsGoal: g.weeklySessionsGoal,
      reportEmailEnabled: g.reportEmailEnabled,
      emailAvailable: this.mail?.available ?? false,
      team: team.map((t) => ({
        membershipId: t.id,
        name: t.user.name,
        role: t.role,
        reportEmail: t.role === GroupRole.OWNER || t.reportEmail,
      })),
    };
  }
}

/** O "Tipo" da tabela de origens: QR, link, lista, e-mail ou código. */
function originKind(c: {
  origin: InviteOrigin | null;
  email: string | null;
  code: string | null;
}): OriginKindLabel {
  if (c.code) return 'code';
  if (c.email) return 'email';
  if (c.origin === InviteOrigin.QR) return 'qr';
  if (c.origin === InviteOrigin.EMAIL_LIST) return 'list';
  return 'link';
}
