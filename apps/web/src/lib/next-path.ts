/**
 * Para onde voltar depois do login ou do assistente (`?next=`), e o cookie que
 * o guarda durante o vaivém pelo Logto.
 *
 * Só caminho relativo deste app: `//outro.site`, `/\outro.site` e URLs com
 * esquema viram `null`, senão o link de convite viraria um redirecionamento
 * aberto para qualquer lugar.
 */
export const NEXT_COOKIE = 'fatia_next';
export const NEXT_COOKIE_MAX_AGE_S = 10 * 60;

const MAX_LENGTH = 512;

export function safeNextPath(raw: string | null | undefined): string | null {
  if (!raw || raw.length > MAX_LENGTH) return null;
  if (!raw.startsWith('/') || raw.startsWith('//')) return null;
  if (raw.includes('\\') || [...raw].some((c) => c.charCodeAt(0) < 0x20)) return null;
  return raw;
}

/** Os conectores sociais do login (Onb-01a e Onb-01b), lista fechada. */
export const SOCIAL_TARGETS = ['google', 'apple'] as const;
export type SocialTarget = (typeof SOCIAL_TARGETS)[number];

/** `/api/logto/sign-in` com a tela e o retorno, quando houver; `social` pula a tela do Logto. */
export function signInHref(
  next: string | null,
  tela?: 'cadastro' | 'senha',
  options: { social?: SocialTarget } = {},
): string {
  const q = new URLSearchParams();
  if (tela) q.set('tela', tela);
  if (next) q.set('next', next);
  if (options.social) q.set('social', options.social);
  const qs = q.toString();
  return `/api/logto/sign-in${qs ? `?${qs}` : ''}`;
}
