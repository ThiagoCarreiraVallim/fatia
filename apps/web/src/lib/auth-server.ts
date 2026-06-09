import { getAccessToken, getLogtoContext } from '@logto/next/server-actions';
import { logtoConfig } from './logto';

type LogtoContext = Awaited<ReturnType<typeof getLogtoContext>>;

/**
 * Obtém o contexto do Logto sem deixar uma falha no endpoint userinfo derrubar
 * a renderização. O fetch de userInfo bate no servidor OIDC, que pode responder
 * com erros transitórios (ex.: 502 "Bad Gateway") em HTML/texto — nesse caso o
 * SDK quebra ao fazer JSON.parse da resposta. Como userInfo é apenas um fallback
 * para o nome, em caso de falha tentamos novamente apenas com os claims locais.
 */
async function getSafeLogtoContext(): Promise<LogtoContext | null> {
  try {
    return await getLogtoContext(logtoConfig, { fetchUserInfo: true });
  } catch (err) {
    console.error(
      '[auth-server] getLogtoContext com fetchUserInfo falhou, tentando apenas claims locais:',
      err instanceof Error ? err.message : err,
    );
    try {
      return await getLogtoContext(logtoConfig, { fetchUserInfo: false });
    } catch (fallbackErr) {
      console.error(
        '[auth-server] getLogtoContext falhou mesmo sem fetchUserInfo:',
        fallbackErr instanceof Error ? fallbackErr.message : fallbackErr,
      );
      return null;
    }
  }
}

export async function getCurrentUser() {
  const ctx = await getSafeLogtoContext();
  if (!ctx || !ctx.isAuthenticated || !ctx.claims) return null;
  const claims = ctx.claims as typeof ctx.claims & { name?: string; roles?: string[] };
  return {
    id: claims.sub,
    email: claims.email ?? '',
    name: claims.name ?? ctx.userInfo?.name ?? '',
    role: claims.roles?.includes('admin') ? 'ADMIN' : 'USER',
  };
}

export async function getApiAccessToken(): Promise<string | null> {
  const audience = process.env.LOGTO_AUDIENCE;
  if (!audience) {
    console.error(
      '[auth-server] getApiAccessToken: LOGTO_AUDIENCE não definido — proxy retornará 401.',
    );
    return null;
  }
  try {
    return await getAccessToken(logtoConfig, audience);
  } catch (err) {
    console.error(
      `[auth-server] getApiAccessToken failed para audience=${audience}:`,
      err instanceof Error ? err.message : err,
    );
    return null;
  }
}
