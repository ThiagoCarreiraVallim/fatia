/**
 * O token de um link de convite, venha ele do app (`fatia://c/<token>`), do link
 * universal (`https://app.…/c/<token>`) ou só do caminho (`/c/<token>`).
 *
 * O formato é o mesmo que a API confere: 32 bytes em base64url. Qualquer outra
 * coisa é `null`, e a tela mostra "convite indisponível" sem ir à rede.
 */
const TOKEN = /^[A-Za-z0-9_-]{43}$/;

export function isInviteToken(value: string | null | undefined): value is string {
  return typeof value === 'string' && TOKEN.test(value);
}

export function inviteTokenFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const match = /(?:^|\/)c\/([^/?#]+)\/?(?:[?#].*)?$/.exec(url);
  const token = match?.[1] ?? null;
  return isInviteToken(token) ? token : null;
}
