import { Injectable } from '@nestjs/common';
import {
  ChallengeCheckinStatus,
  GroupRole,
  JoinVia,
  MembershipStatus,
  type PlanTemplateKind,
} from '@fatia/db';
import { PrismaService } from '../common/prisma.service';
import { MIN_CELL } from '../insights/aggregation.service';
import { addDaysIso, dateInTz, dayBoundsInTz } from '../progress/helpers/date-tz';
import { requireContentRole } from './content-roles';
import { activationPendingWhere } from './invite-state';
import { can, type GroupAction } from './permissions';

const DIA_MS = 86_400_000;
export const OVERVIEW_DAYS = [7, 30, 90] as const;
export type OverviewDays = (typeof OVERVIEW_DAYS)[number];
/** Quem entrou há até isto conta em "Entraram e ainda não registraram". */
export const NEW_MEMBER_DAYS = 30;
export const SEARCH_QUERY_MAX = 60;
const SEARCH_MEMBERS_MAX = 8;
const SEARCH_PLANS_MAX = 5;
const SEARCH_SCREENS_MAX = 6;
const ITEMS_MAX = 10;

/** Os números do menu. `null` = o papel não faz aquilo, e o menu não mostra. */
export interface PanelCounts {
  pendingRequests: number | null;
  pendingInvites: number | null;
  openReports: number | null;
  challengeReview: number | null;
}

/** Uma célula do gráfico: suprimida nunca vira 0. */
export interface OverviewCell {
  key: string;
  value: number | null;
  suppressed: boolean;
}

/** Uma linha da tabela da Visão geral (Item, Tipo, Status, Pessoa, Quando, Responsável). */
export interface OverviewItem {
  id: string;
  title: string;
  type: 'request' | 'report' | 'review' | 'challenge' | 'plan';
  status: string;
  /** Nome de quem o item envolve; nulo quando não há (ou não pode haver) nome. */
  person: string | null;
  at: Date | null;
  owner: string | null;
  /** A seção do painel que abre o item (`members`, `moderation`, `challenges`...). */
  section: string;
  /** Id para a rota da seção, quando há (membro, desafio). */
  refId: string | null;
}

export interface PanelOverview {
  days: OverviewDays;
  counts: PanelCounts;
  /** Membros ativos (papel MEMBER) e quantos entraram nos últimos 30 dias. */
  members: { active: number; joinedLast30Days: number };
  /** Entraram nos últimos 7 dias; convite junta link, e-mail e código de entrada. */
  newThisWeek: { total: number; viaInvite: number; viaPage: number; viaUnknown: number };
  /** Só com `insights.read`: tudo passa pelo `statsOptIn` e pelo mínimo de 5. */
  aggregates: {
    /** Treinaram nos últimos 7 dias. `null` = menos de 5 pessoas de um lado. */
    active7d: { value: number | null; percent: number | null };
    /** Entraram nos últimos 30 dias e ainda não treinaram. `null` = esconder. */
    notLoggedYet: number | null;
    activity: { workouts: OverviewCell[]; people: OverviewCell[] };
  } | null;
  items: { needsYou: OverviewItem[]; challenges: OverviewItem[]; sent: OverviewItem[] };
}

export interface SearchMember {
  membershipId: string;
  name: string;
  role: GroupRole;
  status: MembershipStatus;
}
export interface SearchScreen {
  key: string;
  label: string;
  group: string;
}
export interface SearchPlan {
  id: string;
  title: string;
  kind: PlanTemplateKind;
  published: boolean;
}
export interface PanelSearchResult {
  members: SearchMember[];
  screens: SearchScreen[];
  plans: SearchPlan[];
}

/**
 * As telas que a busca acha, com a ação que o papel precisa para usar cada
 * uma. A chave é a mesma seção do menu da web (`panelNav` no api-client).
 * Só entram telas que existem: as próximas issues do painel acrescentam as
 * delas aqui e no menu.
 */
export const PANEL_SCREENS: readonly (SearchScreen & { action: GroupAction })[] = [
  { key: 'overview', label: 'Visão geral', group: 'Acompanhar', action: 'panel.overview' },
  { key: 'review', label: 'Para revisar', group: 'Acompanhar', action: 'panel.review' },
  { key: 'members', label: 'Membros', group: 'Pessoas', action: 'invite.create' },
  { key: 'invites', label: 'Convites', group: 'Pessoas', action: 'invite.create' },
  { key: 'seats', label: 'Assentos e faturas', group: 'Pessoas', action: 'billing.read' },
  { key: 'content', label: 'Planos e dicas', group: 'Conteúdo', action: 'content.publish' },
  { key: 'exercises', label: 'Exercícios', group: 'Conteúdo', action: 'content.publish' },
  { key: 'moderation', label: 'Mural e avisos', group: 'Comunidade', action: 'content.moderate' },
  {
    key: 'announcements',
    label: 'Comunicados e enquetes',
    group: 'Comunidade',
    action: 'announcement.publish',
  },
  { key: 'challenges', label: 'Desafios', group: 'Comunidade', action: 'challenge.manage' },
  { key: 'benefits', label: 'Benefícios', group: 'Comunidade', action: 'benefit.manage' },
  { key: 'agent', label: 'Agente da comunidade', group: 'IA', action: 'group.update' },
  { key: 'settings', label: 'Configurações', group: 'Conta', action: 'group.update' },
];

const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** O nome que a equipe vê no painel: o da conta (como na lista de Membros). */
const nomeDe = (u: { name: string }) => u.name;

/**
 * O painel base do redesign (#398): os contadores do menu, a Visão geral e a
 * busca ⌘K. Cada método confere o papel de novo (a rota já conferiu), e cada
 * número segue a ação de quem o vê.
 *
 * Nada aqui lê dado de saúde de uma pessoa: os agregados saem de contagens de
 * treino de quem deu `statsOptIn`, sempre com 5 ou mais de cada lado (MIN_CELL), e o
 * resto é administração (pedidos, convites, denúncias, envios de quem pergunta).
 * Por isso não há linha em `ProfessionalAccessLog`.
 */
@Injectable()
export class PanelService {
  constructor(private readonly prisma: PrismaService) {}

  async counts(userId: string, groupId: string): Promise<PanelCounts> {
    const role = await requireContentRole(
      this.prisma,
      userId,
      groupId,
      'panel.overview',
      'Seu papel não abre o painel desta comunidade',
    );
    return this.countsFor(userId, groupId, role, new Date());
  }

  async overview(
    userId: string,
    groupId: string,
    days: OverviewDays,
    now = new Date(),
  ): Promise<PanelOverview> {
    const role = await requireContentRole(
      this.prisma,
      userId,
      groupId,
      'panel.overview',
      'Seu papel não abre o painel desta comunidade',
    );
    const group = await this.prisma.group.findUniqueOrThrow({
      where: { id: groupId },
      select: { timezone: true },
    });
    const semana = new Date(now.getTime() - 7 * DIA_MS);
    const mes = new Date(now.getTime() - NEW_MEMBER_DAYS * DIA_MS);
    const membro = { groupId, status: MembershipStatus.ACTIVE, role: GroupRole.MEMBER };
    const [counts, active, joined, novos] = await Promise.all([
      this.countsFor(userId, groupId, role, now),
      this.prisma.groupMembership.count({ where: membro }),
      this.prisma.groupMembership.count({ where: { ...membro, joinedAt: { gte: mes } } }),
      this.prisma.groupMembership.groupBy({
        by: ['joinVia'],
        where: { ...membro, joinedAt: { gte: semana } },
        _count: { _all: true },
      }),
    ]);
    const porVia = (v: JoinVia) => novos.find((x) => x.joinVia === v)?._count._all ?? 0;
    return {
      days,
      counts,
      members: { active, joinedLast30Days: joined },
      newThisWeek: {
        total: novos.reduce((s, x) => s + x._count._all, 0),
        viaInvite: porVia(JoinVia.INVITE) + porVia(JoinVia.CODE),
        viaPage: porVia(JoinVia.PAGE),
        // Quem entrou antes da #398 não tem origem gravada: a soma fecha com ele.
        viaUnknown: novos.find((x) => x.joinVia === null)?._count._all ?? 0,
      },
      aggregates: can(role, 'insights.read')
        ? await this.aggregates(groupId, group.timezone, days, now)
        : null,
      items: await this.items(userId, groupId, role, counts, now),
    };
  }

  async search(userId: string, groupId: string, raw: string): Promise<PanelSearchResult> {
    const role = await requireContentRole(
      this.prisma,
      userId,
      groupId,
      'panel.search',
      'Seu papel não busca no painel desta comunidade',
    );
    const q = raw.trim().slice(0, SEARCH_QUERY_MAX);
    if (!q) return { members: [], screens: [], plans: [] };
    const alvo = semAcento(q);

    const [pessoas, planos] = await Promise.all([
      this.prisma.groupMembership.findMany({
        where: {
          groupId,
          status: { in: [MembershipStatus.ACTIVE, MembershipStatus.INVITED] },
          user: { name: { contains: q, mode: 'insensitive' } },
        },
        // Só nome, papel e situação: e-mail, consentimento e saúde ficam fora.
        select: { id: true, role: true, status: true, user: { select: { name: true } } },
        orderBy: { user: { name: 'asc' } },
        take: SEARCH_MEMBERS_MAX,
      }),
      can(role, 'content.publish')
        ? this.prisma.groupPlanTemplate.findMany({
            where: { groupId, title: { contains: q, mode: 'insensitive' } },
            select: { id: true, title: true, kind: true, publishedAt: true },
            orderBy: { updatedAt: 'desc' },
            take: SEARCH_PLANS_MAX,
          })
        : Promise.resolve([]),
    ]);
    return {
      members: pessoas.map((m) => ({
        membershipId: m.id,
        name: nomeDe(m.user),
        role: m.role,
        status: m.status,
      })),
      screens: PANEL_SCREENS.filter(
        (s) =>
          can(role, s.action) &&
          (semAcento(s.label).includes(alvo) || semAcento(s.group).includes(alvo)),
      )
        .slice(0, SEARCH_SCREENS_MAX)
        .map(({ key, label, group }) => ({ key, label, group })),
      plans: planos.map((p) => ({
        id: p.id,
        title: p.title,
        kind: p.kind,
        published: p.publishedAt !== null,
      })),
    };
  }

  private async countsFor(
    userId: string,
    groupId: string,
    role: GroupRole,
    now: Date,
  ): Promise<PanelCounts> {
    const se = <T>(acao: GroupAction, fn: () => Promise<T>) =>
      can(role, acao) ? fn() : Promise.resolve(null);
    const [pendingRequests, pendingInvites, openReports, challengeReview] = await Promise.all([
      se('member.approve', () =>
        this.prisma.groupMembership.count({
          where: { groupId, status: MembershipStatus.INVITED, role: { not: GroupRole.OWNER } },
        }),
      ),
      se('invite.create', () =>
        this.prisma.groupInvite.count({ where: activationPendingWhere(groupId, role, now) }),
      ),
      se('content.moderate', () =>
        this.prisma.groupPostReport.count({
          where: { resolvedAt: null, post: { groupId } },
        }),
      ),
      se('challenge.review', () =>
        this.prisma.challengeCheckin.count({ where: reviewWhere(groupId, userId) }),
      ),
    ]);
    return { pendingRequests, pendingInvites, openReports, challengeReview };
  }

  /**
   * Os números de comportamento da Visão geral. Só quem disse sim às
   * estatísticas entra, inclusive no denominador, e cada número de dois lados só sai com 5 ou mais de cada lado.
   * Só treino conta: alimentação, peso e medidas nunca entram num agregado
   * (`AGGREGATION_POLICY.md` §6), por isso "ativos" é quem treinou.
   */
  private async aggregates(
    groupId: string,
    timezone: string,
    days: OverviewDays,
    now: Date,
  ): Promise<NonNullable<PanelOverview['aggregates']>> {
    // Só membro (a equipe não é medida) e só quem disse sim às estatísticas.
    const participantes = await this.prisma.groupMembership.findMany({
      where: {
        groupId,
        status: MembershipStatus.ACTIVE,
        statsOptIn: true,
        role: GroupRole.MEMBER,
      },
      select: { userId: true, joinedAt: true },
    });
    const ids = participantes.map((p) => p.userId);
    // Tudo em dias inteiros que já acabaram, no fuso da comunidade: o número fica
    // congelado o dia todo. Janela que anda com o relógio deixaria ver a diferença
    // quando uma pessoa entra ou sai dela no meio do dia.
    const hoje = dateInTz(now, timezone);
    const fimOntem = dayBoundsInTz(hoje, timezone).start;
    const inicioYmd = addDaysIso(hoje, -days);
    const chaves = Array.from({ length: days }, (_, i) => addDaysIso(inicioYmd, i));
    const vazio = {
      active7d: { value: null, percent: null },
      notLoggedYet: null,
      activity: {
        workouts: chaves.map((key) => ({ key, value: null, suppressed: true })),
        people: chaves.map((key) => ({ key, value: null, suppressed: true })),
      },
    };
    if (participantes.length < MIN_CELL) return vazio;

    const desde = dayBoundsInTz(inicioYmd, timezone).start;
    const semana = dayBoundsInTz(addDaysIso(hoje, -7), timezone).start;
    const corteNovos = dayBoundsInTz(addDaysIso(hoje, -NEW_MEMBER_DAYS), timezone).start;
    const maisAntigo = new Date(Math.min(desde.getTime(), semana.getTime(), corteNovos.getTime()));
    const sessoes = await this.prisma.workoutSession.findMany({
      where: { userId: { in: ids }, completedAt: { gte: maisAntigo, lt: fimOntem } },
      select: { userId: true, completedAt: true },
    });

    // Ativos em 7 dias: [treinaram, não treinaram]. Indicador binário: os dois
    // lados precisam de 5 ou mais (0 também é pequeno), senão um entrega o outro.
    const treinaram = new Set(sessoes.filter((s) => s.completedAt! >= semana).map((s) => s.userId));
    const ativos = binarySplit(treinaram.size, participantes.length - treinaram.size);
    const active7d =
      ativos === null
        ? { value: null, percent: null }
        : {
            value: ativos,
            percent: Math.round((ativos / participantes.length) * 100),
          };

    // Entraram e ainda não registraram: quem entrou entre 30 dias atrás e ontem,
    // e não treinou até o fim de ontem. Só o número, pelo mesmo binário.
    const novos = participantes.filter(
      (p) => p.joinedAt && p.joinedAt >= corteNovos && p.joinedAt < fimOntem,
    );
    const entrouEm = new Map(novos.map((p) => [p.userId, p.joinedAt!]));
    const registraram = new Set(
      sessoes
        .filter((s) => entrouEm.has(s.userId) && s.completedAt! >= entrouEm.get(s.userId)!)
        .map((s) => s.userId),
    );
    const naoRegistraram = novos.length - registraram.size;
    const notLoggedYet =
      binarySplit(naoRegistraram, registraram.size) === null ? null : naoRegistraram;

    // O gráfico, por dia no fuso da comunidade.
    const porDia = new Map<string, { sessoes: number; gente: Set<string> }>(
      chaves.map((k) => [k, { sessoes: 0, gente: new Set() }]),
    );
    for (const s of sessoes) {
      const dia = porDia.get(dateInTz(s.completedAt!, timezone));
      if (!dia) continue;
      dia.sessoes += 1;
      dia.gente.add(s.userId);
    }
    // Cada dia também é de dois lados (treinou / não treinou): sai só com 5 ou
    // mais de cada lado. 0 é pequeno, e o dia em que quase todos treinaram
    // entregaria os poucos que ficaram parados.
    const serie = (valor: (d: { sessoes: number; gente: Set<string> }) => number) =>
      chaves.map((key) => {
        const d = porDia.get(key)!;
        const ok = binarySplit(d.gente.size, participantes.length - d.gente.size) !== null;
        return { key, value: ok ? valor(d) : null, suppressed: !ok };
      });

    return {
      active7d,
      notLoggedYet,
      activity: { workouts: serie((d) => d.sessoes), people: serie((d) => d.gente.size) },
    };
  }

  /** A tabela da Visão geral: o que pede ação, os desafios e os envios de quem pergunta. */
  private async items(
    userId: string,
    groupId: string,
    role: GroupRole,
    counts: PanelCounts,
    now: Date,
  ): Promise<PanelOverview['items']> {
    const needsYou: OverviewItem[] = [];
    if (counts.pendingRequests) {
      const pedidos = await this.prisma.groupMembership.findMany({
        where: { groupId, status: MembershipStatus.INVITED, role: { not: GroupRole.OWNER } },
        select: { id: true, invitedAt: true, user: { select: { name: true } } },
        orderBy: { invitedAt: 'asc' },
        take: ITEMS_MAX,
      });
      for (const p of pedidos) {
        needsYou.push({
          id: `request:${p.id}`,
          title: `${nomeDe(p.user)} pediu para entrar`,
          type: 'request',
          status: 'Aguardando',
          person: nomeDe(p.user),
          at: p.invitedAt,
          owner: null,
          section: 'members',
          refId: null,
        });
      }
    }
    if (counts.openReports) {
      needsYou.push({
        id: 'reports',
        title:
          counts.openReports === 1
            ? '1 denúncia no mural'
            : `${counts.openReports} denúncias no mural`,
        type: 'report',
        status: 'Nova',
        person: null,
        at: null,
        owner: null,
        section: 'moderation',
        refId: null,
      });
    }
    if (counts.challengeReview) {
      needsYou.push({
        id: 'review',
        title:
          counts.challengeReview === 1
            ? '1 check-in para revisar'
            : `${counts.challengeReview} check-ins para revisar`,
        type: 'review',
        status: 'Em revisão',
        person: null,
        at: null,
        owner: null,
        section: 'challenges',
        refId: null,
      });
    }

    const desafios = await this.prisma.groupChallenge.findMany({
      where: { groupId, finalizedAt: null, endedEarlyAt: null, endsAt: { gte: now } },
      select: {
        id: true,
        title: true,
        startsAt: true,
        endsAt: true,
        author: { select: { name: true } },
        _count: { select: { participants: true } },
      },
      orderBy: { startsAt: 'asc' },
      take: ITEMS_MAX,
    });

    // Só o que quem pergunta mandou: o envio de outra pessoa da equipe é dela.
    const envios = can(role, 'offer.create')
      ? await this.prisma.planOffer.findMany({
          where: { groupId, authorId: userId, removedAt: null },
          select: {
            id: true,
            user: { select: { name: true } },
            versions: {
              orderBy: { version: 'desc' },
              take: 1,
              select: { title: true, status: true, sentAt: true, respondedAt: true },
            },
          },
          orderBy: { updatedAt: 'desc' },
          take: ITEMS_MAX,
        })
      : [];

    return {
      needsYou,
      challenges: desafios.map((d) => ({
        id: d.id,
        title:
          d._count.participants === 1
            ? `${d.title} · 1 participando`
            : `${d.title} · ${d._count.participants} participando`,
        type: 'challenge',
        status: d.startsAt > now ? 'Começa em breve' : 'Em andamento',
        person: null,
        at: d.endsAt,
        owner: d.author ? nomeDe(d.author) : null,
        section: 'challenges',
        refId: d.id,
      })),
      sent: envios.flatMap((o) => {
        const v = o.versions[0];
        if (!v) return [];
        return [
          {
            id: o.id,
            title: v.title,
            type: 'plan' as const,
            status: OFFER_STATUS[v.status] ?? v.status,
            person: nomeDe(o.user),
            at: v.respondedAt ?? v.sentAt,
            owner: null,
            section: 'members',
            refId: null,
          },
        ];
      }),
    };
  }
}

const OFFER_STATUS: Record<string, string> = {
  PENDING: 'Aguardando',
  ACCEPTED: 'Aceito',
  DECLINED: 'Recusado',
  SUPERSEDED: 'Substituído',
};

/** A mesma fila de `ChallengeCheckinService.queue`, para contar. */
function reviewWhere(groupId: string, userId: string) {
  return {
    status: ChallengeCheckinStatus.FLAGGED,
    participant: {
      challenge: { groupId, finalizedAt: null },
      membership: { userId: { not: userId } },
    },
  };
}

/**
 * Um lado de um indicador de dois lados (`a` + `b` = todo mundo), ou `null`
 * se qualquer lado tem menos de `MIN_CELL`. Zero conta como pequeno: "0
 * treinaram" diria de cada pessoa que ela não treinou.
 */
export function binarySplit(a: number, b: number): number | null {
  return a < MIN_CELL || b < MIN_CELL ? null : a;
}
