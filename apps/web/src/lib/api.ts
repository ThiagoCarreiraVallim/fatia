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
    // Sessão Logto expirou, ou sessão não tem access token para a API resource.
    // Vai por sign-out para forçar nova sessão — sign-in sozinho reaproveita a
    // sessão atual e perpetua o problema (loop de login).
    if (typeof window !== 'undefined') {
      const body = await res
        .clone()
        .json()
        .catch(() => ({}));
      console.error('[apiFetch] 401', { path: proxyPath, body });
      window.location.href = '/api/logto/sign-out';
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
