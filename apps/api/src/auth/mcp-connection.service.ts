import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { PrismaService } from '../common/prisma.service';
import { mcpPublicUrl } from '../common/public-url';
import { JwtValidationService } from './jwt-validation.service';
import { UserProvisioningService } from './user-provisioning.service';

/** Uma escrita de "último acesso" por conexão a cada minuto, no máximo. */
export const TOUCH_INTERVAL_MS = 60_000;

export const hashAccessToken = (token: string): string =>
  createHash('sha256').update(token).digest('hex');

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

  /** Liga (ou renova) o cliente à pessoa, com o hash do token que ele acabou de receber. */
  async link(userId: string, clientId: string, accessToken: string): Promise<void> {
    const accessTokenHash = hashAccessToken(accessToken);
    await this.prisma.mcpOAuthConnection.upsert({
      where: { userId_clientId: { userId, clientId } },
      create: { userId, clientId, accessTokenHash },
      update: { accessTokenHash, lastUsedAt: new Date() },
    });
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
          accessTokenHash: hashAccessToken(accessToken),
          lastUsedAt: { lt: new Date(now.getTime() - TOUCH_INTERVAL_MS) },
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
 * Depois de cada `/oauth/token` que deu certo (code ou refresh), liga o cliente
 * ao dono do token.
 *
 * O dono sai **só** do access token que o Logto emitiu (o `sub` verificado pelo
 * JWKS), nunca de algo que o cliente manda: o `client_id` diz qual app, o token
 * diz de quem. Assim, renovar com o `client_id` de outra pessoa só cria uma
 * linha para quem renovou.
 *
 * Nada aqui pode derrubar o login de um app de IA: o vínculo é contabilidade da
 * tela, e falhar nele (token opaco, banco lento) só deixa o "último acesso"
 * desatualizado.
 */
@Injectable()
export class McpConnectionRecorder {
  private readonly logger = new Logger(McpConnectionRecorder.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly validation: JwtValidationService,
    private readonly provisioning: UserProvisioningService,
    private readonly connections: McpConnectionService,
  ) {}

  async recordIssuedToken(
    clientId: string | undefined,
    tokens: Record<string, unknown>,
  ): Promise<void> {
    const accessToken = tokens.access_token;
    if (!clientId || typeof accessToken !== 'string' || !accessToken) return;
    try {
      const client = await this.prisma.mcpOAuthClient.findUnique({
        where: { clientId },
        select: { clientId: true },
      });
      if (!client) return;
      const user = await this.provisioning.provision(await this.validation.verify(accessToken));
      await this.connections.link(user.id, clientId, accessToken);
    } catch (err) {
      this.logger.warn(
        `Não ligou o cliente MCP ${clientId} a uma pessoa: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}
