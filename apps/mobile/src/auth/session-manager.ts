import { OidcError, refreshTokens, type OidcEndpoints, type TokenResponse } from './oidc';
import type { StoredSession, TokenStore } from './token-store';

/**
 * Renova o token com uma folga: um access token que vence em 20 segundos
 * atravessa a requisição e chega expirado do outro lado. A folga transforma isso
 * numa renovação em vez de um 401.
 */
const EXPIRY_SKEW_MS = 60_000;

export interface SessionManagerDeps {
  store: TokenStore;
  endpoints: () => Promise<OidcEndpoints>;
  clientId: string;
  resource: string;
  /** Chamado quando a sessão morre de vez e só um login novo resolve. */
  onSessionEnded: () => void;
  now?: () => number;
  refresh?: typeof refreshTokens;
}

export function toStoredSession(res: TokenResponse, now: number): StoredSession {
  return {
    accessToken: res.access_token,
    refreshToken: res.refresh_token ?? null,
    idToken: res.id_token ?? null,
    expiresAt: now + res.expires_in * 1000,
  };
}

/**
 * Dona do ciclo de vida do token: lê do cofre, decide se ainda vale, renova
 * quando não vale mais.
 *
 * O ponto delicado é concorrência. A tela de progresso dispara cinco queries de
 * uma vez; se todas encontrarem o token vencido, todas pedem refresh. Com
 * rotação de refresh token — que o Logto faz — a primeira resposta invalida o
 * token que as outras quatro estão usando, e elas voltam `invalid_grant`. O
 * resultado é o usuário ser deslogado no meio da tela por ter aberto uma tela
 * com muitos gráficos.
 *
 * Por isso existe `inFlight`: a primeira chamada renova, as demais aguardam a
 * mesma promessa. O PWA tem a mesma classe de problema — foi o motivo de a #128
 * buscar todas as metas numa query só em vez de três em paralelo.
 */
export class SessionManager {
  private cached: StoredSession | null = null;
  private inFlight: Promise<string | null> | null = null;
  private readonly now: () => number;
  private readonly refresh: typeof refreshTokens;

  constructor(private readonly deps: SessionManagerDeps) {
    this.now = deps.now ?? (() => Date.now());
    this.refresh = deps.refresh ?? refreshTokens;
  }

  /** Carrega o que estiver no cofre. Chamado na abertura do app. */
  async restore(): Promise<StoredSession | null> {
    this.cached = await this.deps.store.read();
    return this.cached;
  }

  async adopt(session: StoredSession): Promise<void> {
    this.cached = session;
    await this.deps.store.write(session);
  }

  async clear(): Promise<void> {
    this.cached = null;
    this.inFlight = null;
    await this.deps.store.clear();
  }

  get current(): StoredSession | null {
    return this.cached;
  }

  private isFresh(session: StoredSession): boolean {
    return session.expiresAt - EXPIRY_SKEW_MS > this.now();
  }

  /**
   * Devolve um access token válido, ou `null` se não há sessão. Nunca lança por
   * falha de rede — um refresh que falha por conexão ruim não é motivo para
   * derrubar a sessão.
   */
  async getAccessToken(): Promise<string | null> {
    if (!this.cached) this.cached = await this.deps.store.read();
    const session = this.cached;
    if (!session) return null;
    if (this.isFresh(session)) return session.accessToken;
    if (!session.refreshToken) {
      await this.endSession();
      return null;
    }
    if (this.inFlight) return this.inFlight;

    this.inFlight = this.doRefresh(session.refreshToken).finally(() => {
      this.inFlight = null;
    });
    return this.inFlight;
  }

  private async doRefresh(refreshToken: string): Promise<string | null> {
    try {
      const { tokenEndpoint } = await this.deps.endpoints();
      const res = await this.refresh(tokenEndpoint, {
        clientId: this.deps.clientId,
        refreshToken,
        resource: this.deps.resource,
      });
      const session = toStoredSession(res, this.now());
      // O Logto faz rotação: se a resposta vier sem refresh token novo, o antigo
      // continua valendo e precisa ser preservado — descartá-lo aqui derrubaria
      // a sessão na renovação seguinte.
      if (!session.refreshToken) session.refreshToken = refreshToken;
      await this.adopt(session);
      return session.accessToken;
    } catch (err) {
      if (err instanceof OidcError && err.requiresReauthentication) {
        await this.endSession();
        return null;
      }
      // Falha transitória: mantém o que está guardado e devolve o token vencido.
      // A API responde 401 e a tela mostra erro, mas a sessão sobrevive ao túnel.
      return this.cached?.accessToken ?? null;
    }
  }

  private async endSession(): Promise<void> {
    await this.clear();
    this.deps.onSessionEnded();
  }
}
