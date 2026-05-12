import LogtoClient, { handleSignIn } from '@logto/next/server-actions';
import { NextRequest, NextResponse } from 'next/server';
import { logtoConfig } from '@/lib/logto';

type RouteContext = { params: Promise<{ action: string }> };

export async function GET(request: NextRequest, ctx: RouteContext) {
  const { action } = await ctx.params;

  if (action === 'sign-in') {
    const client = new LogtoClient(logtoConfig);
    const { url } = await client.handleSignIn({
      redirectUri: `${logtoConfig.baseUrl}/api/logto/callback`,
    });
    return NextResponse.redirect(url);
  }

  if (action === 'sign-out') {
    const client = new LogtoClient(logtoConfig);
    const url = await client.handleSignOut(logtoConfig.baseUrl);
    return NextResponse.redirect(url);
  }

  if (action === 'callback') {
    try {
      // Reconstruct the callback URI using baseUrl to avoid internal-URL mismatch
      // behind Traefik: request.url may use http:// or an internal hostname, but
      // the stored redirectUri always uses LOGTO_BASE_URL.
      const { searchParams } = new URL(request.url);
      const callbackUri = new URL(
        `/api/logto/callback?${searchParams.toString()}`,
        logtoConfig.baseUrl,
      );
      await handleSignIn(logtoConfig, callbackUri);
    } catch (error) {
      console.error('[logto callback error]', error);
      return NextResponse.json(
        { error: error instanceof Error ? error.message : String(error) },
        { status: 500 },
      );
    }
    return NextResponse.redirect(new URL('/', logtoConfig.baseUrl));
  }

  return NextResponse.json({ error: 'unknown action' }, { status: 404 });
}
