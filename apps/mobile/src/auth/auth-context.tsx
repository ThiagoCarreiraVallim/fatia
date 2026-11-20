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
import { fetch as expoFetch } from 'expo/fetch';
import * as AuthSession from 'expo-auth-session';
import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import * as WebBrowser from 'expo-web-browser';
import {
  DEFAULT_PASSWORD_POLICY,
  ExperienceError,
  buildNativeAuthorizeUrl,
  completePasswordReset,
  completeSignup,
  createExperienceClient,
  requestPasswordResetCode,
  requestSignupCode,
  signInWithPassword as signInWithPasswordFlow,
  socialTargets,
  type ExperienceClient,
  type PasswordPolicy,
  type PendingCode,
  type PublicSignInExperience,
  type SocialTarget,
} from '@fatia/api-client';
import { signInExtraParams } from './sign-in-params';
import { env } from '@/env';
import { discover, exchangeCode, memoizeDiscovery, revokeToken } from './oidc';
import { makePkce, type Pkce } from './pkce';
import { SessionManager, toStoredSession } from './session-manager';
import { secureTokenStore } from './token-store';
import { sairDaLoja } from '@/billing/purchases';

// Fecha a aba do navegador do sistema assim que o callback volta (login social).
WebBrowser.maybeCompleteAuthSession();

/**
 * Caminho de retorno do login. Precisa estar cadastrado como Redirect URI na
 * Application do tipo Native no Logto: `fatia://auth/callback`.
 *
 * No login dentro do app (ADR 050) este endereço nunca é aberto — a resposta é
 * um `form_post` lido pelo `fetch` —, mas o Logto confere que ele está
 * cadastrado, então é sempre o mesmo, também no Expo Go.
 */
const REDIRECT_PATH = 'auth/callback';
const NATIVE_REDIRECT_URI = 'fatia://auth/callback';

/**
 * Escopos do login social (navegador). `profile` e `email` entram para o ID
 * token trazer o e-mail e o nome reais, que a API grava (`/users/me/identity`).
 */
const SOCIAL_SCOPES = ['openid', 'offline_access', 'profile', 'email'];

/** Como a sessão foi aberta: o social deixa sessão no navegador do sistema. */
const VIA_KEY = 'fatia.authVia';

export type AuthStatus = 'loading' | 'signedIn' | 'signedOut';
export type { SocialTarget } from '@fatia/api-client';

interface AuthContextValue {
  status: AuthStatus;
  /** Política de senha e conectores sociais do Logto (página pública). */
  passwordPolicy: PasswordPolicy;
  socialTargets: SocialTarget[];
  signInWithPassword(email: string, password: string): Promise<void>;
  /** Cadastro, parte 1: manda o código ao e-mail. */
  startSignup(email: string): Promise<void>;
  /** Cadastro, parte 2: código, senha e nome; entra na conta. */
  finishSignup(input: { code: string; password: string; name: string }): Promise<void>;
  startPasswordReset(email: string): Promise<void>;
  /** Troca a senha; sem sessão, já entra com a senha nova. */
  finishPasswordReset(input: { code: string; password: string }): Promise<void>;
  /** Google e Apple: o navegador só para o consentimento do provedor. */
  signInWithSocial(target: SocialTarget): Promise<void>;
  signOut(): Promise<void>;
  getAccessToken(): Promise<string | null>;
  /**
   * O último ID token recém-emitido (login ou refresh), para a API gravar
   * e-mail e nome reais (ADR 050). O que volta do cofre na abertura do app não
   * entra: depois de uma troca de e-mail ele traz o e-mail velho.
   */
  freshIdentity: FreshIdentity | null;
  /** O nome digitado no cadastro, uma vez. */
  takeSignupName(): string | null;
  /** Renova os tokens agora (depois da troca de e-mail). */
  refreshSession(): Promise<void>;
  /** Mensagem do último erro do login social, para a tela mostrar. */
  error: string | null;
}

export interface FreshIdentity {
  idToken: string;
  /** Sobe a cada token novo, para o mesmo token não ser mandado duas vezes. */
  version: number;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const endpoints = memoizeDiscovery(() => discover(env.logtoEndpoint));

const newPkce = () =>
  makePkce({
    randomBytes: (n) => Crypto.getRandomBytes(n),
    sha256Base64: (value) =>
      Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, value, {
        encoding: Crypto.CryptoEncoding.BASE64,
      }),
  });

async function loadExperience(): Promise<PublicSignInExperience> {
  const res = await fetch(`${env.logtoEndpoint}/api/.well-known/sign-in-exp`, {
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`sign-in-exp ${res.status}`);
  return (await res.json()) as PublicSignInExperience;
}

/** Uma interação de cadastro ou recuperação em curso, entre as duas telas. */
interface PendingFlow {
  client: ExperienceClient;
  pending: PendingCode;
  pkce: Pkce;
}

export function AuthProvider({
  children,
  onSignedOut,
}: {
  children: ReactNode;
  /** Ao sair: o cache de queries não pode passar para a próxima conta. */
  onSignedOut?: () => void;
}) {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [error, setError] = useState<string | null>(null);
  const [experience, setExperience] = useState<PublicSignInExperience | null>(null);
  const signup = useRef<PendingFlow | null>(null);
  const reset = useRef<PendingFlow | null>(null);
  const signupName = useRef<string | null>(null);
  /** O ID token novo mais recente: o `IdentitySync` reage a ele. */
  const [freshIdentity, setFreshIdentity] = useState<FreshIdentity | null>(null);
  const announce = useCallback((idToken: string | null) => {
    if (!idToken) return;
    setFreshIdentity((prev) => ({ idToken, version: (prev?.version ?? 0) + 1 }));
  }, []);

  const manager = useMemo(
    () =>
      new SessionManager({
        store: secureTokenStore,
        endpoints,
        clientId: env.logtoAppId,
        resource: env.logtoAudience,
        onSessionEnded: () => setStatus('signedOut'),
        onTokens: (session) => announce(session.idToken),
      }),
    [announce],
  );

  useEffect(() => {
    let cancelled = false;
    manager
      .restore()
      .then((session) => {
        if (cancelled) return;
        setStatus(session ? 'signedIn' : 'signedOut');
      })
      .catch(() => {
        if (!cancelled) setStatus('signedOut');
      });
    loadExperience()
      .then((exp) => {
        if (!cancelled) setExperience(exp);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [manager]);

  // Ao sair (por botão ou porque a sessão morreu), o cache de queries da conta
  // anterior não pode aparecer para a próxima.
  useEffect(() => {
    if (status === 'signedOut') onSignedOut?.();
  }, [status, onSignedOut]);

  const authorizeUrl = useCallback(async (pkce: Pkce) => {
    const discovery = await endpoints();
    return buildNativeAuthorizeUrl({
      authorizationEndpoint: discovery.authorizationEndpoint,
      clientId: env.logtoAppId,
      redirectUri: NATIVE_REDIRECT_URI,
      codeChallenge: pkce.challenge,
      state: pkce.state,
      resource: env.logtoAudience,
    });
  }, []);

  /** Troca o `code` do `form_post` pelos tokens e abre a sessão. */
  const finish = useCallback(
    async (pkce: Pkce, result: { code: string; state: string }, via: 'app' | 'browser') => {
      if (result.state !== pkce.state) throw new ExperienceError('oidc.state_mismatch', 400);
      const discovery = await endpoints();
      const tokens = await exchangeCode(discovery.tokenEndpoint, {
        clientId: env.logtoAppId,
        code: result.code,
        codeVerifier: pkce.verifier,
        redirectUri: NATIVE_REDIRECT_URI,
        resource: env.logtoAudience,
      });
      const session = toStoredSession(tokens, Date.now());
      await manager.adopt(session);
      await SecureStore.setItemAsync(VIA_KEY, via);
      setStatus('signedIn');
      announce(session.idToken);
    },
    [manager, announce],
  );

  // `expo/fetch` respeita `redirect: 'manual'` e `credentials: 'omit'` (o `fetch`
  // do React Native ignora os dois no Android): o cliente guarda o cookie da
  // interação ele mesmo.
  const newClient = () =>
    createExperienceClient({
      endpoint: env.logtoEndpoint,
      fetch: expoFetch as unknown as typeof fetch,
    });

  const signInWithPassword = useCallback(
    async (email: string, password: string) => {
      const pkce = await newPkce();
      const result = await signInWithPasswordFlow(newClient(), {
        authorizeUrl: await authorizeUrl(pkce),
        email,
        password,
      });
      await finish(pkce, result, 'app');
    },
    [authorizeUrl, finish],
  );

  const startSignup = useCallback(
    async (email: string) => {
      const pkce = await newPkce();
      const client = newClient();
      const pending = await requestSignupCode(client, {
        authorizeUrl: await authorizeUrl(pkce),
        email,
      });
      signup.current = { client, pending, pkce };
    },
    [authorizeUrl],
  );

  const finishSignup = useCallback(
    async (input: { code: string; password: string; name: string }) => {
      const flow = signup.current;
      if (!flow) throw new ExperienceError('session.not_found', 400);
      const result = await completeSignup(flow.client, { ...flow.pending, ...input });
      signup.current = null;
      // O nome também vai ao perfil da Fatia (`IdentitySync`), caso este Logto
      // não guarde o nome no cadastro e o ID token venha sem ele.
      signupName.current = input.name;
      await finish(flow.pkce, result, 'app');
    },
    [finish],
  );

  const startPasswordReset = useCallback(
    async (email: string) => {
      const pkce = await newPkce();
      const client = newClient();
      const pending = await requestPasswordResetCode(client, {
        authorizeUrl: await authorizeUrl(pkce),
        email,
      });
      reset.current = { client, pending, pkce };
    },
    [authorizeUrl],
  );

  const finishPasswordReset = useCallback(
    async (input: { code: string; password: string }) => {
      const flow = reset.current;
      if (!flow) throw new ExperienceError('session.not_found', 400);
      await completePasswordReset(flow.client, { ...flow.pending, ...input });
      reset.current = null;
      if (status !== 'signedIn') await signInWithPassword(flow.pending.email, input.password);
    },
    [signInWithPassword, status],
  );

  const signInWithSocial = useCallback(
    async (target: SocialTarget) => {
      setError(null);
      try {
        const discovery = await endpoints();
        const redirectUri = AuthSession.makeRedirectUri({ scheme: 'fatia', path: REDIRECT_PATH });
        if (__DEV__) console.log('[auth] redirect_uri:', redirectUri);
        const request = new AuthSession.AuthRequest({
          clientId: env.logtoAppId,
          redirectUri,
          scopes: SOCIAL_SCOPES,
          usePKCE: true,
          codeChallengeMethod: AuthSession.CodeChallengeMethod.S256,
          // `direct_sign_in` leva direto ao Google/Apple, sem a tela do Logto.
          // O botão só aparece com o conector configurado (`socialTargets`).
          extraParams: signInExtraParams(env.logtoAudience, { social: target }),
        });
        // Navegador do sistema (ASWebAuthenticationSession / Custom Tabs), nunca
        // WebView: o consentimento do provedor é dele.
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
        const session = toStoredSession(tokens, Date.now());
        await manager.adopt(session);
        await SecureStore.setItemAsync(VIA_KEY, 'browser');
        setStatus('signedIn');
        announce(session.idToken);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Falha ao autenticar');
      }
    },
    [manager, announce],
  );

  const signOut = useCallback(async () => {
    // Limpa o cofre primeiro. Se a chamada ao Logto falhar por rede, o token
    // local já saiu — sair pela metade é pior que sair sem avisar o servidor.
    const idToken = manager.current?.idToken ?? null;
    const refreshToken = manager.current?.refreshToken ?? null;
    const via = await SecureStore.getItemAsync(VIA_KEY).catch(() => null);
    await manager.clear();
    await SecureStore.deleteItemAsync(VIA_KEY).catch(() => undefined);
    // A próxima pessoa no aparelho não herda a compra da loja (ADR 024).
    await sairDaLoja();
    setStatus('signedOut');
    try {
      const discovery = await endpoints();
      if (refreshToken && discovery.revocationEndpoint) {
        await revokeToken(discovery.revocationEndpoint, {
          clientId: env.logtoAppId,
          token: refreshToken,
        });
      }
      // Só o login social deixa sessão no navegador do sistema; sem encerrá-la,
      // o próximo "Google" entraria direto na mesma conta.
      if (via === 'browser' && discovery.endSessionEndpoint && idToken) {
        const url = new URL(discovery.endSessionEndpoint);
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
  const refreshSession = useCallback(async () => {
    await manager.forceRefresh();
  }, [manager]);
  const takeSignupName = useCallback(() => {
    const name = signupName.current;
    signupName.current = null;
    return name;
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      passwordPolicy: experience?.passwordPolicy ?? DEFAULT_PASSWORD_POLICY,
      socialTargets: experience ? socialTargets(experience) : [],
      signInWithPassword,
      startSignup,
      finishSignup,
      startPasswordReset,
      finishPasswordReset,
      signInWithSocial,
      signOut,
      getAccessToken,
      freshIdentity,
      takeSignupName,
      refreshSession,
      error,
    }),
    [
      status,
      experience,
      signInWithPassword,
      startSignup,
      finishSignup,
      startPasswordReset,
      finishPasswordReset,
      signInWithSocial,
      signOut,
      getAccessToken,
      freshIdentity,
      takeSignupName,
      refreshSession,
      error,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth precisa estar dentro de <AuthProvider>');
  return ctx;
}
