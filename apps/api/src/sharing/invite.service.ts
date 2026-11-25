import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, createHmac, randomBytes, randomUUID } from 'node:crypto';
import {
  GroupRole,
  InviteOrigin,
  JoinPolicy,
  JoinVia,
  MembershipStatus,
  type GroupMembership,
  type Prisma,
  type ShareScope,
} from '@fatia/db';
import { SeatPoolService } from '../billing/seat-pool.service';
import { PrismaService } from '../common/prisma.service';
import { MIN_CELL } from '../insights/aggregation.service';
import { dateInTz, dayBoundsInTz } from '../progress/helpers/date-tz';
import { EmailService } from '../notifications/email.service';
import { inviteEmail } from '../notifications/invite-email';
import { NotificationService } from '../notifications/notification.service';
import { inviteNotice } from './community-notices';
import { assertJoinMeetsRequiredScopes } from './consent-scopes';
import { newEntryCode } from './entry-code';
import {
  activationPendingWhere,
  inviteReachWhere,
  inviteKind,
  inviteStatus,
  notExpiredWhere,
  type InviteKind,
  type InviteStatus,
} from './invite-state';
import {
  assertAllowedInDemo,
  can,
  type GroupAction,
  rolesGrantableBy,
  TEAM_ROLES,
} from './permissions';
import { MediaService } from '../storage/media.service';
import { welcomeForJoin, type WelcomePageView } from './welcome.service';
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
/** Convite nominal por e-mail: vence em 30 dias e vale uma vez (#401). */
export const INVITE_EMAIL_DAYS = 30;
/** Quantas vezes o mesmo convite sai por e-mail, somando criação, reenvios e convite novo. */
export const INVITE_MAX_SENDS = 5;
/** Quem não aceitou em 2 dias entra na Ativação pendente (#401). */
/** Ativou = primeiro treino em até 48 h depois de entrar. */
export const ACTIVATION_WINDOW_MS = 48 * 60 * 60 * 1000;
export const PENDING_PAGE_SIZE = 10;
export const RESEND_BATCH_MAX = 50;
const LABEL_MAX = 60;
/** Segredo do link copiável: abaixo disto, o link só aparece na criação. */
const LINK_SECRET_MIN = 16;
const RESEND_MIN_INTERVAL_MS = 10 * 60 * 1000;
/** O link do WhatsApp volta igual por este tempo (não invalida o que acabou de sair). */
const FRESH_LINK_REUSE_MS = 10 * 60 * 1000;
/** Janela do teto de envios por e-mail e do bloqueio depois da recusa. */
const EMAIL_WINDOW_DAYS = 30;
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
  /**
   * Gera um código de entrada legível (#393) em vez de link: reutilizável,
   * revogável e sujeito à `joinPolicy`. Só de membro, sem e-mail.
   */
  code?: boolean;
  /** Nome do link que só a equipe vê (#401). */
  label?: string;
  origin?: InviteOrigin;
  /** "Sem prazo": só link (ou QR). E-mail vence em 30 dias. */
  noExpiry?: boolean;
  /** Quem entra já fica acompanhado por este profissional (membership id). */
  accompaniedByMembershipId?: string | null;
  /** Quem entra ganha assento PRO, se houver vaga. Só o dono. */
  giveSeat?: boolean;
}

/** O código da recepção vale mais que o link: fica num cartaz. */
export const ENTRY_CODE_DEFAULT_DAYS = 365;

export interface InviteView {
  id: string;
  /** Código de entrada legível, quando o convite é um código (#393). */
  code: string | null;
  role: GroupRole;
  email: string | null;
  maxUses: number | null;
  uses: number;
  /** Nulo = sem prazo (só link, #401). */
  expiresAt: Date | null;
  createdAt: Date;
  lastSentAt: Date | null;
  label: string | null;
  origin: InviteOrigin | null;
  sendCount: number;
  acceptedAt: Date | null;
  declinedAt: Date | null;
  revokedAt: Date | null;
  giveSeat: boolean;
  accompaniedById: string | null;
  kind: InviteKind;
  status: InviteStatus;
}

/** Linha da tela Convites (Pn-06): o convite, o link (quando dá) e os números dele. */
export interface InviteOverviewRow extends InviteView {
  /** O link de novo, para Copiar: só link ativo com o segredo configurado, ou código. */
  url: string | null;
  accompaniedByName: string | null;
  /** Quantos entraram por ele. Nulo = entre 1 e 4 (menos de 5 não aparece). */
  joined: number | null;
}

export interface InviteOverview {
  cards: {
    activeLinks: number;
    /** Convites por e-mail sem aceite, últimos 30 dias. Nulo = entre 1 e 4. */
    notAccepted: number | null;
    /** Quem entrou por convite nos últimos 30 dias. Nulo = entre 1 e 4. */
    joinedLast30Days: number | null;
    /**
     * Só o percentual (nunca com o número): de quem entrou nos últimos 30 dias e
     * já passou das 48 h, com opt-in — a mesma população do "Entraram e sem 1º
     * registro" da Ativação pendente. Nulo = algum lado com menos de 5.
     */
    activated48h: { percent: number } | null;
  };
  invites: InviteOverviewRow[];
}

export type PendingInviteStatus = 'pending' | 'expired' | 'declined';

export interface PendingInviteItem {
  id: string;
  email: string;
  role: GroupRole;
  origin: InviteOrigin | null;
  label: string | null;
  invitedAt: Date;
  lastSentAt: Date | null;
  expiresAt: Date | null;
  status: PendingInviteStatus;
  sendCount: number;
  canResend: boolean;
  canRenew: boolean;
}

/** Ativação pendente (Pn-22): os cartões, os filtros e uma página da lista. */
export interface PendingActivation {
  cards: {
    notAccepted: number | null;
    /** Entraram e não treinaram em 48 h: só o número, só com 5 ou mais de cada lado. */
    joinedNoFirstLog: number | null;
    acceptedThisMonth: { accepted: number; total: number } | null;
  };
  origins: { origin: InviteOrigin | null; count: number }[];
  total: number;
  page: number;
  pageSize: number;
  items: PendingInviteItem[];
}

export interface PendingQuery {
  origin?: InviteOrigin | 'NONE';
  q?: string;
  page?: number;
}

export type ResendSkipReason = 'not_found' | 'expired' | 'limit' | 'too_soon';

export interface ResendManyResult {
  sent: { id: string; emailSent: boolean }[];
  skipped: { id: string; reason: ResendSkipReason }[];
}

export interface CreatedInvite {
  invite: InviteView;
  /** O link aparece só aqui: o banco guarda o hash do token. */
  url: string;
  emailSent: boolean;
}

export type BatchSkipReason =
  'invalid' | 'duplicate' | 'member' | 'pending_invite' | 'declined' | 'limit';

export interface BatchInviteInput {
  role: InvitableRole;
  emails: string[];
  expiresInDays?: number;
  accompaniedByMembershipId?: string | null;
  giveSeat?: boolean;
}

export interface BatchInviteResult {
  created: { email: string; inviteId: string; emailSent: boolean }[];
  skipped: { email: string; reason: BatchSkipReason }[];
}

/** O mesmo formato que o `@IsEmail` do DTO aceita, sem a dependência no service. */
const EMAIL = /^[^\s@,;<>"]+@[^\s@,;<>"]+\.[^\s@,;<>"]+$/;

export interface InvitePreview {
  group: {
    id: string;
    name: string;
    description: string | null;
    type: string;
    /** O avatar da comunidade, para a capa das boas-vindas (Onb-02b). Nulo = iniciais. */
    avatarUrl: string | null;
    /** A cor da comunidade (#413) para o topo e o botão do convite. Nula = padrão. */
    brandColor: string | null;
    /** A capa da comunidade (#413). Nula = a faixa na cor. */
    coverUrl: string | null;
  };
  role: GroupRole;
  invitedBy: string | null;
  /** A equipe que vai receber o que a pessoa escolher compartilhar. */
  team: { name: string; role: GroupRole }[];
  memberCount: number;
  emailBound: boolean;
  /** Nulo = sem prazo. */
  expiresAt: Date | null;
  /**
   * O que é obrigatório compartilhar para entrar **por este convite**: vazio
   * quando o convite é de equipe, que não deve a exigência (`consent-scopes.ts`).
   */
  requiredSharingScopes: ShareScope[];
  /**
   * O desafio em andamento, para as boas-vindas (prancha Onb-02, #371): título
   * e quantos participam. Nada sobre quem participa.
   */
  activeChallenge: { title: string; participants: number } | null;
  /**
   * As páginas de boas-vindas da comunidade (#410, Onb-02b), entre as
   * boas-vindas do Fatia e o que compartilhar. Vazio = só o padrão do Fatia.
   */
  welcome: WelcomePageView[];
}

function cleanLabel(label: string | undefined): string | null {
  const l = label?.trim().replace(/\s+/g, ' ').slice(0, LABEL_MAX);
  return l ? l : null;
}

export function hashInviteToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function newToken(): string {
  return randomBytes(32).toString('base64url');
}

/** Contagem com o limiar: 0 sai como 0, de 1 a 4 não sai (MIN_CELL). */
function cell(n: number): number | null {
  return n === 0 || n >= MIN_CELL ? n : null;
}

/** Indicador de dois lados (ativou / não ativou): os dois com 5 ou mais. */
function split(yes: number, total: number): { value: number; percent: number } | null {
  const no = total - yes;
  if (yes < MIN_CELL || no < MIN_CELL) return null;
  return { value: yes, percent: Math.round((yes / total) * 100) };
}

type InviteRow = {
  id: string;
  code: string | null;
  role: GroupRole;
  email: string | null;
  maxUses: number | null;
  uses: number;
  expiresAt: Date | null;
  createdAt: Date;
  lastSentAt: Date | null;
  label: string | null;
  origin: InviteOrigin | null;
  sendCount: number;
  acceptedAt: Date | null;
  declinedAt: Date | null;
  revokedAt: Date | null;
  giveSeat: boolean;
  accompaniedById: string | null;
};

function view(i: InviteRow, now: Date = new Date()): InviteView {
  return {
    id: i.id,
    code: i.code,
    role: i.role,
    email: i.email,
    maxUses: i.maxUses,
    uses: i.uses,
    expiresAt: i.expiresAt,
    createdAt: i.createdAt,
    lastSentAt: i.lastSentAt,
    label: i.label,
    origin: i.origin,
    sendCount: i.sendCount,
    acceptedAt: i.acceptedAt,
    declinedAt: i.declinedAt,
    revokedAt: i.revokedAt,
    giveSeat: i.giveSeat,
    accompaniedById: i.accompaniedById,
    kind: inviteKind(i),
    status: inviteStatus(i, now),
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
    // Opcional: sem o módulo de cobrança, "Dar assento" no convite só não acontece.
    @Optional() private readonly seats?: SeatPoolService,
    // Opcional: sem o storage, a capa das boas-vindas mostra as iniciais e o
    // convite sai sem a capa (#413).
    @Optional() private readonly media?: MediaService,
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
    if (input.code && (input.accompaniedByMembershipId || input.giveSeat || input.noExpiry)) {
      // O código não guarda acompanhante nem assento, e vale até 1 ano: aceitar
      // e ignorar enganaria quem criou.
      throw new BadRequestException(
        'O código de entrada não leva acompanhante, assento nem "sem prazo": use um link com origem',
      );
    }
    const eu = await this.assertCanCreate(actorId, groupId, input);
    const acompanhante = await this.resolveAccompanier(
      actorId,
      eu.role,
      groupId,
      input.accompaniedByMembershipId,
    );
    if (input.code) return this.createEntryCode(actorId, groupId, input);

    const email = input.email?.trim().toLowerCase() || null;
    if (email && input.noExpiry) {
      throw new BadRequestException(
        'Convite por e-mail vence em 30 dias: "sem prazo" é só para link ou QR',
      );
    }
    if (input.role !== GroupRole.MEMBER) {
      // Convite de equipe dá permissão de equipe: sempre com prazo (até 30
      // dias) e com limite de usos (o de e-mail já vale uma vez).
      if (input.noExpiry) {
        throw new BadRequestException('Convite de equipe vence em até 30 dias: não fica sem prazo');
      }
      if (!email && !input.maxUses) {
        throw new BadRequestException('Convite de equipe precisa de limite de usos');
      }
    }
    const agora = new Date();
    if (email) {
      const [bloqueio] = (await this.emailBlocks(groupId, [email], agora)).values();
      if (bloqueio) throw this.emailBlockError(bloqueio);
    }
    await this.assertDailyRoom(groupId, 1, agora);
    await this.purgeOldEmails(agora);

    // O convite por e-mail vale sempre 30 dias; o link, o que a equipe escolher (até 30).
    const dias = email
      ? INVITE_EMAIL_DAYS
      : Math.min(Math.max(input.expiresInDays ?? INVITE_DEFAULT_DAYS, 1), INVITE_MAX_DAYS);
    const id = randomUUID();
    // Link sem e-mail: o token deriva do id com o segredo, e a equipe copia de
    // novo depois. Convite nominal: token aleatório, que só vai no e-mail.
    const token = (email ? null : this.linkToken(id)) ?? newToken();
    const invite = await this.prisma.groupInvite.create({
      data: {
        id,
        groupId,
        tokenHash: hashInviteToken(token),
        email,
        role: input.role,
        createdById: actorId,
        // Convite por e-mail é de uma pessoa só.
        maxUses: email ? 1 : (input.maxUses ?? null),
        expiresAt: input.noExpiry ? null : new Date(agora.getTime() + dias * DAY_MS),
        lastSentAt: email ? agora : null,
        sendCount: email ? 1 : 0,
        label: cleanLabel(input.label),
        origin: input.origin ?? (email ? InviteOrigin.EMAIL_LIST : null),
        accompaniedById: acompanhante,
        giveSeat: input.giveSeat === true,
      },
    });
    const url = this.url(token);
    const emailSent = email ? await this.sendInviteEmail(invite, url, actorId) : false;
    return { invite: view(invite, agora), url, emailSent };
  }

  /**
   * Código de entrada legível (#393): o que vai no QR da recepção. Não é
   * aprovação — quem entra por ele segue a `joinPolicy` —, por isso só existe
   * para membro e não em comunidade só por convite. O token aleatório do
   * convite nunca sai daqui: o código não abre o caminho do link.
   */
  private async createEntryCode(
    actorId: string,
    groupId: string,
    input: CreateInviteInput,
  ): Promise<CreatedInvite> {
    if (input.role !== GroupRole.MEMBER || input.email) {
      throw new ConflictException('O código de entrada é só para membros, sem e-mail');
    }
    const { joinPolicy } = await this.prisma.group.findUniqueOrThrow({
      where: { id: groupId },
      select: { joinPolicy: true },
    });
    if (joinPolicy === JoinPolicy.INVITE_ONLY) {
      throw new ConflictException(
        'Comunidade só por convite não usa código: mande convites ou mude a forma de entrada',
      );
    }
    const agora = new Date();
    await this.assertDailyRoom(groupId, 1, agora);
    const dias = Math.min(
      Math.max(input.expiresInDays ?? ENTRY_CODE_DEFAULT_DAYS, 1),
      ENTRY_CODE_DEFAULT_DAYS,
    );
    // Colisão é rara (31^8), mas o unique decide: tenta de novo com outro.
    for (let tentativa = 0; ; tentativa += 1) {
      const code = newEntryCode();
      try {
        const invite = await this.prisma.groupInvite.create({
          data: {
            groupId,
            tokenHash: hashInviteToken(newToken()),
            code,
            role: GroupRole.MEMBER,
            createdById: actorId,
            maxUses: input.maxUses ?? null,
            expiresAt: new Date(agora.getTime() + dias * DAY_MS),
            label: cleanLabel(input.label),
            origin: input.origin ?? InviteOrigin.QR,
          },
        });
        return { invite: view(invite, agora), url: this.codeUrl(code), emailSent: false };
      } catch (err) {
        if ((err as { code?: string })?.code !== 'P2002' || tentativa >= 4) throw err;
      }
    }
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
    const eu = await this.assertCanCreate(actorId, groupId, input);
    await this.resolveAccompanier(actorId, eu.role, groupId, input.accompaniedByMembershipId);

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
    const [dentro, bloqueios] = await Promise.all([
      this.prisma.groupMembership.findMany({
        where: {
          groupId,
          status: MembershipStatus.ACTIVE,
          user: { email: { in: candidatos, mode: 'insensitive' } },
        },
        select: { user: { select: { email: true } } },
      }),
      this.emailBlocks(groupId, candidatos, agora),
    ]);
    const membros = new Set(dentro.map((m) => m.user.email.toLowerCase()));
    const convidar: string[] = [];
    for (const email of candidatos) {
      const bloqueio = bloqueios.get(email);
      if (membros.has(email)) skipped.push({ email, reason: 'member' });
      else if (bloqueio) skipped.push({ email, reason: bloqueio });
      else convidar.push(email);
    }

    if (convidar.length > 0) await this.assertDailyRoom(groupId, convidar.length, agora);
    await this.purgeOldEmails(agora);

    const created: BatchInviteResult['created'] = [];
    for (const email of convidar) {
      const r = await this.create(actorId, groupId, {
        role: input.role,
        email,
        origin: InviteOrigin.EMAIL_LIST,
        accompaniedByMembershipId: input.accompaniedByMembershipId,
        giveSeat: input.giveSeat,
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
    const agora = new Date();
    const convites = await this.prisma.groupInvite.findMany({
      where: {
        groupId,
        revokedAt: null,
        declinedAt: null,
        ...notExpiredWhere(agora),
        ...this.inviteReach(eu.role),
      },
      orderBy: { createdAt: 'desc' },
    });
    return convites
      .filter((c) => c.maxUses === null || c.uses < c.maxUses)
      .map((c) => view(c, agora));
  }

  /**
   * A tela Convites (Pn-06): os que valem e os que pararam de valer nos
   * últimos 30 dias (revogado, expirado, usado, recusado aparecem inativos),
   * com quantos entraram e ativaram por cada um — só com 5 ou mais.
   */
  async overview(
    actorId: string,
    groupId: string,
    now: Date = new Date(),
  ): Promise<InviteOverview> {
    const eu = await this.assertCan(actorId, groupId, 'invite.create');
    const desde = new Date(now.getTime() - 30 * DAY_MS);
    const linhas = await this.prisma.groupInvite.findMany({
      where: {
        groupId,
        ...this.inviteReach(eu.role),
        OR: [
          { AND: [{ revokedAt: null, declinedAt: null }, notExpiredWhere(now)] },
          { createdAt: { gte: desde } },
        ],
      },
      include: { accompaniedBy: { select: { user: { select: { name: true } } } } },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });

    // Quem entrou por cada convite: só a contagem, sem nome de ninguém. A
    // ativação não sai por convite: a diferença entre linhas e o cartão
    // isolaria quem entrou por um convite pequeno (revisão #401).
    const entradas = await this.prisma.groupMembership.findMany({
      where: { groupId, joinedViaInviteId: { not: null }, joinedAt: { not: null } },
      select: { joinedViaInviteId: true, joinedAt: true },
    });
    const porConvite = new Map<string, number>();
    for (const e of entradas) {
      porConvite.set(e.joinedViaInviteId!, (porConvite.get(e.joinedViaInviteId!) ?? 0) + 1);
    }

    const invites: InviteOverviewRow[] = linhas.map((l) => {
      const v = view(l, now);
      return {
        ...v,
        url: this.copyUrl(l, v.status),
        accompaniedByName: l.accompaniedBy?.user.name ?? null,
        joined: cell(porConvite.get(l.id) ?? 0),
      };
    });

    const recentes = entradas.filter((e) => e.joinedAt! >= desde);
    const [semAceite, coorte] = await Promise.all([
      this.prisma.groupInvite.count({
        where: { ...this.waitingWhere(groupId, eu.role), createdAt: { gte: desde } },
      }),
      this.activationCohort(groupId, now),
    ]);
    const ativados = split(coorte.activated, coorte.total);
    return {
      cards: {
        activeLinks: invites.filter((i) => i.kind !== 'email' && i.status === 'active').length,
        notAccepted: cell(semAceite),
        joinedLast30Days: cell(recentes.length),
        activated48h: ativados ? { percent: ativados.percent } : null,
      },
      invites,
    };
  }

  /**
   * Ativação pendente (Pn-22): convites por e-mail sem aceite há 2 dias ou
   * mais, inclusive os que venceram (para "Enviar convite novo") e os
   * recusados. A lista nominal fica para a equipe (quem foi convidado ainda não
   * é membro); só os totais pequenos somem.
   */
  async pending(
    actorId: string,
    groupId: string,
    query: PendingQuery,
    now: Date = new Date(),
  ): Promise<PendingActivation> {
    const eu = await this.assertCan(actorId, groupId, 'invite.create');
    const base: Prisma.GroupInviteWhereInput = activationPendingWhere(groupId, eu.role, now, {
      includeDeclined: true,
    });
    const q = query.q?.trim().toLowerCase();
    const where: Prisma.GroupInviteWhereInput = {
      AND: [
        base,
        query.origin ? { origin: query.origin === 'NONE' ? null : query.origin } : {},
        q ? { email: { contains: q, mode: 'insensitive' } } : {},
      ],
    };
    const page = Math.max(1, Math.floor(query.page ?? 1));
    const desde = new Date(now.getTime() - 30 * DAY_MS);
    const { timezone } = await this.prisma.group.findUniqueOrThrow({
      where: { id: groupId },
      select: { timezone: true },
    });
    const hoje = dateInTz(now, timezone);
    const inicioDoMes = dayBoundsInTz(`${hoje.slice(0, 8)}01`, timezone).start;

    const [total, linhas, origens, semAceite, doMes, aceitosDoMes, coorte] = await Promise.all([
      this.prisma.groupInvite.count({ where }),
      this.prisma.groupInvite.findMany({
        where,
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        skip: (page - 1) * PENDING_PAGE_SIZE,
        take: PENDING_PAGE_SIZE,
      }),
      this.prisma.groupInvite.groupBy({ by: ['origin'], where: base, _count: { _all: true } }),
      this.prisma.groupInvite.count({
        where: { ...this.waitingWhere(groupId, eu.role), createdAt: { gte: desde } },
      }),
      this.prisma.groupInvite.count({ where: this.nominalSince(groupId, eu.role, inicioDoMes) }),
      this.prisma.groupInvite.count({
        where: {
          AND: [
            this.nominalSince(groupId, eu.role, inicioDoMes),
            { OR: [{ acceptedAt: { not: null } }, { uses: { gte: 1 } }] },
          ],
        },
      }),
      this.activationCohort(groupId, now),
    ]);
    const semRegistro = coorte.total - coorte.activated;

    return {
      cards: {
        notAccepted: cell(semAceite),
        joinedNoFirstLog:
          semRegistro < MIN_CELL || coorte.activated < MIN_CELL ? null : semRegistro,
        acceptedThisMonth:
          doMes === 0 || doMes >= MIN_CELL ? { accepted: aceitosDoMes, total: doMes } : null,
      },
      origins: origens
        .map((o) => ({ origin: o.origin, count: o._count._all }))
        .sort((a, b) => b.count - a.count),
      total,
      page,
      pageSize: PENDING_PAGE_SIZE,
      items: linhas.map((l) => {
        const st = inviteStatus(l, now);
        const status: PendingInviteStatus =
          st === 'declined' ? 'declined' : st === 'expired' ? 'expired' : 'pending';
        const cabe = l.sendCount < INVITE_MAX_SENDS;
        return {
          id: l.id,
          email: l.email!,
          role: l.role,
          origin: l.origin,
          label: l.label,
          invitedAt: l.createdAt,
          lastSentAt: l.lastSentAt,
          expiresAt: l.expiresAt,
          status,
          sendCount: l.sendCount,
          canResend: status === 'pending' && cabe,
          canRenew: status === 'expired' && cabe,
        };
      }),
    };
  }

  async revoke(actorId: string, groupId: string, inviteId: string): Promise<InviteView> {
    const eu = await this.assertCan(actorId, groupId, 'invite.revoke');
    const revogado = await this.prisma.groupInvite.updateMany({
      where: { id: inviteId, groupId, revokedAt: null, ...this.inviteReach(eu.role) },
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
      where: { id: inviteId, groupId, ...this.inviteReach(eu.role) },
    });
    const motivo = this.resendBlock(convite, agora);
    if (motivo === 'not_found' || motivo === 'expired')
      throw new NotFoundException(INVITE_NOT_FOUND);
    if (motivo === 'limit') throw this.limitError();
    if (motivo === 'too_soon') throw this.tooSoonError();
    if (await this.emailCapReached(groupId, convite!.email!, agora)) throw this.emailCapError();
    // A checagem acima é para a mensagem; quem decide é o update condicional.
    const r = await this.sendAgain(convite!, actorId, agora);
    if (!r) throw this.tooSoonError();
    return r;
  }

  /**
   * Reenviar em lote (Pn-22, "Reenviar selecionados"). Cada id é amarrado à
   * comunidade da URL e ao alcance do papel; o que não dá volta em `skipped`
   * com o motivo, sem derrubar o resto.
   */
  async resendMany(actorId: string, groupId: string, ids: string[]): Promise<ResendManyResult> {
    const eu = await this.assertCan(actorId, groupId, 'invite.create');
    const unicos = [...new Set(ids)];
    if (unicos.length > RESEND_BATCH_MAX) {
      throw new BadRequestException(`No máximo ${RESEND_BATCH_MAX} convites por vez`);
    }
    const agora = new Date();
    const achados = await this.prisma.groupInvite.findMany({
      where: { id: { in: unicos }, groupId, ...this.inviteReach(eu.role) },
    });
    const porId = new Map(achados.map((c) => [c.id, c]));
    const result: ResendManyResult = { sent: [], skipped: [] };
    for (const id of unicos) {
      const convite = porId.get(id) ?? null;
      const motivo = this.resendBlock(convite, agora);
      if (motivo) {
        result.skipped.push({ id, reason: motivo });
        continue;
      }
      if (await this.emailCapReached(groupId, convite!.email!, agora)) {
        result.skipped.push({ id, reason: 'limit' });
        continue;
      }
      const r = await this.sendAgain(convite!, actorId, agora);
      if (r) result.sent.push({ id, emailSent: r.emailSent });
      else result.skipped.push({ id, reason: 'too_soon' });
    }
    return result;
  }

  /**
   * "Enviar convite novo" (Pn-22) para o convite por e-mail que venceu sem
   * aceite: mais 30 dias, link novo, e-mail de novo. Conta no teto de envios.
   */
  async renew(actorId: string, groupId: string, inviteId: string): Promise<CreatedInvite> {
    const eu = await this.assertCan(actorId, groupId, 'invite.create');
    const agora = new Date();
    const convite = await this.prisma.groupInvite.findFirst({
      where: {
        id: inviteId,
        groupId,
        ...this.inviteReach(eu.role),
        email: { not: null },
        code: null,
        uses: 0,
        acceptedAt: null,
        revokedAt: null,
        declinedAt: null,
      },
    });
    if (!convite) throw new NotFoundException(INVITE_NOT_FOUND);
    if (inviteStatus(convite, agora) !== 'expired') {
      throw new ConflictException('Este convite ainda vale: use Reenviar');
    }
    if (convite.sendCount >= INVITE_MAX_SENDS) throw this.limitError();
    if (await this.emailCapReached(groupId, convite.email!, agora)) throw this.emailCapError();
    const token = newToken();
    // Condicional: dois "Renovar" ao mesmo tempo, só um casa (o outro já vê o prazo novo).
    const { count } = await this.prisma.groupInvite.updateMany({
      where: {
        id: convite.id,
        uses: 0,
        acceptedAt: null,
        revokedAt: null,
        declinedAt: null,
        expiresAt: { lte: agora },
        sendCount: { lt: INVITE_MAX_SENDS },
      },
      data: {
        tokenHash: hashInviteToken(token),
        expiresAt: new Date(agora.getTime() + INVITE_EMAIL_DAYS * DAY_MS),
        lastSentAt: agora,
        sendCount: { increment: 1 },
        linkIssuedAt: null,
      },
    });
    if (count !== 1) throw new ConflictException('Este convite acabou de ser renovado');
    const atualizado = await this.prisma.groupInvite.findUniqueOrThrow({
      where: { id: convite.id },
    });
    const url = this.url(token);
    const emailSent = await this.sendInviteEmail(atualizado, url, actorId);
    return { invite: view(atualizado, agora), url, emailSent };
  }

  /**
   * Link novo do convite por e-mail, sem mandar e-mail (Pn-22, "WhatsApp"): a
   * equipe manda pela conversa. Troca o token, então o link do e-mail
   * anterior deixa de valer. Continua sendo só daquela conta.
   */
  async freshLink(
    actorId: string,
    groupId: string,
    inviteId: string,
  ): Promise<{ url: string; reused: boolean }> {
    const eu = await this.assertCan(actorId, groupId, 'invite.create');
    const agora = new Date();
    const convite = await this.prisma.groupInvite.findFirst({
      where: {
        id: inviteId,
        groupId,
        ...this.inviteReach(eu.role),
        email: { not: null },
        code: null,
      },
    });
    if (!convite) throw new NotFoundException(INVITE_NOT_FOUND);
    if (inviteStatus(convite, agora) !== 'active') {
      throw new ConflictException('Este convite não vale mais: envie um convite novo');
    }
    // Saiu um link nos últimos 10 minutos: o mesmo de novo, sem invalidar o
    // que a equipe acabou de mandar. Só dá com o segredo (o token deriva da data).
    if (
      convite.linkIssuedAt &&
      agora.getTime() - convite.linkIssuedAt.getTime() < FRESH_LINK_REUSE_MS
    ) {
      const token = this.nominalLinkToken(convite.id, convite.linkIssuedAt);
      if (token && hashInviteToken(token) === convite.tokenHash) {
        return { url: this.url(token), reused: true };
      }
    }
    const token = this.nominalLinkToken(convite.id, agora) ?? newToken();
    const { count } = await this.prisma.groupInvite.updateMany({
      where: { id: convite.id, tokenHash: convite.tokenHash },
      data: { tokenHash: hashInviteToken(token), linkIssuedAt: agora },
    });
    if (count !== 1) {
      // Outro pedido trocou o link no meio do caminho: devolve o dele.
      return this.freshLink(actorId, groupId, inviteId);
    }
    return { url: this.url(token), reused: false };
  }

  /**
   * A pessoa convidada recusa (#401; a tela é a Onb-E1, #372). Só o convite
   * nominal se recusa, e só pela conta daquele e-mail: link de vários usos não
   * é de ninguém. Depois disso o convite não vale mais.
   */
  async decline(userId: string, token: string): Promise<{ declined: true }> {
    const convite = await this.valido(token);
    if (!convite.email) throw new NotFoundException(INVITE_NOT_FOUND);
    const eu = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true },
    });
    if (!eu || eu.email.toLowerCase() !== convite.email) {
      throw new NotFoundException(INVITE_NOT_FOUND);
    }
    await this.prisma.groupInvite.updateMany({
      where: { id: convite.id, declinedAt: null, uses: 0 },
      data: { declinedAt: new Date() },
    });
    return { declined: true };
  }

  /** O cartão da comunidade para quem tem o link — logado ou não. */
  async preview(token: string): Promise<InvitePreview> {
    const convite = await this.valido(token);
    const now = new Date();
    const [grupo, equipe, memberCount, autor, desafio, welcome] = await Promise.all([
      this.prisma.group.findUniqueOrThrow({
        where: { id: convite.groupId },
        select: {
          id: true,
          name: true,
          description: true,
          type: true,
          requiredSharingScopes: true,
          avatarFile: true,
          brandColor: true,
          coverFile: true,
        },
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
      this.prisma.groupChallenge.findFirst({
        where: {
          groupId: convite.groupId,
          startsAt: { lte: now },
          endsAt: { gt: now },
          endedEarlyAt: null,
        },
        orderBy: { startsAt: 'desc' },
        select: { title: true, _count: { select: { participants: true } } },
      }),
      welcomeForJoin(this.prisma, convite.groupId),
    ]);
    const { requiredSharingScopes, avatarFile, coverFile, ...rest } = grupo;
    const [avatar, cover] = this.media
      ? await Promise.all([this.media.viewOrNull(avatarFile), this.media.viewOrNull(coverFile)])
      : [null, null];
    return {
      group: { ...rest, avatarUrl: avatar?.url ?? null, coverUrl: cover?.url ?? null },
      role: convite.role,
      invitedBy: autor?.name ?? null,
      team: equipe.map((m) => ({ name: m.user.name, role: m.role })),
      memberCount,
      emailBound: convite.email !== null,
      expiresAt: convite.expiresAt,
      requiredSharingScopes: convite.role === GroupRole.MEMBER ? requiredSharingScopes : [],
      activeChallenge: desafio
        ? { title: desafio.title, participants: desafio._count.participants }
        : null,
      welcome,
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
    const { requiredSharingScopes } = await this.prisma.group.findUniqueOrThrow({
      where: { id: convite.groupId },
      select: { requiredSharingScopes: true },
    });
    assertJoinMeetsRequiredScopes(convite.role, requiredSharingScopes, consent.scopes);

    const agora = new Date();
    // O responsável escolhido no convite só vale se ainda está na equipe.
    const acompanhante =
      convite.role === GroupRole.MEMBER && convite.accompaniedById
        ? await this.prisma.groupMembership.findFirst({
            where: {
              id: convite.accompaniedById,
              groupId: convite.groupId,
              status: MembershipStatus.ACTIVE,
              role: { in: [GroupRole.PROFESSIONAL, GroupRole.OWNER] },
            },
            select: { id: true },
          })
        : null;
    const ops = await this.memberships.activationOps({
      groupId: convite.groupId,
      userId,
      role: convite.role,
      consent,
      at: agora,
      via: JoinVia.INVITE,
      viaInviteId: convite.id,
      accompaniedById: acompanhante?.id ?? null,
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
            declinedAt: null,
            ...(convite.maxUses !== null ? { uses: { lt: convite.maxUses } } : {}),
          },
          data: {
            uses: { increment: 1 },
            ...(convite.email ? { acceptedById: userId, acceptedAt: agora } : {}),
          },
        }),
      ])) as unknown as [GroupMembership, ...unknown[]];
      if (convite.giveSeat && convite.role === GroupRole.MEMBER && this.seats) {
        // A pessoa já entrou: o assento que falha vira log, não erro do aceite
        // (o dono dá depois pela tela de Assentos).
        try {
          await this.seats.assignOnJoin(convite.groupId, membership.id, convite.createdById);
        } catch (err) {
          this.logger.warn(
            `Assento no aceite falhou (${convite.groupId}): ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }
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
    const found = await this.prisma.groupInvite.findUnique({
      where: { tokenHash: hashInviteToken(token) },
      include: { group: { select: { isDemo: true } } },
    });
    // Convite da demo (#412) é como convite que não existe: ela não recebe ninguém.
    if (!found || found.group.isDemo || inviteStatus(found) !== 'active') {
      throw new NotFoundException(INVITE_NOT_FOUND);
    }
    const { group: _group, ...convite } = found;
    void _group;
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
      select: { role: true, status: true, group: { select: { isDemo: true } } },
    });
    if (!eu || eu.status !== MembershipStatus.ACTIVE) throw new NotFoundException(NOT_FOUND);
    if (!can(eu.role, action)) {
      throw new ForbiddenException('Seu papel nesta comunidade não permite cuidar de convites');
    }
    assertAllowedInDemo(eu.group.isDemo, action);
    return { role: eu.role, status: eu.status };
  }

  /** Quem cria convite: a matriz, mais o que só o dono faz (papel de equipe, assento). */
  private async assertCanCreate(
    actorId: string,
    groupId: string,
    input: { role: InvitableRole; giveSeat?: boolean; accompaniedByMembershipId?: string | null },
  ) {
    const eu = await this.assertCan(actorId, groupId, 'invite.create');
    if ((input.role as GroupRole) === GroupRole.OWNER) {
      throw new ForbiddenException('Ninguém é convidado como dono');
    }
    // O profissional convida só membros; o administrador, qualquer papel menos
    // o de administrador (#404). Quem define a equipe é o dono.
    if (!rolesGrantableBy(eu.role).includes(input.role)) {
      throw new ForbiddenException(
        eu.role === GroupRole.PROFESSIONAL
          ? 'Profissionais convidam só membros; a equipe é o dono quem define'
          : 'Seu papel não convida para esse papel',
      );
    }
    if (input.giveSeat && !can(eu.role, 'billing.manage')) {
      throw new ForbiddenException('Só o dono dá assento PRO');
    }
    if ((input.giveSeat || input.accompaniedByMembershipId) && input.role !== GroupRole.MEMBER) {
      throw new BadRequestException('Assento e acompanhamento são só para quem entra como membro');
    }
    return eu;
  }

  /**
   * "Acompanhado por": profissional (ou o dono) ativo **desta** comunidade —
   * o id vem do corpo e fica amarrado ao grupo da URL. O profissional só põe a
   * si mesmo; escolher outro é coisa do dono.
   */
  private async resolveAccompanier(
    actorId: string,
    role: GroupRole,
    groupId: string,
    membershipId: string | null | undefined,
  ): Promise<string | null> {
    if (!membershipId) return null;
    const m = await this.prisma.groupMembership.findFirst({
      where: {
        id: membershipId,
        groupId,
        status: MembershipStatus.ACTIVE,
        role: { in: [GroupRole.PROFESSIONAL, GroupRole.OWNER] },
      },
      select: { id: true, userId: true },
    });
    if (!m) throw new NotFoundException('Profissional não encontrado nesta comunidade');
    // Escolher outro responsável é `member.assign` (o dono e o administrador, #404).
    if (!can(role, 'member.assign') && m.userId !== actorId) {
      throw new ForbiddenException('Profissionais só põem a si mesmos como responsável');
    }
    return m.id;
  }

  /** Convite por e-mail sem aceite, ainda em pé (não revogado nem recusado). */
  private waitingWhere(groupId: string, role: GroupRole): Prisma.GroupInviteWhereInput {
    return {
      groupId,
      ...this.inviteReach(role),
      email: { not: null },
      code: null,
      uses: 0,
      acceptedAt: null,
      revokedAt: null,
      declinedAt: null,
    };
  }

  /** Convites nominais criados desde `since`, aceitos ou não ("Aceitaram este mês"). */
  private nominalSince(
    groupId: string,
    role: GroupRole,
    since: Date,
  ): Prisma.GroupInviteWhereInput {
    return {
      groupId,
      ...this.inviteReach(role),
      code: null,
      createdAt: { gte: since },
      OR: [{ email: { not: null } }, { acceptedById: { not: null } }],
    };
  }

  /**
   * A população da ativação (cartão "Ativaram em 48 h" e "Entraram e sem 1º
   * registro"): membros com opt-in que entraram entre 30 dias atrás e 48 h
   * atrás (a janela já fechou), por qualquer caminho. Só o total e quantos
   * ativaram — nunca quem (AGGREGATION_POLICY §7).
   */
  private async activationCohort(
    groupId: string,
    now: Date,
  ): Promise<{ total: number; activated: number }> {
    const novos = await this.prisma.groupMembership.findMany({
      where: {
        groupId,
        role: GroupRole.MEMBER,
        status: MembershipStatus.ACTIVE,
        statsOptIn: true,
        joinedAt: {
          gte: new Date(now.getTime() - 30 * DAY_MS),
          lte: new Date(now.getTime() - ACTIVATION_WINDOW_MS),
        },
      },
      select: { userId: true, joinedAt: true },
    });
    const ativou = await this.activatedUsers(novos, now);
    return { total: novos.length, activated: novos.filter((m) => ativou.has(m.userId)).length };
  }

  /**
   * Quem ativou: treinou em até 48 h depois de entrar. Só treino, porque
   * refeição, peso e medida nunca entram num agregado (AGGREGATION_POLICY §6).
   */
  private async activatedUsers(
    entradas: { userId: string; joinedAt: Date | null }[],
    now: Date,
  ): Promise<Set<string>> {
    const comData = entradas.filter((e) => e.joinedAt);
    if (comData.length === 0) return new Set();
    const inicio = new Date(Math.min(...comData.map((e) => e.joinedAt!.getTime())));
    const sessoes = await this.prisma.workoutSession.findMany({
      where: {
        userId: { in: [...new Set(comData.map((e) => e.userId))] },
        completedAt: { gte: inicio, lte: now },
      },
      select: { userId: true, completedAt: true },
    });
    const entrou = new Map(comData.map((e) => [e.userId, e.joinedAt!.getTime()]));
    const ativou = new Set<string>();
    for (const s of sessoes) {
      const t = entrou.get(s.userId);
      const c = s.completedAt!.getTime();
      if (t !== undefined && c >= t && c <= t + ACTIVATION_WINDOW_MS) ativou.add(s.userId);
    }
    return ativou;
  }

  /** Por que este convite não pode sair de novo agora (ou `null`, pode). */
  private resendBlock(
    convite: {
      email: string | null;
      code: string | null;
      maxUses: number | null;
      uses: number;
      expiresAt: Date | null;
      revokedAt: Date | null;
      declinedAt: Date | null;
      sendCount: number;
      lastSentAt: Date | null;
    } | null,
    agora: Date,
  ): ResendSkipReason | null {
    if (!convite || !convite.email || convite.code) return 'not_found';
    const st = inviteStatus(convite, agora);
    if (st === 'expired') return 'expired';
    if (st !== 'active') return 'not_found';
    if (convite.sendCount >= INVITE_MAX_SENDS) return 'limit';
    if (
      convite.lastSentAt &&
      agora.getTime() - convite.lastSentAt.getTime() < RESEND_MIN_INTERVAL_MS
    ) {
      return 'too_soon';
    }
    return null;
  }

  /**
   * Reenvia com um `updateMany` condicional: o teto de envios, o intervalo de
   * 10 minutos e o "ainda vale" são conferidos no próprio update, então dois
   * reenvios ao mesmo tempo não passam juntos. `null` = outro levou.
   */
  private async sendAgain(
    convite: { id: string },
    actorId: string,
    agora: Date,
  ): Promise<CreatedInvite | null> {
    const token = newToken();
    const { count } = await this.prisma.groupInvite.updateMany({
      where: {
        id: convite.id,
        email: { not: null },
        code: null,
        uses: 0,
        revokedAt: null,
        declinedAt: null,
        sendCount: { lt: INVITE_MAX_SENDS },
        AND: [
          notExpiredWhere(agora),
          {
            OR: [
              { lastSentAt: null },
              { lastSentAt: { lte: new Date(agora.getTime() - RESEND_MIN_INTERVAL_MS) } },
            ],
          },
        ],
      },
      data: {
        tokenHash: hashInviteToken(token),
        lastSentAt: agora,
        sendCount: { increment: 1 },
        linkIssuedAt: null,
      },
    });
    if (count !== 1) return null;
    const atualizado = await this.prisma.groupInvite.findUniqueOrThrow({
      where: { id: convite.id },
    });
    const url = this.url(token);
    const emailSent = await this.sendInviteEmail(atualizado, url, actorId);
    return { invite: view(atualizado, agora), url, emailSent };
  }

  /**
   * Por que cada e-mail não pode receber convite novo agora (revisão #401):
   * já tem um aberto, recusou há menos de 30 dias, ou já recebeu 5 envios
   * nesta comunidade em 30 dias (somando convites revogados e recriados).
   */
  private async emailBlocks(
    groupId: string,
    emails: string[],
    agora: Date,
  ): Promise<Map<string, 'pending_invite' | 'declined' | 'limit'>> {
    const out = new Map<string, 'pending_invite' | 'declined' | 'limit'>();
    if (emails.length === 0) return out;
    const desde = new Date(agora.getTime() - EMAIL_WINDOW_DAYS * DAY_MS);
    const convites = await this.prisma.groupInvite.findMany({
      where: { groupId, email: { in: emails, mode: 'insensitive' } },
      select: {
        email: true,
        code: true,
        uses: true,
        maxUses: true,
        expiresAt: true,
        revokedAt: true,
        declinedAt: true,
        sendCount: true,
        createdAt: true,
        lastSentAt: true,
      },
    });
    const envios = new Map<string, number>();
    for (const c of convites) {
      const email = c.email!.toLowerCase();
      if (inviteStatus(c, agora) === 'active') out.set(email, 'pending_invite');
      else if (c.declinedAt && c.declinedAt >= desde && out.get(email) !== 'pending_invite') {
        out.set(email, 'declined');
      }
      if (c.createdAt >= desde || (c.lastSentAt && c.lastSentAt >= desde)) {
        envios.set(email, (envios.get(email) ?? 0) + c.sendCount);
      }
    }
    for (const [email, n] of envios) {
      if (!out.has(email) && n + 1 > INVITE_MAX_SENDS) out.set(email, 'limit');
    }
    return out;
  }

  private async emailCapReached(groupId: string, email: string, agora: Date): Promise<boolean> {
    const desde = new Date(agora.getTime() - EMAIL_WINDOW_DAYS * DAY_MS);
    const { _sum } = await this.prisma.groupInvite.aggregate({
      where: {
        groupId,
        email: { equals: email, mode: 'insensitive' },
        OR: [{ createdAt: { gte: desde } }, { lastSentAt: { gte: desde } }],
      },
      _sum: { sendCount: true },
    });
    return (_sum.sendCount ?? 0) + 1 > INVITE_MAX_SENDS;
  }

  private emailBlockError(motivo: 'pending_invite' | 'declined' | 'limit'): HttpException {
    if (motivo === 'pending_invite') {
      return new ConflictException('Este e-mail já tem um convite aberto: reenvie pela lista');
    }
    if (motivo === 'declined') {
      return new ConflictException('Esta pessoa recusou um convite há menos de 30 dias');
    }
    return this.emailCapError();
  }

  private emailCapError(): HttpException {
    return new HttpException(
      `Este e-mail já recebeu ${INVITE_MAX_SENDS} convites desta comunidade nos últimos 30 dias`,
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }

  private limitError(): HttpException {
    return new HttpException(
      `Este convite já saiu ${INVITE_MAX_SENDS} vezes`,
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }

  private tooSoonError(): HttpException {
    return new HttpException('Espere alguns minutos para reenviar', HttpStatus.TOO_MANY_REQUESTS);
  }

  /** O link sem e-mail do convite nominal, derivado do id e da hora em que saiu. */
  private nominalLinkToken(inviteId: string, issuedAt: Date): string | null {
    const segredo = this.config.get<string>('INVITE_LINK_SECRET') ?? '';
    if (segredo.length < LINK_SECRET_MIN) return null;
    return createHmac('sha256', segredo)
      .update(`invite-fresh:${inviteId}:${issuedAt.toISOString()}`)
      .digest('base64url');
  }

  /**
   * O token do link sem e-mail, derivado do id com `INVITE_LINK_SECRET`. O
   * banco continua só com o hash; quem tem o segredo (a API) refaz o link para
   * a equipe copiar de novo. Sem segredo (ou curto), `null`: token aleatório.
   */
  private linkToken(inviteId: string): string | null {
    const segredo = this.config.get<string>('INVITE_LINK_SECRET') ?? '';
    if (segredo.length < LINK_SECRET_MIN) return null;
    return createHmac('sha256', segredo).update(`invite-link:${inviteId}`).digest('base64url');
  }

  /** O link de novo, para Copiar — só se ainda vale e se o hash bate (segredo não trocou). */
  private copyUrl(
    l: { id: string; code: string | null; email: string | null; tokenHash: string },
    status: InviteStatus,
  ): string | null {
    if (status !== 'active') return null;
    if (l.code) return this.codeUrl(l.code);
    if (l.email) return null;
    const token = this.linkToken(l.id);
    return token && hashInviteToken(token) === l.tokenHash ? this.url(token) : null;
  }

  /**
   * Que convites a pessoa da equipe administra: os dos papéis que ela pode dar
   * (#404). O dono, todos; o administrador, todos menos os de administrador; o
   * profissional, os de membro.
   */
  private inviteReach(role: GroupRole): { role: { in: GroupRole[] } } {
    return inviteReachWhere(role);
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

  /** O link do QR: abre a folha de entrar já com o código (`codeFromQr` lê o `?code=`). */
  private codeUrl(code: string): string {
    return `${this.origin()}/community?join=1&code=${code}`;
  }

  private origin(): string {
    return (this.config.get<string>('WEB_ORIGIN') ?? 'http://localhost:3030').replace(/\/$/, '');
  }

  private url(token: string): string {
    const origem = (this.config.get<string>('WEB_ORIGIN') ?? 'http://localhost:3030').replace(
      /\/$/,
      '',
    );
    return `${origem}/c/${token}`;
  }

  private async sendInviteEmail(
    convite: { email: string | null; role: GroupRole; expiresAt: Date | null; groupId: string },
    url: string,
    actorId: string,
  ): Promise<boolean> {
    if (!convite.email) return false;
    const [grupo, autor] = await Promise.all([
      this.prisma.group.findUniqueOrThrow({
        where: { id: convite.groupId },
        select: { name: true, brandColor: true },
      }),
      this.prisma.user.findUnique({ where: { id: actorId }, select: { name: true } }),
    ]);
    // Quem já tem conta com este e-mail recebe também no celular. O caminho é
    // o mesmo do link do e-mail: o convite só aceita a conta deste endereço.
    const convidada = await this.prisma.user.findFirst({
      // A aluna fictícia da demo (#412) não é convidada de nada.
      where: { email: { equals: convite.email, mode: 'insensitive' }, demoGroupId: null },
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
        brandColor: grupo.brandColor,
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
          { declinedAt: { lt: limite } },
          { acceptedAt: { lt: limite } },
          { uses: { gte: 1 }, maxUses: 1, createdAt: { lt: limite } },
        ],
      },
      data: { email: null },
    });
  }
}
