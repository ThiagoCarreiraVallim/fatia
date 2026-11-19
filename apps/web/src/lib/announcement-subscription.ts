const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';

/** O formato do token (id em base64url, ponto, HMAC em base64url): o resto nem vai à rede. */
const TOKEN = /^[A-Za-z0-9_-]{1,120}\.[A-Za-z0-9_-]{43}$/;

const BASE = `${API_BASE}/api/email/announcements`;

/**
 * - `ok`: a API respondeu;
 * - `invalid`: o link não vale (formato ruim ou 400 da API);
 * - `unavailable`: 429, 5xx ou rede caída — o link pode estar certo, tente de novo.
 */
export type SubscriptionResult =
  { kind: 'ok'; subscribed: boolean } | { kind: 'invalid' } | { kind: 'unavailable' };

async function chama(url: string, init: RequestInit): Promise<SubscriptionResult> {
  try {
    const res = await fetch(url, { ...init, cache: 'no-store' });
    if (res.ok) return { kind: 'ok', ...((await res.json()) as { subscribed: boolean }) };
    return res.status === 400 ? { kind: 'invalid' } : { kind: 'unavailable' };
  } catch {
    return { kind: 'unavailable' };
  }
}

/**
 * O e-mail de comunicados (#398) por link, sem login: o token assinado do
 * próprio e-mail é a prova. Buscado no servidor, como o cartão do convite: o
 * proxy da web só fala com a API em nome de quem entrou.
 */
export function fetchAnnouncementSubscription(token: string): Promise<SubscriptionResult> {
  if (!TOKEN.test(token)) return Promise.resolve({ kind: 'invalid' });
  return chama(`${BASE}/subscription?${new URLSearchParams({ t: token })}`, {});
}

export function setAnnouncementSubscription(
  token: string,
  subscribed: boolean,
): Promise<SubscriptionResult> {
  if (!TOKEN.test(token)) return Promise.resolve({ kind: 'invalid' });
  return chama(`${BASE}/subscription`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ t: token, subscribed }),
  });
}

/** O POST de um clique do provedor de e-mail (RFC 8058), repassado à API. */
export async function oneClickUnsubscribe(token: string): Promise<boolean> {
  if (!TOKEN.test(token)) return false;
  const r = await chama(`${BASE}/one-click?${new URLSearchParams({ t: token })}`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: 'List-Unsubscribe=One-Click',
  });
  return r.kind === 'ok';
}
