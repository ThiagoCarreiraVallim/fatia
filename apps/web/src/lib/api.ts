/**
 * Cliente-side: chama o proxy do Next, que adiciona Bearer token (Logto) no
 * server-side antes de encaminhar pra API NestJS. Cookie de sessão do Logto
 * autentica o proxy.
 */
export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const proxyPath = path.startsWith('/api/') ? `/api/proxy${path.slice('/api'.length)}` : path;
  const headers = new Headers(init?.headers);
  if (!headers.has('Content-Type') && init?.body) {
    headers.set('Content-Type', 'application/json');
  }

  const res = await fetch(proxyPath, {
    ...init,
    headers,
    credentials: 'include',
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message ?? `HTTP ${res.status}`);
  }

  return res.json() as Promise<T>;
}
