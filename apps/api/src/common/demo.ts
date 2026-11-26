/**
 * A comunidade de demonstração (#412): o que identifica a conta fictícia e a
 * sessão curta "Abrir no app como Ana Exemplo". Num lugar só, porque quem
 * barra (guarda, e-mail, avisos) mora em módulos diferentes.
 */

/**
 * Domínio do e-mail da aluna fictícia. `.invalid` é reservado (RFC 2606): nenhum
 * servidor entrega para ele. Mesmo assim o `EmailService` recusa antes de tentar.
 */
export const DEMO_EMAIL_DOMAIN = 'demo.fatia.invalid';

/**
 * Prefixo do `logtoSub` da aluna fictícia. O `|` não aparece em `sub` do Logto, e
 * a assinatura do JWT é do Logto: nenhum token chega a esta conta pelo login.
 */
export const DEMO_SUB_PREFIX = 'demo|';

/** Prefixo do token da sessão de demonstração (`fatia_demo_` + 32 base62). */
export const DEMO_TOKEN_PREFIX = 'fatia_demo_';

/** Quanto vale a sessão "Abrir no app como Ana Exemplo". */
export const DEMO_SESSION_TTL_MS = 30 * 60_000;

export function isDemoEmail(email: string): boolean {
  return email.trim().toLowerCase().endsWith(`@${DEMO_EMAIL_DOMAIN}`);
}

export function isDemoToken(token: string): boolean {
  return token.startsWith(DEMO_TOKEN_PREFIX);
}
