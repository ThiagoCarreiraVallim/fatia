import {
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiKeyScope, type GroupApiKey } from '@fatia/db';
import { PrismaService } from '../common/prisma.service';
import { dayBoundsInTz } from '../progress/helpers/date-tz';
import { requireContentRole } from '../sharing/content-roles';
import {
  generateApiKey,
  monthlyQuotaFor,
  hashApiKey,
  looksLikeApiKey,
  MAX_ACTIVE_KEYS,
  quotaRenewsOn,
  quotaState,
  usageMonth,
  type QuotaState,
} from './api-key';
export interface ApiKeyView {
  id: string;
  name: string;
  /** Os 4 últimos caracteres ("fatia_live_…8f2a"). */
  lastFour: string;
  scopes: ApiKeyScope[];
  createdAt: Date;
  createdBy: string | null;
  lastUsedAt: Date | null;
  /** Chamadas desta chave no mês da cota. */
  callsThisMonth: number;
  revokedAt: Date | null;
}

export interface ApiQuotaView {
  /** AAAA-MM, no fuso da comunidade. */
  month: string;
  used: number;
  limit: number;
  /** AAAA-MM-DD: o dia em que a cota volta a zero. */
  renewsOn: string;
  state: QuotaState;
}

export interface ApiKeysView {
  keys: ApiKeyView[];
  quota: ApiQuotaView;
}

export interface CreatedApiKey {
  key: ApiKeyView;
  /** O segredo inteiro, só nesta resposta: o banco guarda o hash. */
  secret: string;
}

/** Quem chama com uma chave válida: a comunidade dela, nada de pessoa. */
export interface ApiKeyContext {
  keyId: string;
  groupId: string;
  /** Teto do mês, pelo assento pago da comunidade (`monthlyQuotaFor`). */
  monthlyLimit: number;
  timezone: string;
  scopes: ApiKeyScope[];
}

export interface CreateApiKeyInput {
  name: string;
  scopes?: ApiKeyScope[];
}

const INVALID = 'Chave de API inválida ou revogada';
const KEY_NOT_FOUND = 'API key not found';
const FORBIDDEN = 'Só o dono cuida das integrações';
const ALL_SCOPES = Object.values(ApiKeyScope);
/** O fuso conta o mês; o pacote de assentos dá o teto. */
const GROUP_QUOTA_SELECT = { timezone: true, seatPool: { select: { status: true } } } as const;

type KeyRow = GroupApiKey & { createdBy: { name: string } | null };

/**
 * Chaves de API da comunidade (#413, Pn-38). A dona cria, lista e revoga
 * (`integration.manage`, só o dono); o Zapier e o Make chamam
 * `/integrations/v1/*` com a chave, que lê só a comunidade dela.
 *
 * - O banco guarda o sha256: o segredo aparece uma vez, na criação.
 * - Revogar vale na chamada seguinte: toda chamada relê a linha, sem cache.
 * - A cota é por comunidade e mês (no fuso dela), contada numa instrução só,
 *   que não passa do teto nem com chamadas ao mesmo tempo.
 * - Cada chamada aceita vira uma linha de uso por chave (`GroupApiCall`).
 */
@Injectable()
export class ApiKeyService {
  constructor(private readonly prisma: PrismaService) {}

  async list(actorId: string, groupId: string): Promise<ApiKeysView> {
    await requireContentRole(this.prisma, actorId, groupId, 'integration.manage', FORBIDDEN);
    const group = await this.prisma.group.findUniqueOrThrow({
      where: { id: groupId },
      select: GROUP_QUOTA_SELECT,
    });
    const now = new Date();
    const month = usageMonth(now, group.timezone);
    const rows = await this.prisma.groupApiKey.findMany({
      where: { groupId, revokedAt: null },
      include: { createdBy: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
    });
    const calls = await this.callsThisMonth(
      rows.map((r) => r.id),
      month,
      group.timezone,
    );
    return {
      keys: rows.map((r) => toView(r, calls.get(r.id) ?? 0)),
      quota: await this.quotaOf(groupId, monthlyQuotaFor(group.seatPool?.status), month),
    };
  }

  async create(actorId: string, groupId: string, input: CreateApiKeyInput): Promise<CreatedApiKey> {
    await requireContentRole(this.prisma, actorId, groupId, 'integration.manage', FORBIDDEN);
    const name = input.name.trim().replace(/\s+/g, ' ').slice(0, 60);
    if (!name) throw new ConflictException('Dê um nome à chave');
    const ativas = await this.prisma.groupApiKey.count({ where: { groupId, revokedAt: null } });
    if (ativas >= MAX_ACTIVE_KEYS) {
      throw new ConflictException(
        `A comunidade já tem ${MAX_ACTIVE_KEYS} chaves. Revogue uma antes de criar outra.`,
      );
    }
    const scopes = input.scopes?.length
      ? ALL_SCOPES.filter((s) => input.scopes!.includes(s))
      : ALL_SCOPES;
    const secret = generateApiKey();
    const row = await this.prisma.groupApiKey.create({
      data: {
        groupId,
        name,
        hash: hashApiKey(secret),
        lastFour: secret.slice(-4),
        scopes,
        createdById: actorId,
      },
      include: { createdBy: { select: { name: true } } },
    });
    return { key: toView(row, 0), secret };
  }

  /** Revoga a chave desta comunidade; a de outra responde como inexistente (#92). */
  async revoke(actorId: string, groupId: string, keyId: string): Promise<ApiKeyView> {
    await requireContentRole(this.prisma, actorId, groupId, 'integration.manage', FORBIDDEN);
    const atual = await this.prisma.groupApiKey.findFirst({ where: { id: keyId, groupId } });
    if (!atual) throw new NotFoundException(KEY_NOT_FOUND);
    const row = await this.prisma.groupApiKey.update({
      where: { id: atual.id },
      data: { revokedAt: atual.revokedAt ?? new Date() },
      include: { createdBy: { select: { name: true } } },
    });
    return toView(row, 0);
  }

  /** A comunidade da chave. Inválida, revogada ou de comunidade apagada: o mesmo 401. */
  async authenticate(raw: string | null | undefined): Promise<ApiKeyContext> {
    const secret = raw?.trim() ?? '';
    if (!looksLikeApiKey(secret)) throw new UnauthorizedException(INVALID);
    const row = await this.prisma.groupApiKey.findUnique({
      where: { hash: hashApiKey(secret) },
      include: { group: { select: GROUP_QUOTA_SELECT } },
    });
    if (!row || row.revokedAt) throw new UnauthorizedException(INVALID);
    return {
      keyId: row.id,
      groupId: row.groupId,
      monthlyLimit: monthlyQuotaFor(row.group.seatPool?.status),
      timezone: row.group.timezone,
      scopes: row.scopes,
    };
  }

  /**
   * Cobra uma chamada: o escopo da rota, depois a cota do mês. No teto, 429
   * com o dia da renovação; nada no app muda e nenhum dado se perde.
   */
  async consume(ctx: ApiKeyContext, scope: ApiKeyScope, endpoint: string): Promise<void> {
    if (!ctx.scopes.includes(scope)) {
      throw new ForbiddenException('Esta chave não lê isto. Crie uma chave com esse acesso.');
    }
    const now = new Date();
    const month = usageMonth(now, ctx.timezone);
    const limit = ctx.monthlyLimit;
    // Um INSERT … ON CONFLICT só soma enquanto abaixo do teto: duas chamadas ao
    // mesmo tempo não passam juntas da última vaga.
    const rows = await this.prisma.$queryRaw<{ calls: number }[]>`
      INSERT INTO "GroupApiMonthUsage" ("groupId", "month", "calls")
      VALUES (${ctx.groupId}, ${month}, 1)
      ON CONFLICT ("groupId", "month") DO UPDATE
        SET "calls" = "GroupApiMonthUsage"."calls" + 1
        WHERE "GroupApiMonthUsage"."calls" < ${limit}
      RETURNING "calls"`;
    if (rows.length === 0) {
      const renewsOn = quotaRenewsOn(month);
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message: `A cota de chamadas deste mês acabou. Ela renova em ${renewsOn}; nada no app muda.`,
          renewsOn,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    await this.prisma.$transaction([
      this.prisma.groupApiCall.create({
        data: { groupId: ctx.groupId, keyId: ctx.keyId, endpoint, at: now },
      }),
      this.prisma.groupApiKey.update({ where: { id: ctx.keyId }, data: { lastUsedAt: now } }),
    ]);
  }

  async quota(groupId: string, now: Date = new Date()): Promise<ApiQuotaView> {
    const group = await this.prisma.group.findUniqueOrThrow({
      where: { id: groupId },
      select: GROUP_QUOTA_SELECT,
    });
    return this.quotaOf(
      groupId,
      monthlyQuotaFor(group.seatPool?.status),
      usageMonth(now, group.timezone),
    );
  }

  private async quotaOf(groupId: string, limit: number, month: string): Promise<ApiQuotaView> {
    const row = await this.prisma.groupApiMonthUsage.findUnique({
      where: { groupId_month: { groupId, month } },
      select: { calls: true },
    });
    const used = row?.calls ?? 0;
    return { month, used, limit, renewsOn: quotaRenewsOn(month), state: quotaState(used, limit) };
  }

  private async callsThisMonth(
    keyIds: string[],
    month: string,
    timezone: string,
  ): Promise<Map<string, number>> {
    if (keyIds.length === 0) return new Map();
    const desde = dayBoundsInTz(`${month}-01`, timezone).start;
    const porChave = await this.prisma.groupApiCall.groupBy({
      by: ['keyId'],
      where: { keyId: { in: keyIds }, at: { gte: desde } },
      _count: { _all: true },
    });
    return new Map(porChave.map((c) => [c.keyId, c._count._all]));
  }
}

function toView(r: KeyRow, callsThisMonth: number): ApiKeyView {
  return {
    id: r.id,
    name: r.name,
    lastFour: r.lastFour,
    scopes: r.scopes,
    createdAt: r.createdAt,
    createdBy: r.createdBy?.name ?? null,
    lastUsedAt: r.lastUsedAt,
    callsThisMonth,
    revokedAt: r.revokedAt,
  };
}
