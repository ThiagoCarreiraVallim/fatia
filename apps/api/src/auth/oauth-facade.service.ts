import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { OAuthError } from './oauth-error';
import { ConfigService } from '@nestjs/config';
import { randomBytes, createHash } from 'node:crypto';
import { PrismaService } from '../common/prisma.service';

interface AuthorizeParams {
  clientId: string;
  redirectUri: string;
  clientState: string | undefined;
  clientCodeChallenge: string;
  scope: string | undefined;
  resource: string | undefined;
}

interface ExchangeCodeParams {
  code: string;
  redirectUri: string;
  clientId: string;
  codeVerifier: string;
}

const AUTH_TTL_MS = 10 * 60 * 1000;

@Injectable()
export class OAuthFacadeService {
  private readonly logger = new Logger(OAuthFacadeService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  private logtoEndpoint(): string {
    return this.config.getOrThrow<string>('LOGTO_ENDPOINT').replace(/\/+$/, '');
  }

  private logtoAppId(): string {
    return this.config.getOrThrow<string>('LOGTO_MCP_APP_ID');
  }

  private logtoAppSecret(): string {
    return this.config.getOrThrow<string>('LOGTO_MCP_APP_SECRET');
  }

  // Normaliza o resource para o identifier exato registrado no Logto.
  // Clientes MCP frequentemente mandam a URL com trailing slash; Logto
  // faz match exato e rejeita com invalid_target.
  private resolveResource(_requested: string | undefined | null): string {
    return this.config.getOrThrow<string>('LOGTO_AUDIENCE');
  }

  async registerClient(input: { redirectUris: string[]; clientName?: string }) {
    if (!Array.isArray(input.redirectUris) || input.redirectUris.length === 0) {
      throw new OAuthError('invalid_request', 'redirect_uris is required');
    }
    for (const uri of input.redirectUris) {
      try {
        new URL(uri);
      } catch {
        throw new OAuthError('invalid_request', `Invalid redirect_uri: ${uri}`);
      }
    }
    await this.pruneAbandonedClients();

    const clientId = `mcp_${randomBytes(16).toString('hex')}`;
    const client = await this.prisma.mcpOAuthClient.create({
      data: {
        clientId,
        clientName: input.clientName ?? null,
        redirectUris: input.redirectUris,
      },
    });
    return {
      client_id: client.clientId,
      client_name: client.clientName ?? undefined,
      redirect_uris: client.redirectUris,
      token_endpoint_auth_method: 'none',
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
    };
  }

  async startAuthorization(
    params: AuthorizeParams,
    callbackUrl: string,
  ): Promise<{ logtoAuthorizeUrl: string }> {
    const client = await this.prisma.mcpOAuthClient.findUnique({
      where: { clientId: params.clientId },
    });
    if (!client) throw new OAuthError('invalid_client', 'Unknown client_id');
    if (!client.redirectUris.includes(params.redirectUri)) {
      throw new OAuthError('invalid_request', 'redirect_uri not registered for this client');
    }
    if (!params.clientCodeChallenge) {
      throw new OAuthError('invalid_request', 'code_challenge is required (PKCE)');
    }

    await this.pruneExpiredAuthorizations();

    const state = randomBytes(24).toString('hex');
    const logtoCodeVerifier = randomBytes(48).toString('base64url');
    const logtoCodeChallenge = createHash('sha256').update(logtoCodeVerifier).digest('base64url');

    await this.prisma.mcpOAuthAuthorization.create({
      data: {
        state,
        clientId: client.clientId,
        redirectUri: params.redirectUri,
        clientState: params.clientState ?? null,
        clientCodeChallenge: params.clientCodeChallenge,
        logtoCodeVerifier,
        resource: params.resource ?? null,
        scope: params.scope ?? null,
        expiresAt: new Date(Date.now() + AUTH_TTL_MS),
      },
    });

    const url = new URL(`${this.logtoEndpoint()}/oidc/auth`);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('client_id', this.logtoAppId());
    url.searchParams.set('redirect_uri', callbackUrl);
    url.searchParams.set('state', state);
    url.searchParams.set('code_challenge', logtoCodeChallenge);
    url.searchParams.set('code_challenge_method', 'S256');
    const scopes = new Set(['openid', 'offline_access', ...(params.scope?.split(/\s+/) ?? [])]);
    url.searchParams.set('scope', Array.from(scopes).filter(Boolean).join(' '));
    url.searchParams.set('resource', this.resolveResource(params.resource));
    return { logtoAuthorizeUrl: url.toString() };
  }

  /**
   * Apaga authorizations vencidas (issue #91).
   *
   * Elas nunca dão acesso a nada — `exchangeCode` checa `expiresAt` e
   * `consumedAt` — mas acumulavam indefinidamente, guardando `code`,
   * `clientCodeChallenge` e `logtoCodeVerifier` de todo login já feito. Menos
   * material parado é menos superfície num eventual vazamento de banco.
   *
   * A limpeza é oportunista, em vez de um cron: acontece no início de cada
   * authorize, é indexada por `expiresAt`, e dispensa somar @nestjs/schedule ao
   * projeto por causa de uma tabela efêmera. Se falhar, não pode derrubar o
   * login — o catch registra e segue.
   */
  /**
   * Remove clientes DCR abandonados.
   *
   * Com DCR, o Claude registra um cliente NOVO a cada conexão nova — e a doc de
   * conectores avisa que a tabela cresce sem teto. Não é hipótese: em 31/07/2026
   * a produção já tinha 69 linhas em `McpOAuthClient` para um punhado de
   * usuários, a maioria de tentativas de conexão que nunca completaram.
   *
   * Abandonado = registrado há mais de 24h, sem nenhuma authorization associada.
   * Um cliente que completou o fluxo tem authorization; um que nunca passou do
   * `register` não tem, e não vai ter — o Claude registra de novo se precisar.
   *
   * A janela de 24h existe para não apagar um registro no meio de um fluxo lento
   * (usuário que abre o consentimento e só volta horas depois).
   *
   * Oportunista no `register`, mesmo padrão da poda de authorizations: é
   * exatamente quando a tabela cresce, e falhar aqui não pode impedir alguém de
   * conectar.
   */
  private async pruneAbandonedClients(): Promise<void> {
    try {
      const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const { count } = await this.prisma.mcpOAuthClient.deleteMany({
        where: {
          createdAt: { lt: cutoff },
          lastUsedAt: null,
          authorizations: { none: {} },
        },
      });
      if (count > 0) this.logger.log(`Limpou ${count} cliente(s) DCR abandonado(s)`);
    } catch (err) {
      this.logger.warn(
        `Falha ao limpar clientes DCR abandonados: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  private async pruneExpiredAuthorizations(): Promise<void> {
    try {
      const { count } = await this.prisma.mcpOAuthAuthorization.deleteMany({
        where: { expiresAt: { lt: new Date() } },
      });
      if (count > 0) this.logger.log(`Limpou ${count} authorization(s) expirada(s)`);
    } catch (err) {
      this.logger.warn(
        `Falha ao limpar authorizations expiradas: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  async handleCallback(state: string, logtoCode: string) {
    const row = await this.prisma.mcpOAuthAuthorization.findUnique({ where: { state } });
    if (!row) throw new OAuthError('invalid_grant', 'Unknown state');
    if (row.expiresAt < new Date())
      throw new OAuthError('invalid_grant', 'Authorization request expired');
    if (row.logtoCode) throw new OAuthError('invalid_grant', 'Callback already consumed');

    const code = randomBytes(32).toString('base64url');
    await this.prisma.mcpOAuthAuthorization.update({
      where: { id: row.id },
      data: { logtoCode, code },
    });

    const redirect = new URL(row.redirectUri);
    redirect.searchParams.set('code', code);
    if (row.clientState) redirect.searchParams.set('state', row.clientState);
    return { redirectUrl: redirect.toString() };
  }

  async exchangeCode(params: ExchangeCodeParams, callbackUrl: string) {
    const row = await this.prisma.mcpOAuthAuthorization.findUnique({
      where: { code: params.code },
    });
    if (!row || !row.logtoCode) throw new OAuthError('invalid_grant', 'Invalid code');
    if (row.consumedAt) throw new OAuthError('invalid_grant', 'Code already used');
    if (row.expiresAt < new Date()) throw new OAuthError('invalid_grant', 'Code expired');
    if (row.clientId !== params.clientId)
      throw new OAuthError('invalid_grant', 'client_id mismatch');
    if (row.redirectUri !== params.redirectUri) {
      throw new OAuthError('invalid_grant', 'redirect_uri mismatch');
    }
    const challenge = createHash('sha256').update(params.codeVerifier).digest('base64url');
    if (challenge !== row.clientCodeChallenge) {
      throw new OAuthError('invalid_grant', 'PKCE verification failed');
    }

    const tokenResp = await this.callLogtoToken({
      grant_type: 'authorization_code',
      code: row.logtoCode,
      redirect_uri: callbackUrl,
      code_verifier: row.logtoCodeVerifier,
      resource: this.resolveResource(row.resource),
    });

    await this.prisma.mcpOAuthAuthorization.update({
      where: { id: row.id },
      data: { consumedAt: new Date() },
    });
    await this.prisma.mcpOAuthClient.update({
      where: { clientId: row.clientId },
      data: { lastUsedAt: new Date() },
    });

    return tokenResp;
  }

  async refreshToken(params: { refreshToken: string; resource?: string; scope?: string }) {
    return this.callLogtoToken({
      grant_type: 'refresh_token',
      refresh_token: params.refreshToken,
      resource: this.resolveResource(params.resource),
      ...(params.scope ? { scope: params.scope } : {}),
    });
  }

  private async callLogtoToken(body: Record<string, string>): Promise<Record<string, unknown>> {
    const basic = Buffer.from(`${this.logtoAppId()}:${this.logtoAppSecret()}`).toString('base64');
    const res = await fetch(`${this.logtoEndpoint()}/oidc/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${basic}`,
        Accept: 'application/json',
      },
      body: new URLSearchParams(body).toString(),
    });
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      this.logger.warn(`Logto token error: ${res.status} ${JSON.stringify(json)}`);
      throw new UnauthorizedException(
        typeof json.error_description === 'string'
          ? json.error_description
          : 'Token exchange failed',
      );
    }
    return json;
  }
}
