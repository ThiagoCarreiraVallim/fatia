import LogtoClient, { handleSignIn } from '@logto/next/server-actions';
import { Prompt } from '@logto/next';
import { NextRequest, NextResponse } from 'next/server';
import { logtoConfig } from '@/lib/logto';
import { NEXT_COOKIE, NEXT_COOKIE_MAX_AGE_S, SOCIAL_TARGETS, safeNextPath } from '@/lib/next-path';
import {
  SIGNUP_NAME_COOKIE,
  SIGNUP_NAME_MAX_AGE_S,
  cleanSignupName,
} from '@/lib/onboarding-cookies';

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

/** Só um e-mail plausível vira `login_hint`: o Logto preenche o campo com ele. */
const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;

export async function GET(request: NextRequest, ctx: RouteContext) {
  const { action } = await ctx.params;

  if (action === 'sign-in') {
    const client = new LogtoClient(logtoConfig);
    const tela = request.nextUrl.searchParams.get('tela');
    const firstScreen =
      tela && tela in FIRST_SCREENS ? FIRST_SCREENS[tela as keyof typeof FIRST_SCREENS] : undefined;
    // Google e Apple (Onb-01a/01b) pulam a tela do Logto e vão direto ao conector.
    const social = request.nextUrl.searchParams.get('social');
    const target = SOCIAL_TARGETS.find((t) => t === social);
    const email = request.nextUrl.searchParams.get('email')?.trim() ?? '';
    // "Criar conta" e o "Entrar" com e-mail ignoram a sessão que o Logto ainda
    // guarda no navegador: sem isto o cadastro entrava direto na conta aberta.
    // O `consent` fica porque é ele que libera o refresh token.
    const freshLogin = firstScreen === 'register' || EMAIL.test(email);
    const { url } = await client.handleSignIn({
      redirectUri: `${logtoConfig.baseUrl}/api/logto/callback`,
      firstScreen,
      ...(EMAIL.test(email) ? { loginHint: email } : {}),
      ...(target ? { directSignIn: { method: 'social' as const, target } } : {}),
      ...(freshLogin ? { prompt: [Prompt.Login, Prompt.Consent] } : {}),
    });
    const resposta = NextResponse.redirect(url);
    // O nome digitado em "Criar conta": o onboarding lê, grava no perfil e apaga.
    // A senha fica na tela do Logto; o app nunca a vê (ADR 008).
    const nome = cleanSignupName(request.nextUrl.searchParams.get('nome'));
    if (nome) {
      resposta.cookies.set(SIGNUP_NAME_COOKIE, nome, {
        httpOnly: false,
        sameSite: 'lax',
        secure: logtoConfig.baseUrl.startsWith('https://'),
        path: '/',
        maxAge: SIGNUP_NAME_MAX_AGE_S,
      });
    }
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
