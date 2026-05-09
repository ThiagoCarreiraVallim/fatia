import { handleSignIn, handleSignOut, handleCallback } from '@logto/next/server-actions';
import { NextRequest, NextResponse } from 'next/server';
import { logtoConfig } from '@/lib/logto';

type RouteContext = { params: Promise<{ action: string }> };

export async function GET(request: NextRequest, ctx: RouteContext) {
  const { action } = await ctx.params;

  if (action === 'sign-in') {
    return handleSignIn(logtoConfig, new URL('/callback', logtoConfig.baseUrl).toString());
  }

  if (action === 'sign-out') {
    return handleSignOut(logtoConfig, logtoConfig.baseUrl);
  }

  if (action === 'callback') {
    await handleCallback(logtoConfig, request.url);
    return NextResponse.redirect(new URL('/', logtoConfig.baseUrl));
  }

  return NextResponse.json({ error: 'unknown action' }, { status: 404 });
}
