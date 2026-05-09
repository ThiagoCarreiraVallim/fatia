import { getLogtoContext } from '@logto/next/server-actions';
import { logtoConfig } from './logto';

export async function getCurrentUser() {
  const ctx = await getLogtoContext(logtoConfig, { fetchUserInfo: true });
  if (!ctx.isAuthenticated || !ctx.claims) return null;
  return {
    id: ctx.claims.sub,
    email: ctx.claims.email ?? '',
    name: ctx.claims.name ?? ctx.userInfo?.name ?? '',
    role: (ctx.claims.roles as string[] | undefined)?.includes('admin') ? 'ADMIN' : 'USER',
  };
}

export async function getApiAccessToken(): Promise<string | null> {
  const audience = process.env.LOGTO_AUDIENCE;
  if (!audience) return null;
  const ctx = await getLogtoContext(logtoConfig, { resource: audience });
  return ctx.accessToken ?? null;
}
