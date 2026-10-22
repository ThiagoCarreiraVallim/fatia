import LogtoClient, { handleSignIn } from '@logto/next/server-actions';
import { NextRequest, NextResponse } from 'next/server';
import { logtoConfig } from '@/lib/logto';
import { NEXT_COOKIE, NEXT_COOKIE_MAX_AGE_S, safeNextPath } from '@/lib/next-path';

type RouteContext = { params: Promise<{ action: string }> };

/**
 * Tela do Logto em que o fluxo começa. A página de login oferece três entradas
 * — entrar, criar conta, esqueci minha senha — e todas são o mesmo OIDC; muda
 * só o `first_screen`. Lista fechada: o parâmetro vem da URL.
 */
const FIRST_SCREENS = {
  cadastro: 'register',
  senha: 'reset_password',
} as const;

export async function GET(request: NextRequest, ctx: RouteContext) {
  const { action } = await ctx.params;

  if (action === 'sign-in') {
    const client = new LogtoClient(logtoConfig);
    const tela = request.nextUrl.searchParams.get('tela');
    const firstScreen =
      tela && tela in FIRST_SCREENS ? FIRST_SCREENS[tela as keyof typeof FIRST_SCREENS] : undefined;
    const { url } = await client.handleSignIn({
      redirectUri: `${logtoConfig.baseUrl}/api/logto/callback`,
      firstScreen,
    });
    const resposta = NextResponse.redirect(url);
    // Para onde voltar depois do login (o link de convite, por exemplo). Fica num
    // cookie porque o `redirectUri` do Logto é fixo, e só caminho deste app entra.
    const next = safeNextPath(request.nextUrl.searchParams.get('next'));
    if (next) {
      resposta.cookies.set(NEXT_COOKIE, next, {
        httpOnly: true,
        sameSite: 'lax',
        secure: logtoConfig.baseUrl.startsWith('https://'),
        path: '/',
        maxAge: NEXT_COOKIE_MAX_AGE_S,
      });
    } else {
      resposta.cookies.delete(NEXT_COOKIE);
    }
    return resposta;
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
    const destino = safeNextPath(request.cookies.get(NEXT_COOKIE)?.value) ?? '/';
    const resposta = NextResponse.redirect(new URL(destino, logtoConfig.baseUrl));
    resposta.cookies.delete(NEXT_COOKIE);
    return resposta;
  }

  return NextResponse.json({ error: 'unknown action' }, { status: 404 });
}
