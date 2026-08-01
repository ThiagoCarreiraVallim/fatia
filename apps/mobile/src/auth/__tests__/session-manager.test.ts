import { describe, expect, it, vi } from 'vitest';
import { OidcError, type TokenResponse } from '../oidc';
import { SessionManager, toStoredSession } from '../session-manager';
import type { StoredSession, TokenStore } from '../token-store';

const NOW = 1_800_000_000_000;

function memoryStore(
  initial: StoredSession | null = null,
): TokenStore & { value: StoredSession | null } {
  return {
    value: initial,
    async read() {
      return this.value;
    },
    async write(session) {
      this.value = session;
    },
    async clear() {
      this.value = null;
    },
  };
}

function session(overrides: Partial<StoredSession> = {}): StoredSession {
  return {
    accessToken: 'access-antigo',
    refreshToken: 'refresh-1',
    idToken: 'id-1',
    expiresAt: NOW + 3_600_000,
    ...overrides,
  };
}

function tokenResponse(overrides: Partial<TokenResponse> = {}): TokenResponse {
  return {
    access_token: 'access-novo',
    refresh_token: 'refresh-2',
    id_token: 'id-2',
    expires_in: 3600,
    token_type: 'Bearer',
    ...overrides,
  };
}

function build(opts: {
  store: TokenStore;
  refresh?: ReturnType<typeof vi.fn>;
  onSessionEnded?: () => void;
  now?: number;
}) {
  const onSessionEnded = vi.fn(opts.onSessionEnded);
  const manager = new SessionManager({
    store: opts.store,
    endpoints: async () => ({
      authorizationEndpoint: 'https://auth.exemplo/oidc/auth',
      tokenEndpoint: 'https://auth.exemplo/oidc/token',
      endSessionEndpoint: null,
      userinfoEndpoint: null,
    }),
    clientId: 'app-nativo',
    resource: 'https://api.exemplo',
    onSessionEnded,
    now: () => opts.now ?? NOW,
    refresh: (opts.refresh ?? vi.fn()) as never,
  });
  return { manager, onSessionEnded };
}

describe('SessionManager', () => {
  it('devolve null quando não há nada no cofre', async () => {
    const { manager } = build({ store: memoryStore(null) });
    await expect(manager.getAccessToken()).resolves.toBeNull();
  });

  it('devolve o token guardado enquanto ele estiver válido, sem ir à rede', async () => {
    const refresh = vi.fn();
    const { manager } = build({ store: memoryStore(session()), refresh });
    await expect(manager.getAccessToken()).resolves.toBe('access-antigo');
    expect(refresh).not.toHaveBeenCalled();
  });

  it('renova antes de expirar de fato — um token com 30 s de vida não sobrevive à requisição', async () => {
    const refresh = vi.fn().mockResolvedValue(tokenResponse());
    const { manager } = build({
      store: memoryStore(session({ expiresAt: NOW + 30_000 })),
      refresh,
    });
    await expect(manager.getAccessToken()).resolves.toBe('access-novo');
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('renova uma vez só quando várias telas pedem token ao mesmo tempo', async () => {
    // É o caso da tela de progresso: cinco gráficos, cinco queries simultâneas.
    // Com rotação de refresh token, cinco refreshes fariam quatro falharem com
    // invalid_grant e derrubariam a sessão.
    let resolveRefresh!: (value: TokenResponse) => void;
    const refreshed = new Promise<TokenResponse>((resolve) => {
      resolveRefresh = resolve;
    });
    const refresh = vi.fn(() => refreshed);
    const { manager } = build({
      store: memoryStore(session({ expiresAt: NOW - 1 })),
      refresh,
    });

    const pending = Promise.all([
      manager.getAccessToken(),
      manager.getAccessToken(),
      manager.getAccessToken(),
      manager.getAccessToken(),
      manager.getAccessToken(),
    ]);
    resolveRefresh(tokenResponse());

    await expect(pending).resolves.toEqual([
      'access-novo',
      'access-novo',
      'access-novo',
      'access-novo',
      'access-novo',
    ]);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('preserva o refresh token antigo quando a resposta não traz um novo', async () => {
    const store = memoryStore(session({ expiresAt: NOW - 1 }));
    const refresh = vi.fn().mockResolvedValue(tokenResponse({ refresh_token: undefined }));
    const { manager } = build({ store, refresh });
    await manager.getAccessToken();
    expect(store.value?.refreshToken).toBe('refresh-1');
  });

  it('encerra a sessão quando o refresh token morreu', async () => {
    const store = memoryStore(session({ expiresAt: NOW - 1 }));
    const refresh = vi.fn().mockRejectedValue(new OidcError('invalid_grant', 'expirado'));
    const { manager, onSessionEnded } = build({ store, refresh });

    await expect(manager.getAccessToken()).resolves.toBeNull();
    expect(store.value).toBeNull();
    expect(onSessionEnded).toHaveBeenCalledTimes(1);
  });

  it('não derruba a sessão quando o refresh falha por rede', async () => {
    // Treinar no subsolo da academia não pode custar o login.
    const store = memoryStore(session({ expiresAt: NOW - 1 }));
    const refresh = vi.fn().mockRejectedValue(new TypeError('Network request failed'));
    const { manager, onSessionEnded } = build({ store, refresh });

    await expect(manager.getAccessToken()).resolves.toBe('access-antigo');
    expect(store.value).not.toBeNull();
    expect(onSessionEnded).not.toHaveBeenCalled();
  });

  it('encerra a sessão se o token venceu e não há refresh token', async () => {
    const store = memoryStore(session({ expiresAt: NOW - 1, refreshToken: null }));
    const { manager, onSessionEnded } = build({ store });
    await expect(manager.getAccessToken()).resolves.toBeNull();
    expect(onSessionEnded).toHaveBeenCalledTimes(1);
    expect(store.value).toBeNull();
  });

  it('limpa o cofre no logout', async () => {
    const store = memoryStore(session());
    const { manager } = build({ store });
    await manager.restore();
    await manager.clear();
    expect(store.value).toBeNull();
    expect(manager.current).toBeNull();
  });

  it('volta a renovar depois de um refresh concluído — a promessa não fica presa', async () => {
    const store = memoryStore(session({ expiresAt: NOW - 1 }));
    const refresh = vi
      .fn()
      .mockResolvedValueOnce(tokenResponse({ expires_in: 0 }))
      .mockResolvedValueOnce(tokenResponse({ access_token: 'access-terceiro' }));
    const { manager } = build({ store, refresh });

    await expect(manager.getAccessToken()).resolves.toBe('access-novo');
    await expect(manager.getAccessToken()).resolves.toBe('access-terceiro');
    expect(refresh).toHaveBeenCalledTimes(2);
  });
});

describe('toStoredSession', () => {
  it('converte expires_in em instante absoluto', () => {
    expect(toStoredSession(tokenResponse({ expires_in: 120 }), NOW)).toEqual({
      accessToken: 'access-novo',
      refreshToken: 'refresh-2',
      idToken: 'id-2',
      expiresAt: NOW + 120_000,
    });
  });
});
