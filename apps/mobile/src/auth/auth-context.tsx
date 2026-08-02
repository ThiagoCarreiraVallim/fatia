import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import { env } from '@/env';
import { discover, exchangeCode, type OidcEndpoints } from './oidc';
import { SessionManager, toStoredSession } from './session-manager';
import { secureTokenStore } from './token-store';

// Fecha a aba do navegador do sistema assim que o callback volta. Sem isto, no
// Android a Custom Tab fica aberta atrás do app.
WebBrowser.maybeCompleteAuthSession();

/**
 * Caminho de retorno do login. Precisa estar cadastrado como Redirect URI na
 * Application do tipo Native no Logto, exatamente assim: `fatia://auth/callback`.
 */
const REDIRECT_PATH = 'auth/callback';

/**
 * O mínimo que o app precisa, e nada além.
 *
 * `openid` traz o `sub`, que é como a API resolve a identidade; `offline_access`
 * traz o refresh token. **`profile` e `email` ficam de fora de propósito**: o app
 * nunca lê claim de ID token — o perfil vem de `usersApi.me()`, da nossa própria
 * base — e a API provisiona a partir do `sub`, com fallback quando não há e-mail
 * (`user-provisioning.service.ts`).
 *
 * Pedir escopo que não se usa é pedir ao usuário permissão para dado que não vai
 * ser lido, e é uma tela de consentimento a mais sem contrapartida.
 */
const SCOPES = ['openid', 'offline_access'];

export type AuthStatus = 'loading' | 'signedIn' | 'signedOut';

interface AuthContextValue {
  status: AuthStatus;
  /** Abre o navegador do sistema e conclui o login. */
  signIn(): Promise<void>;
  signOut(): Promise<void>;
  /** Token válido para a API, renovando se preciso. */
  getAccessToken(): Promise<string | null>;
  /** Mensagem do último erro de login, para a tela mostrar. */
  error: string | null;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * Uma descoberta por execução do app: o documento OIDC não muda entre telas e
 * cada leitura é uma ida à rede antes de qualquer coisa útil aparecer.
 *
 * O cache mora no módulo, e não num `useRef` dentro do provider, porque o
 * endereço descoberto vem de `env.logtoEndpoint` — constante de módulo, sem nada
 * de por-instância. Guardar em ref também fazia o `react-hooks/refs` v7 acusar
 * leitura de ref durante o render: a regra não enxerga dentro do construtor do
 * `SessionManager` e assume que ele poderia chamar `endpoints()` ali. Não chama
 * (`session-manager.ts` só guarda as deps), mas tirar o ref resolve o aviso sem
 * depender dessa aposta.
 */
let discovery: Promise<OidcEndpoints> | null = null;

function endpoints(): Promise<OidcEndpoints> {
  discovery ??= discover(env.logtoEndpoint);
  return discovery;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [error, setError] = useState<string | null>(null);

  const manager = useMemo(
    () =>
      new SessionManager({
        store: secureTokenStore,
        endpoints,
        clientId: env.logtoAppId,
        resource: env.logtoAudience,
        onSessionEnded: () => setStatus('signedOut'),
      }),
    [],
  );

  useEffect(() => {
    let cancelled = false;
    manager
      .restore()
      .then((session) => {
        if (!cancelled) setStatus(session ? 'signedIn' : 'signedOut');
      })
      .catch(() => {
        if (!cancelled) setStatus('signedOut');
      });
    return () => {
      cancelled = true;
    };
  }, [manager]);

  const signIn = useCallback(async () => {
    setError(null);
    try {
      const discovery = await endpoints();
      const redirectUri = AuthSession.makeRedirectUri({ scheme: 'fatia', path: REDIRECT_PATH });

      // No Expo Go o redirect NÃO é `fatia://auth/callback` — é um `exp://` com
      // o IP da máquina, que muda de rede para rede. Se ele não estiver
      // cadastrado no Logto, o login falha com `invalid_redirect_uri` e a
      // mensagem não diz qual URI tentou. Imprimir aqui é o caminho mais curto
      // entre o erro e a linha a colar no console do Logto.
      if (__DEV__) console.log('[auth] redirect_uri:', redirectUri);

      const request = new AuthSession.AuthRequest({
        clientId: env.logtoAppId,
        redirectUri,
        scopes: SCOPES,
        usePKCE: true,
        codeChallengeMethod: AuthSession.CodeChallengeMethod.S256,
        // RFC 8707: sem isto o Logto emite um token opaco de userinfo em vez de
        // um JWT com a audience da API, e toda chamada volta 401.
        extraParams: { resource: env.logtoAudience },
      });

      // `promptAsync` usa ASWebAuthenticationSession no iOS e Custom Tabs no
      // Android — o navegador do sistema, com os cookies e o gerenciador de
      // senhas da pessoa. Nunca WebView embutida: dentro dela o app conseguiria
      // ler o que foi digitado na tela de login.
      const result = await request.promptAsync({
        authorizationEndpoint: discovery.authorizationEndpoint,
      });

      if (result.type === 'dismiss' || result.type === 'cancel') return;
      if (result.type !== 'success') {
        setError(
          result.type === 'error'
            ? (result.error?.message ?? 'Falha ao autenticar')
            : 'Falha ao autenticar',
        );
        return;
      }

      const tokens = await exchangeCode(discovery.tokenEndpoint, {
        clientId: env.logtoAppId,
        code: result.params.code,
        codeVerifier: request.codeVerifier ?? '',
        redirectUri,
        resource: env.logtoAudience,
      });

      await manager.adopt(toStoredSession(tokens, Date.now()));
      setStatus('signedIn');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao autenticar');
    }
  }, [manager]);

  const signOut = useCallback(async () => {
    // Limpa o cofre primeiro. Se a chamada ao Logto falhar por rede, o token
    // local já saiu — sair pela metade é pior que sair sem avisar o servidor.
    const idToken = manager.current?.idToken ?? null;
    await manager.clear();
    setStatus('signedOut');
    try {
      const { endSessionEndpoint } = await endpoints();
      if (endSessionEndpoint && idToken) {
        const url = new URL(endSessionEndpoint);
        url.searchParams.set('id_token_hint', idToken);
        url.searchParams.set(
          'post_logout_redirect_uri',
          AuthSession.makeRedirectUri({ scheme: 'fatia', path: REDIRECT_PATH }),
        );
        await WebBrowser.openAuthSessionAsync(url.toString(), null);
      }
    } catch {
      // Sessão local já está limpa; falhar aqui não muda o estado do app.
    }
  }, [manager]);

  const getAccessToken = useCallback(() => manager.getAccessToken(), [manager]);

  const value = useMemo(
    () => ({ status, signIn, signOut, getAccessToken, error }),
    [status, signIn, signOut, getAccessToken, error],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth precisa estar dentro de <AuthProvider>');
  return ctx;
}
