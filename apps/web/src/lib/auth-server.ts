import { getAccessToken, getLogtoContext } from '@logto/next/server-actions';
import { logtoConfig } from './logto';

export async function getCurrentUser() {
  const ctx = await getLogtoContext(logtoConfig, { fetchUserInfo: true });
  if (!ctx.isAuthenticated || !ctx.claims) return null;
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
