import { handleSignIn, signIn, signOut } from '@logto/next/server-actions';
import { NextRequest, NextResponse } from 'next/server';
import { logtoConfig } from '@/lib/logto';

type RouteContext = { params: Promise<{ action: string }> };

export async function GET(request: NextRequest, ctx: RouteContext) {
  const { action } = await ctx.params;

  if (action === 'sign-in') {
    await signIn(logtoConfig, `${logtoConfig.baseUrl}/api/logto/callback`);
    return NextResponse.redirect(new URL('/', logtoConfig.baseUrl));
  }

  if (action === 'sign-out') {
    await signOut(logtoConfig, logtoConfig.baseUrl);
    return NextResponse.redirect(new URL('/login', logtoConfig.baseUrl));
  }

  if (action === 'callback') {
    try {
      await handleSignIn(logtoConfig, new URL(request.url));
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
