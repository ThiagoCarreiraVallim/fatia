import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import {
  AnnouncementRepeat,
  MembershipStatus,
  NotificationKind,
  PostAuthorAs,
  type GroupAnnouncement,
  type Prisma,
} from '@fatia/db';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../common/prisma.service';
import { AnnouncementEmailService } from '../notifications/announcement-email.service';
import { NotificationService, type Notice } from '../notifications/notification.service';
import { blockedUserIds } from './block.service';
import { requireContentRole } from './content-roles';
import { dueOccurrence } from './announcement-schedule';
import {
  ANNOUNCEMENT_TITLE_MAX,
  AnnouncementAuthorGone,
  PIN_MAX_DAYS,
  POST_BODY_MAX,
  PostService,
} from './post.service';

/** O horário do comunicado anda em blocos de 15 minutos (prancha Pn-14). */
export const ANNOUNCEMENT_SLOT_MINUTES = 15;
/** Até quando dá para agendar. */
export const ANNOUNCEMENT_MAX_AHEAD_DAYS = 365;
export const ANNOUNCEMENT_REPEATS = ['NONE', 'DAILY', 'WEEKLY', 'MONTHLY'] as const;
/** O job olha os agendados uma vez por minuto. */
const EVERY_MS = 60_000;
const DIA_MS = 86_400_000;
const NOTICE_BODY_MAX = 140;
/** Falhas seguidas no mesmo disparo antes de desistir do comunicado. */
export const ANNOUNCEMENT_MAX_ATTEMPTS = 5;
/** Avisos (notificação e e-mail) de comunicado por comunidade em 7 dias, sem a env. */
export const ANNOUNCEMENT_PUSH_WEEKLY_DEFAULT = 3;

export interface AnnouncementInput {
  title: string;
  body: string;
  publishedAs: 'PERSON' | 'GROUP';
  pin: boolean;
  /** Dias no topo; nulo = sem prazo. */
  pinDays: number | null;
  push: boolean;
  /** Também por e-mail (#398). */
  alsoEmail?: boolean;
  /** ISO do primeiro disparo; nulo = agora. */
  at: string | null;
  repeat: (typeof ANNOUNCEMENT_REPEATS)[number];
}

export interface AnnouncementView {
  id: string;
  title: string;
  body: string;
  publishedAs: PostAuthorAs;
  pin: boolean;
  pinDays: number | null;
  push: boolean;
  alsoEmail: boolean;
  repeat: AnnouncementRepeat;
  nextRunAt: Date | null;
  lastRunAt: Date | null;
  createdAt: Date;
  author: string;
  /** Somados em todos os disparos (#398). */
  pushSent: number;
  pushDelivered: number;
  emailSent: number;
  /** Publicado agora, mas o limite semanal segurou a notificação e o e-mail. */
  pushSkipped?: boolean;
}

/** O que o editor precisa saber antes de mandar (#398). */
export interface AnnouncementSettings {
  pushWeeklyLimit: number;
  pushUsedThisWeek: number;
  emailAvailable: boolean;
}

/** O aviso na tela bloqueada: o título e o começo do texto, sem markdown. */
export function announcementNotice(p: {
  groupId: string;
  groupName: string;
  title: string;
  body: string;
}): Notice {
  const texto = p.body
    .replace(/[*_#>`[\]]/g, '')
    .replace(/\(https?:[^)]*\)/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return {
    kind: NotificationKind.ANNOUNCEMENTS,
    title: `${p.groupName}: ${p.title}`,
    body: texto.length > NOTICE_BODY_MAX ? `${texto.slice(0, NOTICE_BODY_MAX - 1)}…` : texto,
    url: `/community/${p.groupId}`,
  };
}

/**
 * Comunicados da equipe (#394, prancha Pn-14): publicar agora ou num horário
 * em blocos de 15 min, repetir (todo dia, toda semana, todo mês), fixar no
 * topo e avisar por notificação. Quem comunica é `announcement.publish` (dono
 * e profissional).
 *
 * Cada disparo vira um post kind ANNOUNCEMENT no mural. O job reivindica o
 * disparo trocando `nextRunAt` numa escrita condicional antes de publicar:
 * duas instâncias da API não publicam o mesmo comunicado duas vezes.
 *
 * As repetições contam da âncora (`anchorAt`, o primeiro horário) no fuso da
 * comunidade. Depois de uma queda, os atrasados viram um disparo só. Erro
 * passageiro devolve o `nextRunAt` ao horário previsto e conta a tentativa
 * (até `ANNOUNCEMENT_MAX_ATTEMPTS`); só quem agendou ter saído ou perdido o
 * papel cancela de vez.
 *
 * O aviso vai para todo membro ativo menos quem publicou; quem desligou
 * "Comunicados da comunidade" (`ANNOUNCEMENTS`) fica de fora pelo
 * `NotificationService`. Em nome de uma pessoa, não chega a quem tem bloqueio
 * com ela. Sem dado de saúde: o texto é o que a equipe escreveu.
 *
 * E-mail (#398): com `alsoEmail`, o mesmo público recebe o comunicado por
 * e-mail, menos quem desligou `ANNOUNCEMENTS` ou se descadastrou pelo link
 * (`AnnouncementEmailService`).
 *
 * Limite semanal (#398): cada comunidade manda no máximo
 * `ANNOUNCEMENT_PUSH_WEEKLY_LIMIT` disparos com aviso (notificação ou e-mail)
 * em 7 dias. Passou disso, o comunicado sai no mural e mais nada. A vaga é
 * reivindicada com trava por comunidade (dois disparos juntos não furam o
 * teto), só quando há alguém para avisar, e fica em `AnnouncementDispatch`:
 * apagar o post ou o comunicado não devolve a vaga.
 */
@Injectable()
export class AnnouncementService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AnnouncementService.name);
  private timer: NodeJS.Timeout | null = null;
  private readonly weeklyLimit: number;
  private readonly pending = new Set<Promise<void>>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly posts: PostService,
    private readonly notifications: NotificationService,
    @Optional() private readonly mail?: AnnouncementEmailService,
    @Optional() config?: ConfigService,
  ) {
    const env = Number(config?.get<string | number>('ANNOUNCEMENT_PUSH_WEEKLY_LIMIT'));
    this.weeklyLimit = Number.isInteger(env) && env >= 0 ? env : ANNOUNCEMENT_PUSH_WEEKLY_DEFAULT;
  }

  onModuleInit(): void {
    this.timer = setInterval(() => {
      void this.runDue(new Date()).catch((err: unknown) =>
        this.logger.warn(
          `Comunicados agendados falharam: ${err instanceof Error ? err.message : String(err)}`,
        ),
      );
    }, EVERY_MS);
    this.timer.unref();
  }

  async onModuleDestroy(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    await this.drain();
  }

  async create(
    userId: string,
    groupId: string,
    input: AnnouncementInput,
  ): Promise<AnnouncementView> {
    await requireContentRole(
      this.prisma,
      userId,
      groupId,
      'announcement.publish',
      'Seu papel não manda comunicados nesta comunidade',
    );
    const m = await this.prisma.groupMembership.findUniqueOrThrow({
      where: { groupId_userId: { groupId, userId } },
      select: { id: true },
    });
    const title = input.title.trim();
    const body = input.body.trim();
    if (!title || title.length > ANNOUNCEMENT_TITLE_MAX) {
      throw new BadRequestException(`O título tem de 1 a ${ANNOUNCEMENT_TITLE_MAX} caracteres`);
    }
    if (!body || body.length > POST_BODY_MAX) {
      throw new BadRequestException(`O texto tem de 1 a ${POST_BODY_MAX} caracteres`);
    }
    if (
      input.pinDays !== null &&
      (!Number.isInteger(input.pinDays) || input.pinDays < 1 || input.pinDays > PIN_MAX_DAYS)
    ) {
      throw new BadRequestException(`O aviso fica no topo de 1 a ${PIN_MAX_DAYS} dias`);
    }
    const agora = new Date();
    const at = input.at ? this.slot(input.at, agora) : null;
    if (!at && input.repeat !== 'NONE') {
      throw new BadRequestException('Para repetir, marque o primeiro horário');
    }

    const row = await this.prisma.groupAnnouncement.create({
      data: {
        groupId,
        membershipId: m.id,
        publishedAs: input.publishedAs === 'PERSON' ? PostAuthorAs.PERSON : PostAuthorAs.GROUP,
        title,
        body,
        pin: input.pin,
        pinDays: input.pin ? input.pinDays : null,
        push: input.push,
        alsoEmail: Boolean(input.alsoEmail),
        repeat: input.repeat,
        nextRunAt: at,
        anchorAt: at,
      },
      include: { membership: { select: AUTOR } },
    });
    const saida = at ? null : await this.fire(row, agora);
    const atual = await this.prisma.groupAnnouncement.findUniqueOrThrow({
      where: { id: row.id },
      include: { membership: { select: AUTOR } },
    });
    return { ...this.view(atual), ...(saida ? { pushSkipped: saida.pushSkipped } : {}) };
  }

  /** O limite da semana e se o e-mail está ligado nesta instância. */
  async settings(userId: string, groupId: string): Promise<AnnouncementSettings> {
    await requireContentRole(this.prisma, userId, groupId, 'announcement.publish');
    return {
      pushWeeklyLimit: this.weeklyLimit,
      pushUsedThisWeek: await this.usedThisWeek(this.prisma, groupId, new Date()),
      emailAvailable: Boolean(this.mail?.available),
    };
  }

  /** Os últimos que já saíram, com as contas de entrega. */
  async recent(userId: string, groupId: string): Promise<AnnouncementView[]> {
    await requireContentRole(this.prisma, userId, groupId, 'announcement.publish');
    const rows = await this.prisma.groupAnnouncement.findMany({
      where: { groupId, lastRunAt: { not: null } },
      include: { membership: { select: AUTOR } },
      orderBy: { lastRunAt: 'desc' },
      take: 10,
    });
    return rows.map((r) => this.view(r));
  }

  /** Os agendados (com próximo disparo), o mais próximo primeiro. */
  async list(userId: string, groupId: string): Promise<AnnouncementView[]> {
    await requireContentRole(this.prisma, userId, groupId, 'announcement.publish');
    const rows = await this.prisma.groupAnnouncement.findMany({
      where: { groupId, nextRunAt: { not: null }, canceledAt: null },
      include: { membership: { select: AUTOR } },
      orderBy: { nextRunAt: 'asc' },
      take: 100,
    });
    return rows.map((r) => this.view(r));
  }

  /** Cancela os próximos disparos. O que já saiu fica no mural. */
  async cancel(userId: string, groupId: string, id: string): Promise<{ canceled: true }> {
    await requireContentRole(this.prisma, userId, groupId, 'announcement.publish');
    const r = await this.prisma.groupAnnouncement.updateMany({
      where: { id, groupId, canceledAt: null },
      data: { canceledAt: new Date(), nextRunAt: null },
    });
    if (r.count === 0) throw new NotFoundException('Announcement not found');
    return { canceled: true };
  }

  /** Uma rodada do job. Devolve quantos comunicados saíram. */
  async runDue(now: Date): Promise<number> {
    const devidos = await this.prisma.groupAnnouncement.findMany({
      where: { nextRunAt: { lte: now }, canceledAt: null },
      include: { group: { select: { timezone: true } } },
      orderBy: { nextRunAt: 'asc' },
      take: 100,
    });
    let saiu = 0;
    for (const { group, ...a } of devidos) {
      const previsto = a.nextRunAt!;
      const { at, next } = dueOccurrence(
        a.anchorAt ?? previsto,
        previsto,
        now,
        a.repeat,
        group.timezone,
      );
      // Reivindica: só quem trocar o `nextRunAt` de fato publica.
      const pego = await this.prisma.groupAnnouncement.updateMany({
        where: { id: a.id, nextRunAt: previsto, canceledAt: null },
        data: { nextRunAt: next },
      });
      if (pego.count === 0) continue;
      try {
        await this.posts.publishAnnouncement(a, at);
      } catch (err) {
        await this.failed(a, previsto, next, now, err);
        continue;
      }
      saiu += 1;
      await this.prisma.groupAnnouncement.update({
        where: { id: a.id },
        data: { lastRunAt: at, attempts: 0 },
      });
      // O post já saiu: falha no aviso não volta o disparo (sairia duplicado).
      await this.notify(a, now).catch((err: unknown) =>
        this.logger.warn({
          event: 'comunicado_sem_aviso',
          announcementId: a.id,
          err: err instanceof Error ? err.message : String(err),
        }),
      );
    }
    return saiu;
  }

  /**
   * O disparo não saiu. Quem agendou saiu ou perdeu o papel: cancela. Outro
   * erro: volta ao horário previsto e tenta na próxima rodada, até o teto.
   */
  private async failed(
    a: GroupAnnouncement,
    previsto: Date,
    next: Date | null,
    now: Date,
    err: unknown,
  ): Promise<void> {
    const tentativas = a.attempts + 1;
    const desiste =
      err instanceof AnnouncementAuthorGone || tentativas >= ANNOUNCEMENT_MAX_ATTEMPTS;
    await this.prisma.groupAnnouncement.updateMany({
      where: { id: a.id, nextRunAt: next, canceledAt: null },
      data: desiste
        ? { nextRunAt: null, canceledAt: now, attempts: tentativas }
        : { nextRunAt: previsto, attempts: tentativas },
    });
    this.logger.warn({
      event: desiste ? 'comunicado_cancelado' : 'comunicado_tenta_de_novo',
      announcementId: a.id,
      attempts: tentativas,
      err: err instanceof Error ? err.message : String(err),
    });
  }

  private async fire(a: GroupAnnouncement, at: Date): Promise<{ pushSkipped: boolean }> {
    await this.posts.publishAnnouncement(a, at);
    await this.prisma.groupAnnouncement.update({
      where: { id: a.id },
      data: { lastRunAt: at },
    });
    // O post já saiu: erro no aviso vira log, nunca 500 (o cliente tentaria de
    // novo e o post sairia duplicado).
    return this.notify(a, at).catch((err: unknown) => {
      this.logger.warn({
        event: 'comunicado_sem_aviso',
        announcementId: a.id,
        err: err instanceof Error ? err.message : String(err),
      });
      return { pushSkipped: false };
    });
  }

  /** Disparos com aviso nos últimos 7 dias, pelo registro próprio (não pelo post). */
  private usedThisWeek(
    db: Prisma.TransactionClient | PrismaService,
    groupId: string,
    now: Date,
  ): Promise<number> {
    return db.announcementDispatch.count({
      where: { groupId, at: { gt: new Date(now.getTime() - 7 * DIA_MS) } },
    });
  }

  /** Reivindica uma vaga da semana para este disparo, com trava por comunidade. */
  private claimWeeklySlot(
    a: GroupAnnouncement,
    now: Date,
    canais: { push: boolean; email: boolean },
  ): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtext(${`announce-push:${a.groupId}`}))`;
      if ((await this.usedThisWeek(tx, a.groupId, now)) >= this.weeklyLimit) return false;
      await tx.announcementDispatch.create({
        data: { groupId: a.groupId, announcementId: a.id, at: now, ...canais },
      });
      return true;
    });
  }

  /**
   * O aviso (notificação e, se pediu, e-mail) do comunicado que acabou de
   * sair. Primeiro descobre quem recebe; só com alguém para avisar a vaga da
   * semana é reivindicada, na hora real do disparo (`now`).
   */
  private async notify(a: GroupAnnouncement, now: Date): Promise<{ pushSkipped: boolean }> {
    const porEmail = a.alsoEmail && Boolean(this.mail?.available);
    if (!a.push && !porEmail) return { pushSkipped: false };
    const [grupo, membros, autor] = await Promise.all([
      this.prisma.group.findUniqueOrThrow({ where: { id: a.groupId }, select: { name: true } }),
      this.prisma.groupMembership.findMany({
        where: { groupId: a.groupId, status: MembershipStatus.ACTIVE, id: { not: a.membershipId } },
        select: { userId: true },
      }),
      this.prisma.groupMembership.findUniqueOrThrow({
        where: { id: a.membershipId },
        select: { userId: true },
      }),
    ]);
    const fora =
      a.publishedAs === PostAuthorAs.PERSON
        ? new Set(await blockedUserIds(this.prisma, autor.userId))
        : new Set<string>();
    const candidatos = membros.map((m) => m.userId).filter((id) => !fora.has(id));
    // Quem desligou "Comunicados da comunidade" não recebe push nem e-mail.
    const desligados = new Set(
      (
        await this.prisma.notificationPreference.findMany({
          where: {
            userId: { in: candidatos },
            kind: NotificationKind.ANNOUNCEMENTS,
            enabled: false,
          },
          select: { userId: true },
        })
      ).map((p) => p.userId),
    );
    const para = candidatos.filter((id) => !desligados.has(id));
    if (para.length === 0) return { pushSkipped: false };
    if (!(await this.claimWeeklySlot(a, now, { push: a.push, email: porEmail }))) {
      this.logger.warn({ event: 'comunicado_sem_aviso_limite', announcementId: a.id });
      return { pushSkipped: true };
    }
    if (a.push) {
      this.notifications.notify(para, {
        ...announcementNotice({
          groupId: a.groupId,
          groupName: grupo.name,
          title: a.title,
          body: a.body,
        }),
        announcementId: a.id,
      });
    }
    if (porEmail) {
      // Em segundo plano: uma comunidade grande não segura o pedido nem o job.
      const envio = this.sendEmails(a, grupo.name, para)
        .catch((err: unknown) =>
          this.logger.warn({
            event: 'comunicado_email_falhou',
            announcementId: a.id,
            err: err instanceof Error ? err.message : String(err),
          }),
        )
        .finally(() => this.pending.delete(envio));
      this.pending.add(envio);
    }
    return { pushSkipped: false };
  }

  private async sendEmails(a: GroupAnnouncement, groupName: string, para: string[]) {
    const saiu = await this.mail!.send(para, { groupName, title: a.title, body: a.body });
    if (saiu > 0) {
      await this.prisma.groupAnnouncement.update({
        where: { id: a.id },
        data: { emailSent: { increment: saiu } },
      });
    }
  }

  /** Espera os e-mails em andamento (testes e desligamento da API). */
  async drain(): Promise<void> {
    while (this.pending.size > 0) await Promise.all([...this.pending]);
  }

  /** O horário pedido: futuro, em bloco de 15 min e até um ano à frente. */
  private slot(iso: string, agora: Date): Date {
    const at = new Date(iso);
    if (Number.isNaN(at.getTime())) throw new BadRequestException('Horário inválido');
    if (
      at.getUTCSeconds() !== 0 ||
      at.getUTCMilliseconds() !== 0 ||
      at.getUTCMinutes() % ANNOUNCEMENT_SLOT_MINUTES !== 0
    ) {
      throw new BadRequestException('O horário anda de 15 em 15 minutos');
    }
    if (at.getTime() <= agora.getTime()) {
      throw new BadRequestException('Escolha um horário que ainda não passou');
    }
    if (at.getTime() > agora.getTime() + ANNOUNCEMENT_MAX_AHEAD_DAYS * DIA_MS) {
      throw new BadRequestException('Agende para até um ano à frente');
    }
    return at;
  }

  private view(
    r: GroupAnnouncement & {
      membership: { displayName: string | null; user: { name: string; nickname: string | null } };
    },
  ): AnnouncementView {
    return {
      id: r.id,
      title: r.title,
      body: r.body,
      publishedAs: r.publishedAs,
      pin: r.pin,
      pinDays: r.pinDays,
      push: r.push,
      alsoEmail: r.alsoEmail,
      pushSent: r.pushSent,
      pushDelivered: r.pushDelivered,
      emailSent: r.emailSent,
      repeat: r.repeat,
      nextRunAt: r.nextRunAt,
      lastRunAt: r.lastRunAt,
      createdAt: r.createdAt,
      author:
        r.membership.displayName ??
        r.membership.user.nickname ??
        r.membership.user.name.split(/\s+/)[0] ??
        '',
    };
  }
}

const AUTOR = {
  displayName: true,
  user: { select: { name: true, nickname: true } },
} as const;
