const DEFAULT_TIMEOUT_MS = 15_000;

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const proxyPath = path.startsWith('/api/') ? `/api/proxy${path.slice('/api'.length)}` : path;
  const headers = new Headers(init?.headers);
  if (!headers.has('Content-Type') && init?.body) {
    headers.set('Content-Type', 'application/json');
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(proxyPath, {
      ...init,
      headers,
      credentials: 'include',
      signal: controller.signal,
    });
  } catch (err) {
    if (controller.signal.aborted) throw new Error('Tempo de resposta excedido');
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }

  if (res.status === 401) {
    // Sessão Logto expirou ou inválida — manda re-login.
    if (typeof window !== 'undefined') {
      window.location.href = '/api/logto/sign-in';
    }
    throw new Error('Sessão expirada');
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message ?? `HTTP ${res.status}`);
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}
