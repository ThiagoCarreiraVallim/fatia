import {
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes } from 'node:crypto';
import { GroupRole, MembershipStatus, type GroupMembership } from '@fatia/db';
import { PrismaService } from '../common/prisma.service';
import { EmailService } from '../notifications/email.service';
import { inviteEmail } from '../notifications/invite-email';
import { NotificationService } from '../notifications/notification.service';
import { inviteNotice } from './community-notices';
import { can, TEAM_ROLES, type GroupAction } from './permissions';
import {
  assertNotBanned,
  MembershipService,
  type JoinConsent,
  type MembershipResult,
} from './membership.service';

/** Resposta única de recusa: inválido, expirado, revogado, esgotado ou de outro e-mail. */
const INVITE_NOT_FOUND = 'Invite not found';
const NOT_FOUND = 'Group not found';

export const INVITE_MAX_PER_DAY = 50;
export const INVITE_DEFAULT_DAYS = 7;
export const INVITE_MAX_DAYS = 30;
const RESEND_MIN_INTERVAL_MS = 10 * 60 * 1000;
/** O e-mail do convidado não fica além disto depois do uso ou da expiração. */
export const INVITE_EMAIL_RETENTION_DAYS = 30;
/**
 * De quanto em quanto tempo o expurgo roda sozinho. Antes ele só rodava ao criar
 * convite, e a comunidade que parava de convidar guardava o e-mail para sempre.
 */
export const INVITE_EMAIL_PURGE_INTERVAL_MS = 6 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export type InvitableRole = Exclude<GroupRole, 'OWNER'>;

export interface CreateInviteInput {
  role: InvitableRole;
  email?: string;
  maxUses?: number;
  expiresInDays?: number;
}

export interface InviteView {
  id: string;
  role: GroupRole;
  email: string | null;
  maxUses: number | null;
  uses: number;
  expiresAt: Date;
  createdAt: Date;
  lastSentAt: Date | null;
}

export interface CreatedInvite {
  invite: InviteView;
  /** O link aparece só aqui: o banco guarda o hash do token. */
  url: string;
  emailSent: boolean;
}

export type BatchSkipReason = 'invalid' | 'duplicate' | 'member' | 'pending_invite';

export interface BatchInviteInput {
  role: InvitableRole;
  emails: string[];
  expiresInDays?: number;
}

export interface BatchInviteResult {
  created: { email: string; inviteId: string; emailSent: boolean }[];
  skipped: { email: string; reason: BatchSkipReason }[];
}

/** O mesmo formato que o `@IsEmail` do DTO aceita, sem a dependência no service. */
const EMAIL = /^[^\s@,;<>"]+@[^\s@,;<>"]+\.[^\s@,;<>"]+$/;

export interface InvitePreview {
  group: { id: string; name: string; description: string | null; type: string };
  role: GroupRole;
  invitedBy: string | null;
  /** A equipe que vai receber o que a pessoa escolher compartilhar. */
  team: { name: string; role: GroupRole }[];
  memberCount: number;
  emailBound: boolean;
  expiresAt: Date;
}

export function hashInviteToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function novoToken(): string {
  return randomBytes(32).toString('base64url');
}

function view(i: {
  id: string;
  role: GroupRole;
  email: string | null;
  maxUses: number | null;
  uses: number;
  expiresAt: Date;
  createdAt: Date;
  lastSentAt: Date | null;
}): InviteView {
  return {
    id: i.id,
    role: i.role,
    email: i.email,
    maxUses: i.maxUses,
    uses: i.uses,
    expiresAt: i.expiresAt,
    createdAt: i.createdAt,
    lastSentAt: i.lastSentAt,
  };
}

/**
 * Convites da comunidade (Fase 5). O convite **é** a aprovação: quem aceita
 * entra `ACTIVE`, com o papel do convite — e é o único caminho, além da
 * aprovação do dono, para um papel de equipe.
 *
 * O token só existe no link; o banco guarda o sha256. Convite com e-mail é de
 * uso único e vale só para a conta com aquele e-mail; sem e-mail, é link
 * compartilhável (com limite de usos opcional).
 */
@Injectable()
export class InviteService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(InviteService.name);
  private purgeTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly memberships: MembershipService,
    private readonly email: EmailService,
    private readonly config: ConfigService,
    private readonly notifications: NotificationService,
  ) {}

  onModuleInit(): void {
    const run = () =>
      void this.purgeOldEmails(new Date()).catch((err: unknown) =>
        this.logger.warn(
          `Expurgo de e-mails de convite falhou: ${err instanceof Error ? err.message : String(err)}`,
        ),
      );
    run();
    // `unref`: o timer não segura o processo (nem o jest) só por existir.
    this.purgeTimer = setInterval(run, INVITE_EMAIL_PURGE_INTERVAL_MS);
    this.purgeTimer.unref();
  }

  onModuleDestroy(): void {
    if (this.purgeTimer) clearInterval(this.purgeTimer);
    this.purgeTimer = null;
  }

  async create(actorId: string, groupId: string, input: CreateInviteInput): Promise<CreatedInvite> {
    const eu = await this.assertCan(actorId, groupId, 'invite.create');
    if (eu.role === GroupRole.PROFESSIONAL && input.role !== GroupRole.MEMBER) {
      throw new ForbiddenException(
        'Profissionais convidam só membros; a equipe é o dono quem define',
      );
    }
    if ((input.role as GroupRole) === GroupRole.OWNER) {
      throw new ForbiddenException('Ninguém é convidado como dono');
    }

    const agora = new Date();
    await this.assertDailyRoom(groupId, 1, agora);
    await this.purgeOldEmails(agora);

    const email = input.email?.trim().toLowerCase() || null;
    const dias = Math.min(Math.max(input.expiresInDays ?? INVITE_DEFAULT_DAYS, 1), INVITE_MAX_DAYS);
    const token = novoToken();
    const invite = await this.prisma.groupInvite.create({
      data: {
        groupId,
        tokenHash: hashInviteToken(token),
        email,
        role: input.role,
        createdById: actorId,
        // Convite por e-mail é de uma pessoa só.
        maxUses: email ? 1 : (input.maxUses ?? null),
        expiresAt: new Date(agora.getTime() + dias * DAY_MS),
        lastSentAt: email ? agora : null,
      },
    });
    const url = this.url(token);
    const emailSent = email ? await this.enviar(invite, url, actorId) : false;
    return { invite: view(invite), url, emailSent };
  }

  /**
   * Convite em lote, por e-mail (Fase 6). Cada endereço vira um convite como o
   * de `create`; o que não dá para convidar volta em `skipped` com o motivo, em
   * vez de derrubar o lote. O teto do dia conta **o lote inteiro antes** de
   * criar qualquer um: estourou, nada é criado — meio lote enviado deixaria o
   * dono sem saber quem recebeu.
   */
  async createBatch(
    actorId: string,
    groupId: string,
    input: BatchInviteInput,
  ): Promise<BatchInviteResult> {
    const eu = await this.assertCan(actorId, groupId, 'invite.create');
    if (eu.role === GroupRole.PROFESSIONAL && input.role !== GroupRole.MEMBER) {
      throw new ForbiddenException(
        'Profissionais convidam só membros; a equipe é o dono quem define',
      );
    }
    if ((input.role as GroupRole) === GroupRole.OWNER) {
      throw new ForbiddenException('Ninguém é convidado como dono');
    }

    const skipped: BatchInviteResult['skipped'] = [];
    const vistos = new Set<string>();
    const candidatos: string[] = [];
    for (const bruto of input.emails) {
      const email = bruto.trim().toLowerCase();
      if (!EMAIL.test(email) || email.length > 254) skipped.push({ email, reason: 'invalid' });
      else if (vistos.has(email)) skipped.push({ email, reason: 'duplicate' });
      else {
        vistos.add(email);
        candidatos.push(email);
      }
    }

    const agora = new Date();
    const [dentro, abertos] = await Promise.all([
      this.prisma.groupMembership.findMany({
        where: {
          groupId,
          status: MembershipStatus.ACTIVE,
          user: { email: { in: candidatos, mode: 'insensitive' } },
        },
        select: { user: { select: { email: true } } },
      }),
      this.prisma.groupInvite.findMany({
        where: {
          groupId,
          email: { in: candidatos },
          revokedAt: null,
          expiresAt: { gt: agora },
        },
        select: { email: true, uses: true, maxUses: true },
      }),
    ]);
    const membros = new Set(dentro.map((m) => m.user.email.toLowerCase()));
    const pendentes = new Set(
      abertos.filter((c) => c.maxUses === null || c.uses < c.maxUses).map((c) => c.email),
    );
    const convidar: string[] = [];
    for (const email of candidatos) {
      if (membros.has(email)) skipped.push({ email, reason: 'member' });
      else if (pendentes.has(email)) skipped.push({ email, reason: 'pending_invite' });
      else convidar.push(email);
    }

    if (convidar.length > 0) await this.assertDailyRoom(groupId, convidar.length, agora);
    await this.purgeOldEmails(agora);

    const created: BatchInviteResult['created'] = [];
    for (const email of convidar) {
      const r = await this.create(actorId, groupId, {
        role: input.role,
        email,
        expiresInDays: input.expiresInDays,
      });
      created.push({ email, inviteId: r.invite.id, emailSent: r.emailSent });
    }
    return { created, skipped };
  }

  /**
   * Convites ainda utilizáveis. O profissional vê só os de membro: os de equipe
   * são do dono, e ele não os revoga nem reenvia.
   */
  async list(actorId: string, groupId: string): Promise<InviteView[]> {
    const eu = await this.assertCan(actorId, groupId, 'invite.create');
    const convites = await this.prisma.groupInvite.findMany({
      where: {
        groupId,
        revokedAt: null,
        expiresAt: { gt: new Date() },
        ...this.alcance(eu.role),
      },
      orderBy: { createdAt: 'desc' },
    });
    return convites.filter((c) => c.maxUses === null || c.uses < c.maxUses).map(view);
  }

  async revoke(actorId: string, groupId: string, inviteId: string): Promise<InviteView> {
    const eu = await this.assertCan(actorId, groupId, 'invite.revoke');
    const revogado = await this.prisma.groupInvite.updateMany({
      where: { id: inviteId, groupId, revokedAt: null, ...this.alcance(eu.role) },
      data: { revokedAt: new Date() },
    });
    if (revogado.count === 0) throw new NotFoundException(INVITE_NOT_FOUND);
    const convite = await this.prisma.groupInvite.findFirstOrThrow({
      where: { id: inviteId, groupId },
    });
    return view(convite);
  }

  /**
   * Reenvia o convite por e-mail. Como o token não fica guardado, reenviar
   * **troca** o token: o link do e-mail anterior deixa de valer.
   */
  async resend(actorId: string, groupId: string, inviteId: string): Promise<CreatedInvite> {
    const eu = await this.assertCan(actorId, groupId, 'invite.create');
    const agora = new Date();
    const convite = await this.prisma.groupInvite.findFirst({
      where: {
        id: inviteId,
        groupId,
        revokedAt: null,
        expiresAt: { gt: agora },
        ...this.alcance(eu.role),
      },
    });
    if (
      !convite ||
      !convite.email ||
      (convite.maxUses !== null && convite.uses >= convite.maxUses)
    ) {
      throw new NotFoundException(INVITE_NOT_FOUND);
    }
    if (
      convite.lastSentAt &&
      agora.getTime() - convite.lastSentAt.getTime() < RESEND_MIN_INTERVAL_MS
    ) {
      throw new HttpException('Espere alguns minutos para reenviar', HttpStatus.TOO_MANY_REQUESTS);
    }
    const token = novoToken();
    const atualizado = await this.prisma.groupInvite.update({
      where: { id: convite.id },
      data: { tokenHash: hashInviteToken(token), lastSentAt: agora },
    });
    const url = this.url(token);
    const emailSent = await this.enviar(atualizado, url, actorId);
    return { invite: view(atualizado), url, emailSent };
  }

  /** O cartão da comunidade para quem tem o link — logado ou não. */
  async preview(token: string): Promise<InvitePreview> {
    const convite = await this.valido(token);
    const [grupo, equipe, memberCount, autor] = await Promise.all([
      this.prisma.group.findUniqueOrThrow({
        where: { id: convite.groupId },
        select: { id: true, name: true, description: true, type: true },
      }),
      this.prisma.groupMembership.findMany({
        where: {
          groupId: convite.groupId,
          status: MembershipStatus.ACTIVE,
          role: { in: [...TEAM_ROLES] },
        },
        select: { role: true, user: { select: { name: true } } },
        orderBy: [{ role: 'asc' }, { createdAt: 'asc' }],
      }),
      this.prisma.groupMembership.count({
        where: { groupId: convite.groupId, status: MembershipStatus.ACTIVE },
      }),
      convite.createdById
        ? this.prisma.user.findUnique({
            where: { id: convite.createdById },
            select: { name: true },
          })
        : null,
    ]);
    return {
      group: grupo,
      role: convite.role,
      invitedBy: autor?.name ?? null,
      team: equipe.map((m) => ({ name: m.user.name, role: m.role })),
      memberCount,
      emailBound: convite.email !== null,
      expiresAt: convite.expiresAt,
    };
  }

  /**
   * Aceite: a pessoa entra `ACTIVE` com o papel do convite e o consentimento
   * que escolheu, tudo num commit — membership, vínculos e o uso do convite.
   */
  async accept(userId: string, token: string, consent: JoinConsent): Promise<MembershipResult> {
    const convite = await this.valido(token);
    if (convite.email) {
      const eu = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { email: true },
      });
      if (!eu || eu.email.toLowerCase() !== convite.email)
        throw new NotFoundException(INVITE_NOT_FOUND);
    }
    const existente = await this.prisma.groupMembership.findUnique({
      where: { groupId_userId: { groupId: convite.groupId, userId } },
      select: { status: true },
    });
    assertNotBanned(existente?.status);
    if (existente?.status === MembershipStatus.ACTIVE) {
      throw new ConflictException({
        message: 'Você já faz parte desta comunidade',
        groupId: convite.groupId,
      });
    }

    const agora = new Date();
    const ops = await this.memberships.activationOps({
      groupId: convite.groupId,
      userId,
      role: convite.role,
      consent,
      at: agora,
    });
    try {
      const [membership] = (await this.prisma.$transaction([
        ...ops,
        // `update` com filtro além do id: se outro aceite levou o último uso
        // entre a leitura e aqui, nada casa, o Prisma lança P2025 e o commit
        // inteiro volta — ninguém entra por um convite já esgotado.
        this.prisma.groupInvite.update({
          where: {
            id: convite.id,
            revokedAt: null,
            ...(convite.maxUses !== null ? { uses: { lt: convite.maxUses } } : {}),
          },
          data: { uses: { increment: 1 } },
        }),
      ])) as unknown as [GroupMembership, ...unknown[]];
      return {
        membershipId: membership.id,
        groupId: convite.groupId,
        status: membership.status,
        role: membership.role,
        revokedLinks: 0,
      };
    } catch (err) {
      if ((err as { code?: string })?.code === 'P2025')
        throw new NotFoundException(INVITE_NOT_FOUND);
      throw err;
    }
  }

  private async valido(token: string) {
    const convite = await this.prisma.groupInvite.findUnique({
      where: { tokenHash: hashInviteToken(token) },
    });
    if (
      !convite ||
      convite.revokedAt !== null ||
      convite.expiresAt.getTime() <= Date.now() ||
      (convite.maxUses !== null && convite.uses >= convite.maxUses)
    ) {
      throw new NotFoundException(INVITE_NOT_FOUND);
    }
    return convite;
  }

  /**
   * Associação ativa cujo papel a matriz (`sharing/permissions.ts`) deixa fazer
   * `action` — a mesma pergunta que o `GroupRoleGuard` faz na rota, de novo no
   * service. Não-membro recebe 404; membro sem o papel, 403.
   */
  private async assertCan(userId: string, groupId: string, action: GroupAction) {
    const eu = await this.prisma.groupMembership.findUnique({
      where: { groupId_userId: { groupId, userId } },
      select: { role: true, status: true },
    });
    if (!eu || eu.status !== MembershipStatus.ACTIVE) throw new NotFoundException(NOT_FOUND);
    if (!can(eu.role, action)) {
      throw new ForbiddenException('Seu papel nesta comunidade não permite cuidar de convites');
    }
    return eu;
  }

  /** Que convites a pessoa da equipe administra: o dono, todos; o profissional, os de membro. */
  private alcance(role: GroupRole): { role?: GroupRole } {
    return role === GroupRole.OWNER ? {} : { role: GroupRole.MEMBER };
  }

  /** Cabem mais `quantos` convites hoje nesta comunidade? Senão, 429 dizendo quantos cabem. */
  private async assertDailyRoom(groupId: string, quantos: number, agora: Date): Promise<void> {
    const doDia = await this.prisma.groupInvite.count({
      where: { groupId, createdAt: { gt: new Date(agora.getTime() - DAY_MS) } },
    });
    if (doDia + quantos > INVITE_MAX_PER_DAY) {
      const cabem = Math.max(0, INVITE_MAX_PER_DAY - doDia);
      throw new HttpException(
        quantos === 1 || cabem === 0
          ? `Limite de ${INVITE_MAX_PER_DAY} convites por dia nesta comunidade`
          : `Limite de ${INVITE_MAX_PER_DAY} convites por dia nesta comunidade: hoje cabem mais ${cabem}`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  private url(token: string): string {
    const origem = (this.config.get<string>('WEB_ORIGIN') ?? 'http://localhost:3030').replace(
      /\/$/,
      '',
    );
    return `${origem}/c/${token}`;
  }

  private async enviar(
    convite: { email: string | null; role: GroupRole; expiresAt: Date; groupId: string },
    url: string,
    actorId: string,
  ): Promise<boolean> {
    if (!convite.email) return false;
    const [grupo, autor] = await Promise.all([
      this.prisma.group.findUniqueOrThrow({
        where: { id: convite.groupId },
        select: { name: true },
      }),
      this.prisma.user.findUnique({ where: { id: actorId }, select: { name: true } }),
    ]);
    // Quem já tem conta com este e-mail recebe também no celular. O caminho é
    // o mesmo do link do e-mail: o convite só aceita a conta deste endereço.
    const convidada = await this.prisma.user.findFirst({
      where: { email: { equals: convite.email, mode: 'insensitive' } },
      select: { id: true },
    });
    if (convidada) {
      this.notifications.notify(
        [convidada.id],
        inviteNotice({
          groupName: grupo.name,
          inviterName: autor?.name ?? 'A equipe',
          token: new URL(url).pathname.replace(/^\/c\//, ''),
        }),
      );
    }
    return this.email.send(
      inviteEmail({
        to: convite.email,
        groupName: grupo.name,
        inviterName: autor?.name ?? 'A equipe',
        role: convite.role,
        url,
        expiresAt: convite.expiresAt,
      }),
    );
  }

  /**
   * Retenção (DATA_RETENTION.md): o e-mail de quem foi convidado some 30 dias
   * depois de o convite expirar ou esgotar. Roda de carona na criação, sem job.
   */
  /** Apaga o e-mail do convidado 30 dias depois de o convite vencer, ser revogado ou usado. */
  async purgeOldEmails(agora: Date): Promise<void> {
    const limite = new Date(agora.getTime() - INVITE_EMAIL_RETENTION_DAYS * DAY_MS);
    await this.prisma.groupInvite.updateMany({
      where: {
        email: { not: null },
        OR: [
          { expiresAt: { lt: limite } },
          { revokedAt: { lt: limite } },
          { uses: { gte: 1 }, maxUses: 1, createdAt: { lt: limite } },
        ],
      },
      data: { email: null },
    });
  }
}
