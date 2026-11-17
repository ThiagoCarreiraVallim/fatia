import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { PrismaService } from '../common/prisma.service';
import { mcpPublicUrl } from '../common/public-url';
import { JwtValidationService } from './jwt-validation.service';
import { UserProvisioningService } from './user-provisioning.service';

/** Uma escrita de "último acesso" por conexão a cada minuto, no máximo. */
export const TOUCH_INTERVAL_MS = 60_000;

/** Validade do access token quando o Logto não manda `expires_in`. */
const DEFAULT_ACCESS_TTL_S = 3600;
/**
 * Por quanto tempo um refresh token ainda acha a conexão. O Logto não diz a
 * validade dele na resposta; 90 dias cobre o TTL do Logto (14 dias por padrão,
 * renovável) com folga. Na rotação o velho sai na hora; este prazo só limpa o
 * que ficou para trás (cliente que parou de renovar).
 */
const REFRESH_RETENTION_MS = 90 * 24 * 60 * 60 * 1000;

export const hashToken = (token: string): string =>
  createHash('sha256').update(token).digest('hex');

/** A parte da resposta do `/oidc/token` do Logto que importa aqui. */
export interface IssuedTokens {
  access_token?: unknown;
  refresh_token?: unknown;
  expires_in?: unknown;
}

const asToken = (v: unknown): string | undefined =>
  typeof v === 'string' && v.length > 0 ? v : undefined;

function tokenRows(tokens: IssuedTokens, now: Date) {
  const rows: { kind: 'access' | 'refresh'; hash: string; expiresAt: Date }[] = [];
  const access = asToken(tokens.access_token);
  if (access) {
    const ttl =
      typeof tokens.expires_in === 'number' && tokens.expires_in > 0
        ? tokens.expires_in
        : DEFAULT_ACCESS_TTL_S;
    rows.push({
      kind: 'access',
      hash: hashToken(access),
      expiresAt: new Date(now.getTime() + ttl * 1000),
    });
  }
  const refresh = asToken(tokens.refresh_token);
  if (refresh) {
    rows.push({
      kind: 'refresh',
      hash: hashToken(refresh),
      expiresAt: new Date(now.getTime() + REFRESH_RETENTION_MS),
    });
  }
  return rows;
}

export interface McpConnectionView {
  id: string;
  /** O nome que o app mandou no registro (DCR): "Claude", "ChatGPT"… Pode faltar. */
  clientName: string | null;
  connectedAt: Date;
  lastUsedAt: Date;
}

export interface McpConnectionsOverview {
  /** O endereço para colar no app de IA (`API_PUBLIC_URL` + `/mcp`). */
  serverUrl: string;
  connections: McpConnectionView[];
}

/**
 * Quem conectou qual app de IA pelo MCP (#388), para a tela "Conectar sua IA"
 * mostrar "Conectado ao Claude · último acesso agora".
 *
 * Só banco: é o que o `/mcp` (toque) e a rota da tela (lista) usam, sem puxar o
 * `AuthModule` e o guard global para dentro de quem importa o `McpModule`. Quem
 * descobre o dono de um token novo é o `McpConnectionRecorder`, no facade.
 */
@Injectable()
export class McpConnectionService {
  private readonly logger = new Logger(McpConnectionService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Troca do code: liga o cliente da autorização à pessoa e guarda os hashes dos
   * tokens entregues. Um segundo login no mesmo cliente (outro aparelho) só
   * soma tokens à mesma conexão.
   */
  async link(
    userId: string,
    clientId: string,
    tokens: IssuedTokens,
    now: Date = new Date(),
  ): Promise<void> {
    const connection = await this.prisma.mcpOAuthConnection.upsert({
      where: { userId_clientId: { userId, clientId } },
      create: { userId, clientId, lastUsedAt: now },
      update: { lastUsedAt: now },
      select: { id: true },
    });
    await this.saveTokens(connection.id, tokens, now);
  }

  /** A conexão dona do refresh token apresentado, se ele ainda vale. */
  async findByRefreshToken(refreshToken: string, now: Date = new Date()) {
    const row = await this.prisma.mcpOAuthConnectionToken.findFirst({
      where: { hash: hashToken(refreshToken), kind: 'refresh', expiresAt: { gt: now } },
      select: {
        connection: {
          select: { id: true, clientId: true, user: { select: { logtoSub: true } } },
        },
      },
    });
    return row?.connection ?? null;
  }

  /**
   * Refresh: a conexão já foi achada pelo refresh token apresentado. Soma os
   * tokens novos e, se o Logto girou o refresh token, apaga o velho.
   */
  async renew(
    connectionId: string,
    presentedRefreshToken: string,
    tokens: IssuedTokens,
    now: Date = new Date(),
  ): Promise<void> {
    await this.prisma.mcpOAuthConnection.update({
      where: { id: connectionId },
      data: { lastUsedAt: now },
    });
    await this.saveTokens(connectionId, tokens, now);
    const rotated = asToken(tokens.refresh_token);
    if (rotated && rotated !== presentedRefreshToken) {
      await this.prisma.mcpOAuthConnectionToken.deleteMany({
        where: { connectionId, hash: hashToken(presentedRefreshToken) },
      });
    }
  }

  private async saveTokens(connectionId: string, tokens: IssuedTokens, now: Date) {
    const rows = tokenRows(tokens, now);
    for (const row of rows) {
      // upsert: sem rotação o Logto devolve o mesmo refresh token, que só ganha prazo.
      await this.prisma.mcpOAuthConnectionToken.upsert({
        where: { hash: row.hash },
        create: { connectionId, ...row },
        update: { expiresAt: row.expiresAt },
      });
    }
    // Poda: tokens vencidos de qualquer conexão. O índice em `expiresAt` deixa barato.
    await this.prisma.mcpOAuthConnectionToken.deleteMany({ where: { expiresAt: { lt: now } } });
  }

  /**
   * Cada chamada ao `/mcp`. O token do Bearer é o que o app de IA recebeu no
   * `/oauth/token`; o do próprio PWA ou app não casa com conexão nenhuma.
   * Nunca lança: a ferramenta não pode pagar pela contabilidade da tela.
   */
  async touch(accessToken: string, now: Date = new Date()): Promise<void> {
    if (!accessToken) return;
    try {
      await this.prisma.mcpOAuthConnection.updateMany({
        where: {
          lastUsedAt: { lt: new Date(now.getTime() - TOUCH_INTERVAL_MS) },
          tokens: {
            some: { hash: hashToken(accessToken), kind: 'access', expiresAt: { gt: now } },
          },
        },
        data: { lastUsedAt: now },
      });
    } catch (err) {
      this.logger.warn(
        `Não marcou o último acesso do MCP: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  async list(userId: string): Promise<McpConnectionView[]> {
    const rows = await this.prisma.mcpOAuthConnection.findMany({
      where: { userId },
      orderBy: { lastUsedAt: 'desc' },
      select: {
        id: true,
        createdAt: true,
        lastUsedAt: true,
        client: { select: { clientName: true } },
      },
    });
    return rows.map((r) => ({
      id: r.id,
      clientName: r.client.clientName,
      connectedAt: r.createdAt,
      lastUsedAt: r.lastUsedAt,
    }));
  }

  async overview(userId: string): Promise<McpConnectionsOverview> {
    return { serverUrl: mcpPublicUrl(), connections: await this.list(userId) };
  }
}

/**
 * Depois de cada `/oauth/token` que deu certo, liga a conexão aos tokens
 * entregues (revisão da #388).
 *
 * - Troca do code: o cliente vem da autorização verificada (PKCE, redirect) e o
 *   dono, **só** do access token que o Logto emitiu (`sub` verificado no JWKS).
 * - Refresh: a conexão é a dona do refresh token apresentado. O `client_id` do
 *   corpo não decide nada (é público e qualquer um pode mandar o de outro app) e
 *   o refresh nunca cria conexão; se o token novo for de outra pessoa, nada muda.
 *
 * Nada aqui segura a resposta: o Logto já girou o refresh token quando
 * respondeu, e um cliente que desiste por demora perde o único válido. Por isso
 * os métodos públicos não devolvem promessa; o trabalho roda solto, com erro só
 * no log. `flush()` existe para os testes esperarem.
 */
@Injectable()
export class McpConnectionRecorder {
  private readonly logger = new Logger(McpConnectionRecorder.name);
  private readonly pending = new Set<Promise<void>>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly validation: JwtValidationService,
    private readonly provisioning: UserProvisioningService,
    private readonly connections: McpConnectionService,
  ) {}

  recordExchange(clientId: string, tokens: IssuedTokens): void {
    this.run(`troca do code do cliente ${clientId}`, () => this.linkExchange(clientId, tokens));
  }

  recordRefresh(presentedRefreshToken: string, tokens: IssuedTokens, bodyClientId?: string): void {
    this.run('refresh', () =>
      this.renewByRefreshToken(presentedRefreshToken, tokens, bodyClientId),
    );
  }

  /** Espera o que estiver gravando. Só para testes. */
  async flush(): Promise<void> {
    while (this.pending.size > 0) await Promise.all([...this.pending]);
  }

  private run(what: string, work: () => Promise<void>): void {
    const task = Promise.resolve()
      .then(work)
      .catch((err: unknown) => {
        this.logger.warn(
          `Não gravou a conexão MCP (${what}): ${err instanceof Error ? err.message : String(err)}`,
        );
      })
      .finally(() => this.pending.delete(task));
    this.pending.add(task);
  }

  private async linkExchange(clientId: string, tokens: IssuedTokens): Promise<void> {
    const accessToken = asToken(tokens.access_token);
    if (!accessToken) return;
    const client = await this.prisma.mcpOAuthClient.findUnique({
      where: { clientId },
      select: { clientId: true },
    });
    if (!client) return;
    const user = await this.provisioning.provision(await this.validation.verify(accessToken));
    await this.connections.link(user.id, clientId, tokens);
  }

  private async renewByRefreshToken(
    presented: string,
    tokens: IssuedTokens,
    bodyClientId: string | undefined,
  ): Promise<void> {
    const accessToken = asToken(tokens.access_token);
    if (!presented || !accessToken) return;
    // Sem linha: refresh token de antes desta tabela, vencido ou de ninguém.
    // A conexão volta a aparecer quando a pessoa conectar de novo.
    const connection = await this.connections.findByRefreshToken(presented);
    if (!connection) return;
    if (bodyClientId && bodyClientId !== connection.clientId) {
      this.logger.warn(
        `Refresh com client_id ${bodyClientId} diferente do da conexão (${connection.clientId}); ignorado.`,
      );
    }
    const { sub } = await this.validation.verify(accessToken);
    if (sub !== connection.user.logtoSub) {
      this.logger.warn(`Refresh devolveu token de outra pessoa para a conexão ${connection.id}.`);
      return;
    }
    await this.connections.renew(connection.id, presented, tokens);
  }
}
