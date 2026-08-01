import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
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

const SCOPES = ['openid', 'profile', 'email', 'offline_access'];

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

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [error, setError] = useState<string | null>(null);
  const discoveryRef = useRef<Promise<OidcEndpoints> | null>(null);

  const endpoints = useCallback(() => {
    // Uma descoberta por execução do app: o documento OIDC não muda entre telas
    // e cada leitura é uma ida à rede antes de qualquer coisa útil aparecer.
    discoveryRef.current ??= discover(env.logtoEndpoint);
    return discoveryRef.current;
  }, []);

  const manager = useMemo(
    () =>
      new SessionManager({
        store: secureTokenStore,
        endpoints,
        clientId: env.logtoAppId,
        resource: env.logtoAudience,
        onSessionEnded: () => setStatus('signedOut'),
      }),
    [endpoints],
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
  }, [endpoints, manager]);

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
  }, [endpoints, manager]);

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
