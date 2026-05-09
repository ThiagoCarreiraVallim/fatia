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
  if (!audience) return null;
  try {
    return await getAccessToken(logtoConfig, audience);
  } catch {
    return null;
  }
}
