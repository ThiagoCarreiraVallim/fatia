const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';

/** O formato do token (id em base64url, ponto, HMAC em base64url): o resto nem vai à rede. */
const TOKEN = /^[A-Za-z0-9_-]{1,120}\.[A-Za-z0-9_-]{43}$/;

const URL_ = `${API_BASE}/api/email/announcements/subscription`;

/**
 * O e-mail de comunicados (#398) por link, sem login: o token assinado do
 * próprio e-mail é a prova. Buscado no servidor, como o cartão do convite: o
 * proxy da web só fala com a API em nome de quem entrou. Inválido ou API fora
 * do ar: `null`, e a página diz que o link não vale.
 */
export async function fetchAnnouncementSubscription(
  token: string,
): Promise<{ subscribed: boolean } | null> {
  if (!TOKEN.test(token)) return null;
  try {
    const res = await fetch(`${URL_}?${new URLSearchParams({ t: token })}`, { cache: 'no-store' });
    if (!res.ok) return null;
    return (await res.json()) as { subscribed: boolean };
  } catch {
    return null;
  }
}

export async function setAnnouncementSubscription(
  token: string,
  subscribed: boolean,
): Promise<{ subscribed: boolean } | null> {
  if (!TOKEN.test(token)) return null;
  try {
    const res = await fetch(URL_, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ t: token, subscribed }),
      cache: 'no-store',
    });
    if (!res.ok) return null;
    return (await res.json()) as { subscribed: boolean };
  } catch {
    return null;
  }
}
