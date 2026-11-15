/**
 * Os parâmetros extras da autorização no Logto, os mesmos que o PWA manda por
 * `/api/logto/sign-in` (#371):
 * - `first_screen`: cadastro ou "esqueci a senha";
 * - `login_hint`: o e-mail digitado na tela da conta (Onb-01a/01b), que o
 *   Logto já deixa preenchido; a senha é digitada lá, nunca no app (ADR 008);
 * - `direct_sign_in`: Google e Apple pulam a tela do Logto e vão ao conector.
 */

export type FirstScreen = 'register' | 'reset_password';
export type SocialTarget = 'google' | 'apple';

export interface SignInOptions {
  firstScreen?: FirstScreen;
  loginHint?: string;
  social?: SocialTarget;
}

const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;

export function signInExtraParams(
  audience: string,
  options: SignInOptions,
): Record<string, string> {
  const params: Record<string, string> = { resource: audience };
  if (options.firstScreen) params.first_screen = options.firstScreen;
  const hint = options.loginHint?.trim() ?? '';
  if (EMAIL.test(hint)) params.login_hint = hint;
  if (options.social === 'google' || options.social === 'apple') {
    params.direct_sign_in = `social:${options.social}`;
  }
  return params;
}

/** O nome digitado em "Criar conta", como vai para o perfil depois do login. */
export function cleanSignupName(raw: string | null | undefined): string | null {
  const name = (raw ?? '').replace(/\s+/g, ' ').trim().slice(0, 80);
  return name.length > 0 ? name : null;
}
