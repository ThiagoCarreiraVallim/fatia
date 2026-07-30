import { UnauthorizedException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { createHash, randomBytes } from 'node:crypto';
import { PrismaService } from '../../common/prisma.service';
import { OAuthFacadeService } from '../oauth-facade.service';

/**
 * Happy path completo do OAuth facade (issue #91), contra Postgres real.
 *
 * O spec unitário de `oauth-facade.service.ts` cobre cada passo com Prisma
 * mockado. O que ele NÃO pode provar é que os passos **compõem**: que o `code`
 * cunhado no callback é o mesmo que o token endpoint aceita, que o
 * `clientCodeChallenge` gravado no authorize é o verificado no exchange, e que as
 * transições de linha (`logtoCode` → `code` → `consumedAt`) acontecem de fato no
 * banco. Um mock que devolve o objeto certo esconde justamente esse tipo de erro.
 *
 * Só o Logto é stubado — é HTTP externo. Todo o resto é real, inclusive a
 * derivação S256 do PKCE.
 *
 * Requer `DATABASE_URL` com migrations aplicadas (o job `test` do CI provisiona).
 */

const CALLBACK_URL = 'https://api.example.com/oauth/callback';
const CLIENT_REDIRECT = 'https://claude.ai/api/mcp/auth_callback';

const CONFIG: Record<string, string> = {
  LOGTO_ENDPOINT: 'https://logto.example.com',
  LOGTO_AUDIENCE: 'https://api.example.com/mcp',
  LOGTO_MCP_APP_ID: 'mcp-app-id',
  LOGTO_MCP_APP_SECRET: 'mcp-app-secret',
};

const config = {
  getOrThrow: (key: string) => {
    const value = CONFIG[key];
    if (!value) throw new Error(`missing config ${key}`);
    return value;
  },
  get: (key: string) => CONFIG[key],
} as unknown as ConfigService;

const s256 = (verifier: string) => createHash('sha256').update(verifier).digest('base64url');

describe('fluxo OAuth ponta a ponta (DCR → authorize → callback → token)', () => {
  const prisma = new PrismaService();
  const service = new OAuthFacadeService(prisma, config);

  const fetchMock = jest.fn();
  const realFetch = global.fetch;
  const createdClientIds: string[] = [];

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) {
      throw new Error(
        'Este spec exige Postgres. Suba o banco (`pnpm infra:up`), aplique as migrations ' +
          '(`pnpm --filter @fatia/db exec prisma migrate deploy`) e defina DATABASE_URL.',
      );
    }
    await prisma.$connect();
  });

  afterAll(async () => {
    global.fetch = realFetch;
    // Cascade em McpOAuthClient limpa as authorizations.
    await prisma.mcpOAuthClient
      .deleteMany({ where: { clientId: { in: createdClientIds } } })
      .catch(() => undefined);
    await prisma.$disconnect();
  });

  beforeEach(() => {
    fetchMock.mockReset();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  /** Registra um cliente via DCR e devolve o client_id, marcando para limpeza. */
  async function registerClient() {
    const registration = await service.registerClient({
      redirectUris: [CLIENT_REDIRECT],
      clientName: 'Claude',
    });
    createdClientIds.push(registration.client_id);
    return registration;
  }

  it('completa o fluxo inteiro e devolve os tokens do Logto', async () => {
    // --- 1. Dynamic Client Registration (RFC 7591) ---
    const registration = await registerClient();

    expect(registration.client_id).toMatch(/^mcp_[0-9a-f]{32}$/);
    expect(registration.redirect_uris).toEqual([CLIENT_REDIRECT]);
    // Cliente público: sem segredo, autenticação do token endpoint é PKCE.
    expect(registration.token_endpoint_auth_method).toBe('none');
    expect(registration.grant_types).toContain('refresh_token');

    // --- 2. Authorization request com PKCE do cliente (RFC 7636) ---
    const clientVerifier = randomBytes(48).toString('base64url');
    const clientState = randomBytes(8).toString('hex');

    const { logtoAuthorizeUrl } = await service.startAuthorization(
      {
        clientId: registration.client_id,
        redirectUri: CLIENT_REDIRECT,
        clientState,
        clientCodeChallenge: s256(clientVerifier),
        scope: 'openid profile',
        resource: `${CONFIG.LOGTO_AUDIENCE}/`, // com trailing slash, como clientes MCP mandam
      },
      CALLBACK_URL,
    );

    const authorizeUrl = new URL(logtoAuthorizeUrl);
    expect(authorizeUrl.origin + authorizeUrl.pathname).toBe(`${CONFIG.LOGTO_ENDPOINT}/oidc/auth`);
    expect(authorizeUrl.searchParams.get('code_challenge_method')).toBe('S256');
    expect(authorizeUrl.searchParams.get('client_id')).toBe(CONFIG.LOGTO_MCP_APP_ID);
    expect(authorizeUrl.searchParams.get('redirect_uri')).toBe(CALLBACK_URL);
    // `resource` é normalizado para o identifier exato — trailing slash faz o
    // Logto responder invalid_target.
    expect(authorizeUrl.searchParams.get('resource')).toBe(CONFIG.LOGTO_AUDIENCE);
    // offline_access é obrigatório para o Logto emitir refresh token.
    expect(authorizeUrl.searchParams.get('scope')).toContain('offline_access');

    // O state que mandamos ao Logto é nosso, não o do cliente — o do cliente é
    // devolvido no redirect final.
    const ourState = authorizeUrl.searchParams.get('state');
    expect(ourState).toBeTruthy();
    expect(ourState).not.toBe(clientState);

    // O PKCE que usamos com o Logto é independente do PKCE do cliente.
    const logtoChallenge = authorizeUrl.searchParams.get('code_challenge');
    expect(logtoChallenge).not.toBe(s256(clientVerifier));

    // --- 3. Callback do Logto após o usuário consentir ---
    const logtoCode = `logto_code_${randomBytes(8).toString('hex')}`;
    const { redirectUrl } = await service.handleCallback(ourState!, logtoCode);

    const redirect = new URL(redirectUrl);
    expect(redirect.origin + redirect.pathname).toBe(CLIENT_REDIRECT);
    // O state original do cliente volta, senão o Claude descarta o callback.
    expect(redirect.searchParams.get('state')).toBe(clientState);

    const ourCode = redirect.searchParams.get('code');
    expect(ourCode).toBeTruthy();
    expect(ourCode).not.toBe(logtoCode);

    // --- 4. Token exchange ---
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        access_token: 'jwt-de-acesso',
        refresh_token: 'refresh-token',
        token_type: 'Bearer',
        expires_in: 3600,
      }),
    });

    const tokens = await service.exchangeCode(
      {
        code: ourCode!,
        redirectUri: CLIENT_REDIRECT,
        clientId: registration.client_id,
        codeVerifier: clientVerifier,
      },
      CALLBACK_URL,
    );

    expect(tokens).toMatchObject({ access_token: 'jwt-de-acesso', token_type: 'Bearer' });

    // O que foi realmente enviado ao Logto: o code DELE e o verifier NOSSO.
    const [, requestInit] = fetchMock.mock.calls[0];
    const sent = new URLSearchParams(requestInit.body as string);
    expect(sent.get('grant_type')).toBe('authorization_code');
    expect(sent.get('code')).toBe(logtoCode);
    expect(sent.get('resource')).toBe(CONFIG.LOGTO_AUDIENCE);
    expect(s256(sent.get('code_verifier')!)).toBe(logtoChallenge);

    // --- Estado final no banco ---
    const row = await prisma.mcpOAuthAuthorization.findUnique({ where: { code: ourCode! } });
    expect(row?.consumedAt).toBeTruthy();

    const client = await prisma.mcpOAuthClient.findUnique({
      where: { clientId: registration.client_id },
    });
    expect(client?.lastUsedAt).toBeTruthy();
  }, 30_000);

  it('recusa o segundo uso do mesmo code (one-time use)', async () => {
    const registration = await registerClient();
    const verifier = randomBytes(48).toString('base64url');

    const { logtoAuthorizeUrl } = await service.startAuthorization(
      {
        clientId: registration.client_id,
        redirectUri: CLIENT_REDIRECT,
        clientState: undefined,
        clientCodeChallenge: s256(verifier),
        scope: undefined,
        resource: undefined,
      },
      CALLBACK_URL,
    );
    const state = new URL(logtoAuthorizeUrl).searchParams.get('state')!;
    const { redirectUrl } = await service.handleCallback(state, 'logto-code');
    const code = new URL(redirectUrl).searchParams.get('code')!;

    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ access_token: 'ok' }),
    });

    const exchange = () =>
      service.exchangeCode(
        {
          code,
          redirectUri: CLIENT_REDIRECT,
          clientId: registration.client_id,
          codeVerifier: verifier,
        },
        CALLBACK_URL,
      );

    await expect(exchange()).resolves.toBeDefined();
    // Replay do mesmo code tem de morrer no `consumedAt` gravado no banco.
    await expect(exchange()).rejects.toThrow(UnauthorizedException);
    // E não pode nem chegar ao Logto na segunda vez.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  }, 30_000);

  it('recusa o exchange quando o PKCE do cliente não fecha', async () => {
    const registration = await registerClient();
    const verifier = randomBytes(48).toString('base64url');

    const { logtoAuthorizeUrl } = await service.startAuthorization(
      {
        clientId: registration.client_id,
        redirectUri: CLIENT_REDIRECT,
        clientState: undefined,
        clientCodeChallenge: s256(verifier),
        scope: undefined,
        resource: undefined,
      },
      CALLBACK_URL,
    );
    const state = new URL(logtoAuthorizeUrl).searchParams.get('state')!;
    const { redirectUrl } = await service.handleCallback(state, 'logto-code');
    const code = new URL(redirectUrl).searchParams.get('code')!;

    await expect(
      service.exchangeCode(
        {
          code,
          redirectUri: CLIENT_REDIRECT,
          clientId: registration.client_id,
          codeVerifier: randomBytes(48).toString('base64url'), // verifier de outro
        },
        CALLBACK_URL,
      ),
    ).rejects.toThrow(UnauthorizedException);

    // Interceptar o code sem o verifier não deve nem tocar o Logto.
    expect(fetchMock).not.toHaveBeenCalled();
  }, 30_000);

  it('recusa um code de outro cliente registrado', async () => {
    const victim = await registerClient();
    const attacker = await registerClient();
    const verifier = randomBytes(48).toString('base64url');

    const { logtoAuthorizeUrl } = await service.startAuthorization(
      {
        clientId: victim.client_id,
        redirectUri: CLIENT_REDIRECT,
        clientState: undefined,
        clientCodeChallenge: s256(verifier),
        scope: undefined,
        resource: undefined,
      },
      CALLBACK_URL,
    );
    const state = new URL(logtoAuthorizeUrl).searchParams.get('state')!;
    const { redirectUrl } = await service.handleCallback(state, 'logto-code');
    const code = new URL(redirectUrl).searchParams.get('code')!;

    await expect(
      service.exchangeCode(
        {
          code,
          redirectUri: CLIENT_REDIRECT,
          clientId: attacker.client_id, // mesmo com o verifier certo
          codeVerifier: verifier,
        },
        CALLBACK_URL,
      ),
    ).rejects.toThrow(UnauthorizedException);
  }, 30_000);

  it('recusa o callback repetido para o mesmo state', async () => {
    const registration = await registerClient();

    const { logtoAuthorizeUrl } = await service.startAuthorization(
      {
        clientId: registration.client_id,
        redirectUri: CLIENT_REDIRECT,
        clientState: undefined,
        clientCodeChallenge: s256(randomBytes(48).toString('base64url')),
        scope: undefined,
        resource: undefined,
      },
      CALLBACK_URL,
    );
    const state = new URL(logtoAuthorizeUrl).searchParams.get('state')!;

    await expect(service.handleCallback(state, 'logto-code-1')).resolves.toBeDefined();
    await expect(service.handleCallback(state, 'logto-code-2')).rejects.toThrow();
  }, 30_000);

  describe('higiene das authorizations', () => {
    it('remove as authorizations expiradas ao iniciar uma nova', async () => {
      const registration = await registerClient();

      // Linha vencida, plantada direto no banco.
      const stale = await prisma.mcpOAuthAuthorization.create({
        data: {
          state: `stale-${randomBytes(8).toString('hex')}`,
          clientId: registration.client_id,
          redirectUri: CLIENT_REDIRECT,
          clientCodeChallenge: 'x',
          logtoCodeVerifier: 'y',
          expiresAt: new Date(Date.now() - 60_000),
        },
      });

      await service.startAuthorization(
        {
          clientId: registration.client_id,
          redirectUri: CLIENT_REDIRECT,
          clientState: undefined,
          clientCodeChallenge: s256(randomBytes(48).toString('base64url')),
          scope: undefined,
          resource: undefined,
        },
        CALLBACK_URL,
      );

      const found = await prisma.mcpOAuthAuthorization.findUnique({ where: { id: stale.id } });
      expect(found).toBeNull();
    }, 30_000);

    it('não remove authorizations ainda válidas', async () => {
      const registration = await registerClient();

      const live = await prisma.mcpOAuthAuthorization.create({
        data: {
          state: `live-${randomBytes(8).toString('hex')}`,
          clientId: registration.client_id,
          redirectUri: CLIENT_REDIRECT,
          clientCodeChallenge: 'x',
          logtoCodeVerifier: 'y',
          expiresAt: new Date(Date.now() + 5 * 60_000),
        },
      });

      await service.startAuthorization(
        {
          clientId: registration.client_id,
          redirectUri: CLIENT_REDIRECT,
          clientState: undefined,
          clientCodeChallenge: s256(randomBytes(48).toString('base64url')),
          scope: undefined,
          resource: undefined,
        },
        CALLBACK_URL,
      );

      const found = await prisma.mcpOAuthAuthorization.findUnique({ where: { id: live.id } });
      expect(found).not.toBeNull();
    }, 30_000);
  });
});
