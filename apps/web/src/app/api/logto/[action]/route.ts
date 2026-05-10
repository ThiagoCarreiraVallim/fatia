import { handleSignIn, signIn, signOut } from '@logto/next/server-actions';
import { NextRequest, NextResponse } from 'next/server';
import { redirect } from 'next/navigation';
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
    await handleSignIn(logtoConfig, new URL(request.url));
    redirect('/');
  }

  return NextResponse.json({ error: 'unknown action' }, { status: 404 });
}
