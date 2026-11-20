import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import {
  GroupRole,
  MembershipStatus,
  NotificationKind,
  PlanOfferStatus,
  ReviewKind,
  ShareScope,
  type SessionReaction,
} from '@fatia/db';
import { PrismaService } from '../common/prisma.service';
import { hourInTz } from '../insights/helpers/time-buckets';
import { NotificationService, type Notice } from '../notifications/notification.service';
import { dateInTz } from '../progress/helpers/date-tz';
import { WorkoutSessionService } from '../workout/workout-session.service';
import { requireContentRole } from './content-roles';
import { firstName } from './display-name';
import { can, TEAM_ROLES } from './permissions';
import { accompaniedOnly } from './team-reach';
import { ProfessionalAccessService } from './professional-access.service';
import type {
  AtRiskRow,
  AtRiskView,
  ReviewFeedback,
  ReviewItem,
  ReviewQueue,
  ReviewSessionView,
} from './review.types';

/** A fila olha os últimos 7 dias. */
export const REVIEW_WINDOW_DAYS = 7;
export const RISK_DAYS_MIN = 3;
export const RISK_DAYS_MAX = 60;
export const FEEDBACK_BODY_MAX = 500;
/** O aviso diário sai a partir desta hora, no fuso da comunidade. */
export const RISK_DIGEST_HOUR = 9;
const DIGEST_EVERY_MS = 30 * 60_000;
const DIA_MS = 86_400_000;

/** As categorias que dizem "registrou alguma coisa" no "Em risco". */
const RISK_SCOPES: readonly ShareScope[] = [
  ShareScope.WORKOUT,
  ShareScope.NUTRITION,
  ShareScope.BODY,
  ShareScope.HABITS,
];

/** Nomes das leituras na trilha da pessoa ("Quem olhou seus dados"). */
const ACTION = {
  queue: 'list_review_queue',
  seen: 'mark_review_seen',
  session: 'get_review_session',
  feedback: 'send_session_feedback',
  risk: 'list_at_risk',
  digest: 'risk_digest',
} as const;

interface LinkedMember {
  membershipId: string;
  userId: string;
  name: string;
  joinedAt: Date;
  whatsapp: string | null;
  scopes: ShareScope[];
}

const daysBetween = (from: string, to: string) =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DIA_MS);

const latest = (dates: (Date | null | undefined)[]): Date | null =>
  dates.reduce<Date | null>((max, d) => (d && (!max || d > max) ? d : max), null);

/**
 * "Para revisar", "Em risco" e a sessão feita (#399, Pn-02, Pn-35 e Pn-35b).
 *
 * Tudo aqui é da equipe (dono e profissional, `panel.review`) e olha só quem
 * deu vínculo a QUEM OLHA: o papel abre a tela, mas cada número de saúde vem
 * pela porta única (`assertReadable`), uma leitura por pessoa e categoria, que
 * grava a linha na trilha dela. Categoria que o vínculo não tem nem é tentada:
 * a fila não vira uma lista de tentativas negadas em nome de quem não
 * compartilha.
 *
 * As respostas aos planos que a equipe mandou entram sem categoria: são
 * resposta ao que a própria equipe enviou, e a ficha já mostra o mesmo estado.
 *
 * Nenhum agregado novo sai daqui. O "Em risco" é nominal e só de quem tem
 * vínculo; o número da aba e do aviso diário é a contagem das linhas que a
 * pessoa já vê pelo nome, então não há o que inferir por diferença.
 */
@Injectable()
export class ReviewService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ReviewService.name);
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly access: ProfessionalAccessService,
    private readonly sessions: WorkoutSessionService,
    private readonly notifications: NotificationService,
  ) {}

  onModuleInit(): void {
    // `unref`: o timer não segura o processo (nem o jest) só por existir.
    this.timer = setInterval(() => {
      void this.sendRiskDigests(new Date()).catch((err: unknown) =>
        this.logger.warn(
          `Aviso diário do em risco falhou: ${err instanceof Error ? err.message : String(err)}`,
        ),
      );
    }, DIGEST_EVERY_MS);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  // ------------------------------------------------------------ fila

  async queue(viewerId: string, groupId: string, now = new Date()): Promise<ReviewQueue> {
    await this.requireTeam(viewerId, groupId);
    const since = new Date(now.getTime() - REVIEW_WINDOW_DAYS * DIA_MS);
    const linked = await this.linkedMembers(viewerId, groupId);
    const items: ReviewItem[] = [];

    for (const m of linked) {
      const base = {
        membershipId: m.membershipId,
        name: m.name,
        shares: m.scopes,
        whatsapp: m.whatsapp,
      };
      if (
        m.scopes.includes(ShareScope.WORKOUT) &&
        (await this.canRead(viewerId, m.membershipId, ShareScope.WORKOUT, ACTION.queue))
      ) {
        const rows = await this.prisma.workoutSession.findMany({
          where: { userId: m.userId, completedAt: { gte: since, lte: now } },
          select: {
            id: true,
            planName: true,
            startedAt: true,
            completedAt: true,
            plan: { select: { name: true } },
            _count: { select: { sets: true } },
          },
        });
        for (const r of rows) {
          items.push({
            ...base,
            kind: ReviewKind.WORKOUT,
            refId: r.id,
            at: r.completedAt!,
            title: r.plan?.name ?? r.planName ?? null,
            durationMinutes: Math.round(
              (r.completedAt!.getTime() - r.startedAt.getTime()) / 60_000,
            ),
            sets: r._count.sets,
            answer: null,
            seenAt: null,
            myFeedback: false,
          });
        }
      }
      if (
        m.scopes.includes(ShareScope.GOALS) &&
        (await this.canRead(viewerId, m.membershipId, ShareScope.GOALS, ACTION.queue))
      ) {
        const goals = await this.prisma.goal.findMany({
          where: { userId: m.userId, status: 'completed', completedAt: { gte: since, lte: now } },
          select: { id: true, title: true, completedAt: true },
        });
        for (const goal of goals) {
          items.push({
            ...base,
            kind: ReviewKind.GOAL,
            refId: goal.id,
            at: goal.completedAt!,
            title: goal.title,
            durationMinutes: null,
            sets: null,
            answer: null,
            seenAt: null,
            myFeedback: false,
          });
        }
      }
    }

    // As respostas ao que a equipe mandou: sem categoria, e só de quem ainda
    // é membro ativo desta comunidade.
    const answers = await this.prisma.planOfferVersion.findMany({
      where: {
        status: { in: [PlanOfferStatus.ACCEPTED, PlanOfferStatus.DECLINED] },
        respondedAt: { gte: since, lte: now },
        offer: { groupId, removedAt: null },
      },
      select: {
        id: true,
        title: true,
        status: true,
        respondedAt: true,
        offer: { select: { userId: true } },
      },
    });
    if (answers.length > 0) {
      const people = await this.members(
        groupId,
        answers.map((a) => a.offer.userId),
      );
      const scopesOf = new Map(linked.map((m) => [m.userId, m.scopes]));
      const meus = await accompaniedOnly(this.prisma, viewerId, groupId);
      for (const a of answers) {
        const p = people.get(a.offer.userId);
        if (!p || (meus && !meus.has(p.membershipId))) continue;
        items.push({
          kind: ReviewKind.PLAN_RESPONSE,
          refId: a.id,
          membershipId: p.membershipId,
          name: p.name,
          shares: scopesOf.get(a.offer.userId) ?? [],
          whatsapp: p.whatsapp,
          at: a.respondedAt!,
          title: a.title,
          durationMinutes: null,
          sets: null,
          answer: a.status === PlanOfferStatus.ACCEPTED ? 'ACCEPTED' : 'DECLINED',
          seenAt: null,
          myFeedback: false,
        });
      }
    }

    if (items.length > 0) {
      const refs = items.map((i) => i.refId);
      const workoutRefs = items.filter((i) => i.kind === ReviewKind.WORKOUT).map((i) => i.refId);
      const [seen, mine] = await Promise.all([
        this.prisma.reviewSeen.findMany({
          where: { userId: viewerId, groupId, refId: { in: refs } },
          select: { kind: true, refId: true, seenAt: true },
        }),
        workoutRefs.length
          ? this.prisma.sessionFeedback.findMany({
              where: { authorId: viewerId, groupId, sessionId: { in: workoutRefs } },
              select: { sessionId: true },
            })
          : Promise.resolve([]),
      ]);
      const seenAt = new Map(seen.map((x) => [`${x.kind}:${x.refId}`, x.seenAt]));
      const commented = new Set(mine.map((x) => x.sessionId));
      for (const i of items) {
        i.seenAt = seenAt.get(`${i.kind}:${i.refId}`) ?? null;
        i.myFeedback = commented.has(i.refId);
      }
    }

    items.sort((a, b) => b.at.getTime() - a.at.getTime());
    return { windowDays: REVIEW_WINDOW_DAYS, items };
  }

  /**
   * "Visto": some da aba "Para revisar" de quem marcou. O item precisa ser de
   * alguém ativo desta comunidade, e treino e meta passam pela porta de
   * leitura, como na fila: quem não vê o item não marca.
   */
  async markSeen(
    viewerId: string,
    groupId: string,
    kind: ReviewKind,
    refId: string,
  ): Promise<{ seenAt: Date }> {
    await this.requireTeam(viewerId, groupId);
    const subjectId = await this.subjectOf(groupId, kind, refId);
    const member = subjectId ? (await this.members(groupId, [subjectId])).get(subjectId) : null;
    if (!member) throw new NotFoundException('Item not found');
    if (kind !== ReviewKind.PLAN_RESPONSE) {
      const scope = kind === ReviewKind.WORKOUT ? ShareScope.WORKOUT : ShareScope.GOALS;
      if (!(await this.canRead(viewerId, member.membershipId, scope, ACTION.seen))) {
        throw new NotFoundException('Item not found');
      }
    }
    const row = await this.seen(viewerId, groupId, member.userId, kind, refId);
    return { seenAt: row.seenAt };
  }

  // ------------------------------------------------------------ sessão

  /**
   * A sessão feita (Pn-35). Sem Treino liberado para quem olha, só o nome e o
   * aviso (Pn-35b): nem data, nem link da ficha. A tentativa fica na trilha.
   */
  async session(viewerId: string, groupId: string, sessionId: string): Promise<ReviewSessionView> {
    await this.requireTeam(viewerId, groupId);
    const member = await this.sessionMember(groupId, sessionId);
    if (!(await this.canRead(viewerId, member.membershipId, ShareScope.WORKOUT, ACTION.session))) {
      return { shared: false, name: member.name };
    }
    const full = await this.sessions.summary(member.userId, sessionId);
    const { checkin, questions: _q, savedPlanId: _p, feedback: _f, ...summary } = full;
    void _q;
    void _p;
    void _f;
    const [feedback, seen] = await Promise.all([
      this.feedbackOf(viewerId, groupId, sessionId),
      this.prisma.reviewSeen.findUnique({
        where: {
          userId_groupId_kind_refId: {
            userId: viewerId,
            groupId,
            kind: ReviewKind.WORKOUT,
            refId: sessionId,
          },
        },
        select: { seenAt: true },
      }),
    ]);
    return {
      shared: true,
      membershipId: member.membershipId,
      name: member.name,
      whatsapp: member.whatsapp,
      summary,
      checkin,
      feedback,
      seenAt: seen?.seenAt ?? null,
    };
  }

  /**
   * Reação e comentário curto (Pn-35, "Enviar ao aluno"). Um por pessoa da
   * equipe, sessão e comunidade: mandar de novo troca o que veio (o que não
   * veio fica), e comentar em outra comunidade é outro comentário. Comentar
   * marca a sessão como vista para quem comentou.
   *
   * A pessoa recebe o aviso, sem o texto (ele apareceria na tela bloqueada),
   * só no primeiro envio e quando o texto aparece pela primeira vez: editar o
   * texto ou trocar a reação não avisa de novo. Ler o anterior e gravar correm
   * sob uma trava por (sessão, autor, comunidade), então envios simultâneos não
   * batem no índice único nem avisam duas vezes.
   */
  async sendFeedback(
    viewerId: string,
    groupId: string,
    sessionId: string,
    input: { reaction?: SessionReaction | null; body?: string | null },
  ): Promise<ReviewFeedback> {
    await this.requireTeam(viewerId, groupId);
    const body =
      input.body === undefined ? undefined : input.body === null ? null : input.body.trim() || null;
    // Por code point, como o `char_length` do CHECK e o DTO: um emoji conta 1.
    if (body && feedbackLength(body) > FEEDBACK_BODY_MAX) {
      throw new BadRequestException(`O comentário tem até ${FEEDBACK_BODY_MAX} caracteres.`);
    }
    if (input.reaction === undefined && body === undefined) {
      throw new BadRequestException('Escolha uma reação ou escreva um comentário.');
    }
    const member = await this.sessionMember(groupId, sessionId);
    if (!(await this.canRead(viewerId, member.membershipId, ShareScope.WORKOUT, ACTION.feedback))) {
      throw new NotFoundException('Session not found');
    }

    const key = { sessionId_authorId_groupId: { sessionId, authorId: viewerId, groupId } };
    const { before, row } = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`session-feedback:${sessionId}:${viewerId}:${groupId}`}))::text`;
      const before = await tx.sessionFeedback.findUnique({
        where: key,
        select: { reaction: true, body: true },
      });
      const reaction = input.reaction === undefined ? (before?.reaction ?? null) : input.reaction;
      const text = body === undefined ? (before?.body ?? null) : body;
      if (reaction === null && text === null) {
        throw new BadRequestException('Escolha uma reação ou escreva um comentário.');
      }
      // A comunidade é parte da chave: nunca entra no `update`.
      const row = await tx.sessionFeedback.upsert({
        where: key,
        create: { sessionId, groupId, authorId: viewerId, reaction, body: text },
        update: { reaction, body: text },
      });
      return { before, row };
    });
    await this.seen(viewerId, groupId, member.userId, ReviewKind.WORKOUT, sessionId);

    const author = await this.prisma.user.findUnique({
      where: { id: viewerId },
      select: { name: true },
    });
    const firstText = row.body !== null && (before?.body ?? null) === null;
    if (!before || firstText) {
      this.notifications.notify(
        [member.userId],
        feedbackNotice(author?.name ?? '', row.body !== null, sessionId),
      );
    }
    return {
      id: row.id,
      authorName: author?.name ?? null,
      reaction: row.reaction,
      body: row.body,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      isMine: true,
    };
  }

  // ------------------------------------------------------------ em risco

  async atRisk(viewerId: string, groupId: string, now = new Date()): Promise<AtRiskView> {
    const role = await this.requireTeam(viewerId, groupId);
    const [group, me] = await Promise.all([
      this.prisma.group.findUniqueOrThrow({
        where: { id: groupId },
        select: { riskDays: true, timezone: true },
      }),
      this.prisma.groupMembership.findUniqueOrThrow({
        where: { groupId_userId: { groupId, userId: viewerId } },
        select: { riskDigest: true },
      }),
    ]);
    const rows = await this.riskRows(viewerId, groupId, group, now, ACTION.risk);
    return {
      riskDays: group.riskDays,
      digest: me.riskDigest,
      canConfigure: can(role, 'group.update'),
      rows,
    };
  }

  async setRiskDays(
    viewerId: string,
    groupId: string,
    days: number,
  ): Promise<{ riskDays: number }> {
    const LIMITE = 'Só o dono muda o limite do em risco';
    const role = await requireContentRole(this.prisma, viewerId, groupId, 'group.update', LIMITE);
    // Mudar o limite é de quem vê o em risco (#404): o admin edita a
    // comunidade, mas não mexe num número que não enxerga.
    if (!can(role, 'panel.review') && !can(role, 'insights.read')) {
      throw new ForbiddenException(LIMITE);
    }
    if (!Number.isInteger(days) || days < RISK_DAYS_MIN || days > RISK_DAYS_MAX) {
      throw new BadRequestException(`O limite vai de ${RISK_DAYS_MIN} a ${RISK_DAYS_MAX} dias.`);
    }
    const g = await this.prisma.group.update({
      where: { id: groupId },
      data: { riskDays: days },
      select: { riskDays: true },
    });
    return g;
  }

  async setDigest(
    viewerId: string,
    groupId: string,
    enabled: boolean,
  ): Promise<{ digest: boolean }> {
    await this.requireTeam(viewerId, groupId);
    const m = await this.prisma.groupMembership.update({
      where: { groupId_userId: { groupId, userId: viewerId } },
      data: { riskDigest: enabled },
      select: { riskDigest: true },
    });
    return { digest: m.riskDigest };
  }

  /**
   * O aviso diário opcional (#399): "N alunos precisam de atenção", sem nomes.
   * Um por dia por pessoa e comunidade, a partir das 9h do fuso dela. O dia é
   * reivindicado antes de contar (`updateMany` condicional), então duas
   * instâncias não mandam duas vezes. Contar lê o mesmo que a lista, e a
   * leitura entra na trilha de cada pessoa contada.
   */
  async sendRiskDigests(now: Date): Promise<number> {
    const subs = await this.prisma.groupMembership.findMany({
      where: {
        riskDigest: true,
        status: MembershipStatus.ACTIVE,
        role: { in: [...TEAM_ROLES] },
      },
      select: {
        id: true,
        userId: true,
        role: true,
        groupId: true,
        riskDigestOn: true,
        group: { select: { name: true, timezone: true, riskDays: true } },
      },
    });
    let sent = 0;
    for (const sub of subs) {
      if (!can(sub.role, 'panel.review')) continue;
      const tz = sub.group.timezone;
      if (hourInTz(now, tz) < RISK_DIGEST_HOUR) continue;
      const today = dateInTz(now, tz);
      if (sub.riskDigestOn === today) continue;
      const claimed = await this.prisma.groupMembership.updateMany({
        where: {
          id: sub.id,
          OR: [{ riskDigestOn: null }, { riskDigestOn: { not: today } }],
        },
        data: { riskDigestOn: today },
      });
      if (claimed.count === 0) continue;
      // Uma pessoa que falha (leitura, trilha) não pode deixar as outras sem
      // o aviso do dia; a dela fica para amanhã, porque o dia já foi reivindicado.
      try {
        const rows = await this.riskRows(sub.userId, sub.groupId, sub.group, now, ACTION.digest);
        if (rows.length === 0) continue;
        this.notifications.notify(
          [sub.userId],
          riskDigestNotice(sub.groupId, sub.group.name, rows.length),
        );
        sent += 1;
      } catch (err) {
        this.logger.warn(
          `Aviso diário do em risco falhou para a associação ${sub.id}: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }
    return sent;
  }

  // ------------------------------------------------------------ internos

  private requireTeam(viewerId: string, groupId: string): Promise<GroupRole> {
    return requireContentRole(
      this.prisma,
      viewerId,
      groupId,
      'panel.review',
      'Seu papel não abre o acompanhamento desta comunidade',
    );
  }

  /**
   * Quem deu vínculo ativo a quem olha nesta comunidade, e é membro ativo
   * dela. O vínculo é procurado pelo par (quem olha, comunidade da URL), nunca
   * por um id de fora.
   */
  private async linkedMembers(viewerId: string, groupId: string): Promise<LinkedMember[]> {
    const links = await this.prisma.professionalLink.findMany({
      where: { professionalId: viewerId, groupId, revokedAt: null },
      select: { subjectUserId: true, scopes: true },
    });
    if (links.length === 0) return [];
    const scopes = new Map<string, Set<ShareScope>>();
    for (const l of links) {
      const set = scopes.get(l.subjectUserId) ?? new Set<ShareScope>();
      l.scopes.forEach((s) => set.add(s));
      scopes.set(l.subjectUserId, set);
    }
    const people = await this.members(groupId, [...scopes.keys()]);
    // "Profissionais veem só quem acompanham" (#404): a lista é a mesma da porta.
    const meus = await accompaniedOnly(this.prisma, viewerId, groupId);
    return [...people.values()]
      .filter((p) => p.userId !== viewerId)
      .filter((p) => !meus || meus.has(p.membershipId))
      .map((p) => ({ ...p, scopes: [...(scopes.get(p.userId) ?? [])].sort() }))
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  }

  /** Membros (papel MEMBER) ativos desta comunidade, por `userId`. */
  private async members(
    groupId: string,
    userIds: string[],
  ): Promise<Map<string, Omit<LinkedMember, 'scopes'>>> {
    const rows = await this.prisma.groupMembership.findMany({
      where: {
        groupId,
        userId: { in: [...new Set(userIds)] },
        status: MembershipStatus.ACTIVE,
        role: GroupRole.MEMBER,
      },
      select: {
        id: true,
        userId: true,
        joinedAt: true,
        createdAt: true,
        user: { select: { name: true, whatsapp: true, whatsappOptIn: true } },
      },
    });
    return new Map(
      rows.map((r) => [
        r.userId,
        {
          membershipId: r.id,
          userId: r.userId,
          name: r.user.name,
          // Associação antiga sem `joinedAt`: a criação dela é a entrada.
          joinedAt: r.joinedAt ?? r.createdAt,
          // Só o número que a pessoa deixou a equipe ver (perfil, #401).
          whatsapp: r.user.whatsappOptIn ? r.user.whatsapp : null,
        },
      ]),
    );
  }

  /** A porta única: `true` se leu (e gravou), `false` na recusa (também gravada). */
  private async canRead(
    viewerId: string,
    membershipId: string,
    scope: ShareScope,
    action: string,
  ): Promise<boolean> {
    try {
      await this.access.assertReadable(viewerId, membershipId, scope, action);
      return true;
    } catch (err) {
      if (err instanceof NotFoundException) return false;
      throw err;
    }
  }

  /** De quem é o item. Nulo = não existe (ou não é desta comunidade). */
  private async subjectOf(
    groupId: string,
    kind: ReviewKind,
    refId: string,
  ): Promise<string | null> {
    if (kind === ReviewKind.WORKOUT) {
      const s = await this.prisma.workoutSession.findUnique({
        where: { id: refId },
        select: { userId: true, completedAt: true },
      });
      return s?.completedAt ? s.userId : null;
    }
    if (kind === ReviewKind.GOAL) {
      const g = await this.prisma.goal.findUnique({
        where: { id: refId },
        select: { userId: true, status: true },
      });
      return g?.status === 'completed' ? g.userId : null;
    }
    const v = await this.prisma.planOfferVersion.findUnique({
      where: { id: refId },
      select: { status: true, offer: { select: { userId: true, groupId: true } } },
    });
    const answered =
      v?.status === PlanOfferStatus.ACCEPTED || v?.status === PlanOfferStatus.DECLINED;
    return answered && v.offer.groupId === groupId ? v.offer.userId : null;
  }

  /**
   * A sessão concluída de um membro ativo DESTA comunidade. Sessão de quem não
   * é daqui, aberta ou inexistente respondem igual: o id só encontra.
   */
  private async sessionMember(groupId: string, sessionId: string) {
    const s = await this.prisma.workoutSession.findUnique({
      where: { id: sessionId },
      select: { userId: true, completedAt: true },
    });
    const member = s?.completedAt
      ? (await this.members(groupId, [s.userId])).get(s.userId)
      : undefined;
    if (!member) throw new NotFoundException('Session not found');
    return member;
  }

  private seen(
    viewerId: string,
    groupId: string,
    subjectUserId: string,
    kind: ReviewKind,
    refId: string,
  ) {
    return this.prisma.reviewSeen.upsert({
      where: { userId_groupId_kind_refId: { userId: viewerId, groupId, kind, refId } },
      create: { userId: viewerId, groupId, subjectUserId, kind, refId },
      update: {},
      select: { seenAt: true },
    });
  }

  /** As reações e comentários desta comunidade na sessão. */
  private async feedbackOf(
    viewerId: string,
    groupId: string,
    sessionId: string,
  ): Promise<ReviewFeedback[]> {
    const rows = await this.prisma.sessionFeedback.findMany({
      where: { sessionId, groupId },
      include: { author: { select: { name: true } } },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map((r) => ({
      id: r.id,
      authorName: r.author?.name ?? null,
      reaction: r.reaction,
      body: r.body,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      isMine: r.authorId === viewerId,
    }));
  }

  /**
   * As linhas do "Em risco" para quem olha: o último registro em cada
   * categoria que a pessoa liberou para ele (treino, alimentação, corpo e
   * hábitos), cada uma lida pela porta única. Quem só liberou outras
   * categorias (metas, fotos) não entra: não dá para dizer que sumiu.
   */
  private async riskRows(
    viewerId: string,
    groupId: string,
    group: { riskDays: number; timezone: string },
    now: Date,
    action: string,
  ): Promise<AtRiskRow[]> {
    const tz = group.timezone;
    const today = dateInTz(now, tz);
    const linked = await this.linkedMembers(viewerId, groupId);
    const rows: AtRiskRow[] = [];
    for (const m of linked) {
      const scopes = m.scopes.filter((s) => RISK_SCOPES.includes(s));
      const lastBy = new Map<ShareScope, Date | null>();
      for (const scope of scopes) {
        if (!(await this.canRead(viewerId, m.membershipId, scope, action))) continue;
        lastBy.set(scope, await this.lastRecord(m.userId, scope, now));
      }
      if (lastBy.size === 0) continue;
      const since = (d: Date | null) => daysBetween(dateInTz(d ?? m.joinedAt, tz), today);
      const last = latest([...lastBy.values()]);
      const days = since(last);
      const level = (d: number): AtRiskRow['level'] =>
        d >= group.riskDays * 2 ? 'gone' : 'attention';
      if (days >= group.riskDays) {
        rows.push({
          membershipId: m.membershipId,
          name: m.name,
          signal: last ? 'inactive' : 'never',
          level: level(days),
          days,
          lastAt: last,
          shares: m.scopes,
          whatsapp: m.whatsapp,
        });
        continue;
      }
      // Registra outra coisa, mas parou de treinar.
      if (lastBy.has(ShareScope.WORKOUT)) {
        const lastWorkout = lastBy.get(ShareScope.WORKOUT) ?? null;
        const workoutDays = since(lastWorkout);
        if (workoutDays >= group.riskDays) {
          rows.push({
            membershipId: m.membershipId,
            name: m.name,
            signal: 'no_workout',
            level: level(workoutDays),
            days: workoutDays,
            lastAt: lastWorkout,
            shares: m.scopes,
            whatsapp: m.whatsapp,
          });
        }
      }
    }
    return rows.sort((a, b) => b.days - a.days || a.name.localeCompare(b.name, 'pt-BR'));
  }

  private async lastRecord(userId: string, scope: ShareScope, now: Date): Promise<Date | null> {
    switch (scope) {
      case ShareScope.WORKOUT:
        return (
          (
            await this.prisma.workoutSession.findFirst({
              where: { userId, completedAt: { not: null, lte: now } },
              orderBy: { completedAt: 'desc' },
              select: { completedAt: true },
            })
          )?.completedAt ?? null
        );
      case ShareScope.NUTRITION:
        return (
          (
            await this.prisma.meal.findFirst({
              where: { userId, eatenAt: { lte: now } },
              orderBy: { eatenAt: 'desc' },
              select: { eatenAt: true },
            })
          )?.eatenAt ?? null
        );
      case ShareScope.BODY:
        return (
          (
            await this.prisma.weightLog.findFirst({
              where: { userId, loggedAt: { lte: now } },
              orderBy: { loggedAt: 'desc' },
              select: { loggedAt: true },
            })
          )?.loggedAt ?? null
        );
      case ShareScope.HABITS: {
        const [water, steps] = await Promise.all([
          this.prisma.waterLog.findFirst({
            where: { userId, loggedAt: { lte: now } },
            orderBy: { loggedAt: 'desc' },
            select: { loggedAt: true },
          }),
          this.prisma.stepLog.findFirst({
            where: { userId, loggedAt: { lte: now } },
            orderBy: { loggedAt: 'desc' },
            select: { loggedAt: true },
          }),
        ]);
        return latest([water?.loggedAt, steps?.loggedAt]);
      }
      default:
        return null;
    }
  }
}

/** O tamanho do comentário em code points, como o `char_length` do Postgres. */
export function feedbackLength(body: string): number {
  return [...body].length;
}

/** Para a pessoa: a equipe comentou ou reagiu. Sem o texto: é a tela bloqueada. */
export function feedbackNotice(authorName: string, withText: boolean, sessionId: string): Notice {
  const quem = authorName ? firstName(authorName) : 'Sua equipe';
  return {
    kind: NotificationKind.COMMUNITY,
    title: `${quem} ${withText ? 'comentou' : 'reagiu ao'} seu treino`,
    body: 'Toque para ver.',
    url: `/workout/history/${sessionId}`,
  };
}

/** Para a equipe: só o número, nunca nomes. */
export function riskDigestNotice(groupId: string, groupName: string, n: number): Notice {
  return {
    kind: NotificationKind.COMMUNITY,
    title: groupName,
    body: `${n} ${n === 1 ? 'aluno precisa' : 'alunos precisam'} de atenção.`,
    // Caminho sem `?`: o toque só aceita caminho interno puro (`notificationTarget`).
    url: `/org/${groupId}/review/at-risk`,
  };
}
