import { Injectable, Logger } from '@nestjs/common';
import { OAuthError, type OAuthErrorCode } from './oauth-error';
import { ConfigService } from '@nestjs/config';
import { randomBytes, createHash } from 'node:crypto';
import { PrismaService } from '../common/prisma.service';
import { McpConnectionRecorder } from './mcp-connection.service';

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

/**
 * Códigos da RFC 6749 §5.2 do Logto que falam do pedido do cliente MCP e por
 * isso repassamos como vieram. `invalid_grant` só sai quando o Logto disse isso:
 * com ele o Claude descarta o refresh token e refaz o login.
 */
const PASS_THROUGH_TOKEN_ERRORS: ReadonlySet<string> = new Set<OAuthErrorCode>([
  'invalid_request',
  'invalid_grant',
  'unsupported_grant_type',
  'invalid_scope',
]);

/**
 * Traduz a resposta de erro do Logto para o cliente MCP (revisão da #388).
 *
 * - Logto fora do ar (5xx, corpo que não é JSON, `temporarily_unavailable`):
 *   `temporarily_unavailable` com 503, para o cliente tentar de novo depois.
 * - `invalid_client`, `invalid_target`, `unauthorized_client` e códigos que não
 *   conhecemos falam do app do facade no Logto (segredo, resource, grant): é
 *   configuração nossa, `server_error` com 500. O cliente não tem o que corrigir
 *   e não deve jogar o refresh token fora por isso.
 */
export function mapLogtoTokenError(status: number, json: Record<string, unknown>): OAuthErrorCode {
  const error = typeof json.error === 'string' ? json.error : undefined;
  if (error && PASS_THROUGH_TOKEN_ERRORS.has(error)) return error as OAuthErrorCode;
  if (error === 'temporarily_unavailable') return 'temporarily_unavailable';
  if (error === undefined && status >= 500) return 'temporarily_unavailable';
  return 'server_error';
}

@Injectable()
export class OAuthFacadeService {
  private readonly logger = new Logger(OAuthFacadeService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly connections: McpConnectionRecorder,
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
    // Sem await: gravar a conexão nunca segura a entrega dos tokens (#388).
    this.connections.recordExchange(row.clientId, tokenResp);

    return tokenResp;
  }

  /**
   * O `clientId` é o `client_id` que o cliente público manda no refresh (RFC
   * 6749 §3.2.1). Não decide qual conexão renovou: quem decide é o refresh token
   * apresentado. Um `client_id` que não bate só vai para o log.
   */
  async refreshToken(params: {
    refreshToken: string;
    resource?: string;
    scope?: string;
    clientId?: string;
  }) {
    const tokenResp = await this.callLogtoToken({
      grant_type: 'refresh_token',
      refresh_token: params.refreshToken,
      resource: this.resolveResource(params.resource),
      ...(params.scope ? { scope: params.scope } : {}),
    });
    // Sem await: o Logto já girou o refresh token; atrasar a resposta pode
    // fazer o cliente perder o único válido (#388).
    this.connections.recordRefresh(params.refreshToken, tokenResp, params.clientId);
    return tokenResp;
  }

  private async callLogtoToken(body: Record<string, string>): Promise<Record<string, unknown>> {
    const basic = Buffer.from(`${this.logtoAppId()}:${this.logtoAppSecret()}`).toString('base64');
    let res: Response;
    try {
      res = await fetch(`${this.logtoEndpoint()}/oidc/token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: `Basic ${basic}`,
          Accept: 'application/json',
        },
        body: new URLSearchParams(body).toString(),
      });
    } catch (err) {
      this.logger.error(`Logto token endpoint unreachable: ${(err as Error).message}`);
      throw new OAuthError('temporarily_unavailable', 'Authorization server unavailable');
    }
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      this.logger.warn(`Logto token error: ${res.status} ${JSON.stringify(json)}`);
      // Formato da RFC 6749 também aqui: com o 401 genérico do Nest, o Claude não
      // reconhecia o refresh vencido e repetia a chamada em vez de refazer o login.
      const code = mapLogtoTokenError(res.status, json);
      const description =
        code === 'server_error' || code === 'temporarily_unavailable'
          ? 'Authorization server unavailable'
          : typeof json.error_description === 'string'
            ? json.error_description
            : 'Token exchange failed';
      throw new OAuthError(code, description);
    }
    return json;
  }
}
