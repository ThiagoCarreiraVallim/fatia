import { BadRequestException, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
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

  async registerClient(input: { redirectUris: string[]; clientName?: string }) {
    if (!Array.isArray(input.redirectUris) || input.redirectUris.length === 0) {
      throw new BadRequestException('redirect_uris is required');
    }
    for (const uri of input.redirectUris) {
      try {
        new URL(uri);
      } catch {
        throw new BadRequestException(`Invalid redirect_uri: ${uri}`);
      }
    }
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
    if (!client) throw new BadRequestException('Unknown client_id');
    if (!client.redirectUris.includes(params.redirectUri)) {
      throw new BadRequestException('redirect_uri not registered for this client');
    }
    if (!params.clientCodeChallenge) {
      throw new BadRequestException('code_challenge is required (PKCE)');
    }

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
    if (params.resource) url.searchParams.set('resource', params.resource);
    return { logtoAuthorizeUrl: url.toString() };
  }

  async handleCallback(state: string, logtoCode: string) {
    const row = await this.prisma.mcpOAuthAuthorization.findUnique({ where: { state } });
    if (!row) throw new BadRequestException('Unknown state');
    if (row.expiresAt < new Date()) throw new BadRequestException('Authorization request expired');
    if (row.logtoCode) throw new BadRequestException('Callback already consumed');

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
    if (!row || !row.logtoCode) throw new UnauthorizedException('Invalid code');
    if (row.consumedAt) throw new UnauthorizedException('Code already used');
    if (row.expiresAt < new Date()) throw new UnauthorizedException('Code expired');
    if (row.clientId !== params.clientId) throw new UnauthorizedException('client_id mismatch');
    if (row.redirectUri !== params.redirectUri) {
      throw new UnauthorizedException('redirect_uri mismatch');
    }
    const challenge = createHash('sha256').update(params.codeVerifier).digest('base64url');
    if (challenge !== row.clientCodeChallenge) {
      throw new UnauthorizedException('PKCE verification failed');
    }

    const tokenResp = await this.callLogtoToken({
      grant_type: 'authorization_code',
      code: row.logtoCode,
      redirect_uri: callbackUrl,
      code_verifier: row.logtoCodeVerifier,
      ...(row.resource ? { resource: row.resource } : {}),
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
      ...(params.resource ? { resource: params.resource } : {}),
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
