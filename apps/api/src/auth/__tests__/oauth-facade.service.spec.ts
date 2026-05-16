import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { OAuthFacadeService } from '../oauth-facade.service';
import type { PrismaService } from '../../common/prisma.service';
import type { ConfigService } from '@nestjs/config';

type MockPrisma = {
  mcpOAuthClient: {
    create: jest.Mock;
    findUnique: jest.Mock;
    update: jest.Mock;
  };
  mcpOAuthAuthorization: {
    create: jest.Mock;
    findUnique: jest.Mock;
    update: jest.Mock;
  };
};

const makePrisma = (): MockPrisma => ({
  mcpOAuthClient: { create: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
  mcpOAuthAuthorization: { create: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
});

const CONFIG = {
  LOGTO_ENDPOINT: 'https://logto.example.com',
  LOGTO_AUDIENCE: 'https://api.example.com',
  LOGTO_MCP_APP_ID: 'app-id',
  LOGTO_MCP_APP_SECRET: 'app-secret',
};

const makeConfig = (overrides: Partial<typeof CONFIG> = {}): ConfigService => {
  const values = { ...CONFIG, ...overrides };
  return {
    getOrThrow: jest.fn((key: keyof typeof CONFIG) => values[key]),
  } as unknown as ConfigService;
};

const s256 = (verifier: string) => createHash('sha256').update(verifier).digest('base64url');

describe('OAuthFacadeService', () => {
  let prisma: MockPrisma;
  let service: OAuthFacadeService;
  const fetchMock = jest.fn();

  beforeEach(() => {
    prisma = makePrisma();
    service = new OAuthFacadeService(prisma as unknown as PrismaService, makeConfig());
    fetchMock.mockReset();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  describe('registerClient (Dynamic Client Registration)', () => {
    it('rejects when redirect_uris is empty', async () => {
      await expect(service.registerClient({ redirectUris: [] })).rejects.toThrow(
        BadRequestException,
      );
    });

    it('rejects when any redirect_uri is not a valid URL', async () => {
      await expect(service.registerClient({ redirectUris: ['not-a-url'] })).rejects.toThrow(
        BadRequestException,
      );
    });

    it('persists the client with a mcp_<hex> client_id and returns DCR metadata', async () => {
      prisma.mcpOAuthClient.create.mockImplementation(({ data }) =>
        Promise.resolve({ ...data, clientName: data.clientName ?? null }),
      );

      const result = await service.registerClient({
        redirectUris: ['https://app.example.com/cb'],
        clientName: 'Test MCP Client',
      });

      const persisted = prisma.mcpOAuthClient.create.mock.calls[0][0].data;
      expect(persisted.clientId).toMatch(/^mcp_[0-9a-f]{32}$/);
      expect(persisted.redirectUris).toEqual(['https://app.example.com/cb']);
      expect(result.client_id).toBe(persisted.clientId);
      expect(result.token_endpoint_auth_method).toBe('none');
      expect(result.grant_types).toEqual(['authorization_code', 'refresh_token']);
    });
  });

  describe('startAuthorization', () => {
    const baseClient = {
      clientId: 'mcp_xxx',
      redirectUris: ['https://app.example.com/cb'],
    };

    it('rejects when the client_id is unknown', async () => {
      prisma.mcpOAuthClient.findUnique.mockResolvedValue(null);

      await expect(
        service.startAuthorization(
          {
            clientId: 'mcp_unknown',
            redirectUri: 'https://app.example.com/cb',
            clientState: 'st',
            clientCodeChallenge: 'cc',
            scope: undefined,
            resource: undefined,
          },
          'https://api.example.com/oauth/callback',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects when redirect_uri was not registered for this client', async () => {
      prisma.mcpOAuthClient.findUnique.mockResolvedValue(baseClient);

      await expect(
        service.startAuthorization(
          {
            clientId: 'mcp_xxx',
            redirectUri: 'https://evil.example.com/cb',
            clientState: 'st',
            clientCodeChallenge: 'cc',
            scope: undefined,
            resource: undefined,
          },
          'https://api.example.com/oauth/callback',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects when code_challenge is missing (PKCE is mandatory)', async () => {
      prisma.mcpOAuthClient.findUnique.mockResolvedValue(baseClient);

      await expect(
        service.startAuthorization(
          {
            clientId: 'mcp_xxx',
            redirectUri: 'https://app.example.com/cb',
            clientState: 'st',
            clientCodeChallenge: '',
            scope: undefined,
            resource: undefined,
          },
          'https://api.example.com/oauth/callback',
        ),
      ).rejects.toThrow(/PKCE/);
    });

    it('persists the authorization row and returns a Logto authorize URL with our state and S256 challenge', async () => {
      prisma.mcpOAuthClient.findUnique.mockResolvedValue(baseClient);
      prisma.mcpOAuthAuthorization.create.mockResolvedValue({});

      const { logtoAuthorizeUrl } = await service.startAuthorization(
        {
          clientId: 'mcp_xxx',
          redirectUri: 'https://app.example.com/cb',
          clientState: 'client-state',
          clientCodeChallenge: 'client-challenge-from-mcp',
          scope: 'profile email',
          resource: 'ignored-by-resolveResource',
        },
        'https://api.example.com/oauth/callback',
      );

      const url = new URL(logtoAuthorizeUrl);
      expect(url.origin + url.pathname).toBe('https://logto.example.com/oidc/auth');
      expect(url.searchParams.get('response_type')).toBe('code');
      expect(url.searchParams.get('client_id')).toBe('app-id');
      expect(url.searchParams.get('redirect_uri')).toBe('https://api.example.com/oauth/callback');
      expect(url.searchParams.get('code_challenge_method')).toBe('S256');
      expect(url.searchParams.get('resource')).toBe('https://api.example.com');
      const scopes = (url.searchParams.get('scope') ?? '').split(' ').sort();
      expect(scopes).toEqual(['email', 'offline_access', 'openid', 'profile']);

      expect(url.searchParams.get('state')).not.toBe('client-state');
      const persisted = prisma.mcpOAuthAuthorization.create.mock.calls[0][0].data;
      expect(persisted.state).toBe(url.searchParams.get('state'));
      expect(persisted.clientCodeChallenge).toBe('client-challenge-from-mcp');
      expect(persisted.expiresAt.getTime()).toBeGreaterThan(Date.now());
    });
  });

  describe('handleCallback', () => {
    it('rejects unknown state', async () => {
      prisma.mcpOAuthAuthorization.findUnique.mockResolvedValue(null);

      await expect(service.handleCallback('bogus', 'logto-code')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('rejects expired authorization requests', async () => {
      prisma.mcpOAuthAuthorization.findUnique.mockResolvedValue({
        id: 'a1',
        expiresAt: new Date(Date.now() - 1000),
        logtoCode: null,
        clientState: null,
        redirectUri: 'https://app.example.com/cb',
      });

      await expect(service.handleCallback('state', 'logto-code')).rejects.toThrow(/expired/);
    });

    it('rejects when the callback has already been consumed', async () => {
      prisma.mcpOAuthAuthorization.findUnique.mockResolvedValue({
        id: 'a1',
        expiresAt: new Date(Date.now() + 60_000),
        logtoCode: 'already-set',
        clientState: null,
        redirectUri: 'https://app.example.com/cb',
      });

      await expect(service.handleCallback('state', 'logto-code')).rejects.toThrow(/consumed/);
    });

    it('persists the logto code, mints our own code, and redirects to the registered URI', async () => {
      prisma.mcpOAuthAuthorization.findUnique.mockResolvedValue({
        id: 'a1',
        expiresAt: new Date(Date.now() + 60_000),
        logtoCode: null,
        clientState: 'cli-st',
        redirectUri: 'https://app.example.com/cb',
      });

      const { redirectUrl } = await service.handleCallback('state', 'logto-auth-code');

      const update = prisma.mcpOAuthAuthorization.update.mock.calls[0][0];
      expect(update.data.logtoCode).toBe('logto-auth-code');
      expect(update.data.code).toMatch(/^[A-Za-z0-9_-]+$/);

      const url = new URL(redirectUrl);
      expect(url.origin + url.pathname).toBe('https://app.example.com/cb');
      expect(url.searchParams.get('code')).toBe(update.data.code);
      expect(url.searchParams.get('state')).toBe('cli-st');
    });
  });

  describe('exchangeCode', () => {
    const verifier = 'a'.repeat(64);
    const challenge = s256(verifier);
    const validRow = {
      id: 'a1',
      logtoCode: 'logto-auth-code',
      consumedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
      clientId: 'mcp_xxx',
      redirectUri: 'https://app.example.com/cb',
      clientCodeChallenge: challenge,
      logtoCodeVerifier: 'logto-verifier',
      resource: null,
    };

    const validParams = {
      code: 'our-code',
      redirectUri: 'https://app.example.com/cb',
      clientId: 'mcp_xxx',
      codeVerifier: verifier,
    };

    it('rejects when the code is unknown or has no logtoCode', async () => {
      prisma.mcpOAuthAuthorization.findUnique.mockResolvedValue(null);

      await expect(
        service.exchangeCode(validParams, 'https://api.example.com/oauth/callback'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('rejects already-used codes', async () => {
      prisma.mcpOAuthAuthorization.findUnique.mockResolvedValue({
        ...validRow,
        consumedAt: new Date(),
      });

      await expect(
        service.exchangeCode(validParams, 'https://api.example.com/oauth/callback'),
      ).rejects.toThrow(/already used/);
    });

    it('rejects expired codes', async () => {
      prisma.mcpOAuthAuthorization.findUnique.mockResolvedValue({
        ...validRow,
        expiresAt: new Date(Date.now() - 1000),
      });

      await expect(
        service.exchangeCode(validParams, 'https://api.example.com/oauth/callback'),
      ).rejects.toThrow(/expired/);
    });

    it('rejects client_id mismatch', async () => {
      prisma.mcpOAuthAuthorization.findUnique.mockResolvedValue(validRow);

      await expect(
        service.exchangeCode(
          { ...validParams, clientId: 'mcp_other' },
          'https://api.example.com/oauth/callback',
        ),
      ).rejects.toThrow(/client_id mismatch/);
    });

    it('rejects redirect_uri mismatch', async () => {
      prisma.mcpOAuthAuthorization.findUnique.mockResolvedValue(validRow);

      await expect(
        service.exchangeCode(
          { ...validParams, redirectUri: 'https://other.example.com/cb' },
          'https://api.example.com/oauth/callback',
        ),
      ).rejects.toThrow(/redirect_uri mismatch/);
    });

    it('rejects PKCE failure (verifier does not match stored challenge)', async () => {
      prisma.mcpOAuthAuthorization.findUnique.mockResolvedValue(validRow);

      await expect(
        service.exchangeCode(
          { ...validParams, codeVerifier: 'b'.repeat(64) },
          'https://api.example.com/oauth/callback',
        ),
      ).rejects.toThrow(/PKCE/);
    });

    it('exchanges code with Logto, marks row consumed, and returns the token response', async () => {
      prisma.mcpOAuthAuthorization.findUnique.mockResolvedValue(validRow);
      const tokenResponse = {
        access_token: 'logto-access',
        refresh_token: 'logto-refresh',
        token_type: 'Bearer',
        expires_in: 3600,
      };
      fetchMock.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => tokenResponse,
      });

      const result = await service.exchangeCode(
        validParams,
        'https://api.example.com/oauth/callback',
      );

      expect(result).toEqual(tokenResponse);
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe('https://logto.example.com/oidc/token');
      expect(init.method).toBe('POST');
      expect(init.headers.Authorization).toBe(
        `Basic ${Buffer.from('app-id:app-secret').toString('base64')}`,
      );
      const body = new URLSearchParams(init.body as string);
      expect(body.get('grant_type')).toBe('authorization_code');
      expect(body.get('code')).toBe('logto-auth-code');
      expect(body.get('code_verifier')).toBe('logto-verifier');

      expect(prisma.mcpOAuthAuthorization.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'a1' },
          data: expect.objectContaining({ consumedAt: expect.any(Date) }),
        }),
      );
      expect(prisma.mcpOAuthClient.update).toHaveBeenCalled();
    });

    it('throws UnauthorizedException when Logto returns a non-ok response', async () => {
      prisma.mcpOAuthAuthorization.findUnique.mockResolvedValue(validRow);
      fetchMock.mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({ error: 'invalid_grant', error_description: 'expired code' }),
      });

      await expect(
        service.exchangeCode(validParams, 'https://api.example.com/oauth/callback'),
      ).rejects.toThrow(/expired code/);
    });
  });

  describe('refreshToken', () => {
    it('calls Logto with grant_type=refresh_token and forwards the audience', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ access_token: 'new-access' }),
      });

      const result = await service.refreshToken({ refreshToken: 'old-refresh' });

      expect(result).toEqual({ access_token: 'new-access' });
      const body = new URLSearchParams(fetchMock.mock.calls[0][1].body as string);
      expect(body.get('grant_type')).toBe('refresh_token');
      expect(body.get('refresh_token')).toBe('old-refresh');
      expect(body.get('resource')).toBe('https://api.example.com');
    });

    it('omits scope from the request when not provided', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ access_token: 'x' }),
      });

      await service.refreshToken({ refreshToken: 'r' });

      const body = new URLSearchParams(fetchMock.mock.calls[0][1].body as string);
      expect(body.has('scope')).toBe(false);
    });
  });
});
