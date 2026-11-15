/**
 * Os dois recados que atravessam o vaivém pelo Logto até o onboarding (#371):
 * o nome digitado em "Criar conta" (Onb-01b) e o link de convite que trouxe a
 * pessoa (Onb-01a), para a retomada ainda abrir as boas-vindas da comunidade.
 *
 * Cookie e não `localStorage` (que some no modo privado e não chega ao
 * servidor); nenhum dos dois é segredo nem dado de saúde, e os dois vencem.
 */
export const SIGNUP_NAME_COOKIE = 'fatia_signup_name';
export const SIGNUP_NAME_MAX_AGE_S = 10 * 60;
export const INVITE_COOKIE = 'fatia_convite';

/** O nome como entra no cookie: sem espaço sobrando, até 80 caracteres. */
export function cleanSignupName(raw: string | null | undefined): string | null {
  const name = (raw ?? '').replace(/\s+/g, ' ').trim().slice(0, 80);
  return name.length > 0 ? name : null;
}

export function readClientCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const hit = document.cookie.split('; ').find((c) => c.startsWith(`${name}=`));
  if (!hit) return null;
  try {
    return decodeURIComponent(hit.slice(name.length + 1));
  } catch {
    return null;
  }
}

export function writeClientCookie(name: string, value: string, maxAgeS: number) {
  if (typeof document === 'undefined') return;
  document.cookie = `${name}=${encodeURIComponent(value)}; Max-Age=${maxAgeS}; Path=/; SameSite=Lax`;
}

export function clearClientCookie(name: string) {
  if (typeof document === 'undefined') return;
  document.cookie = `${name}=; Max-Age=0; Path=/; SameSite=Lax`;
}
