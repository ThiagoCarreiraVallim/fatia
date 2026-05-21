import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiFetch } from '../api';

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
    ...init,
  });
}

describe('apiFetch', () => {
  const fetchMock = vi.fn();
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.useFakeTimers();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    vi.useRealTimers();
    global.fetch = originalFetch;
  });

  it('rewrites /api/* paths to the Next proxy', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: true }));
    await apiFetch('/api/nutrition/summary?date=2026-05-19');
    const [calledUrl] = fetchMock.mock.calls[0];
    expect(calledUrl).toBe('/api/proxy/nutrition/summary?date=2026-05-19');
  });

  it('returns parsed JSON for 2xx responses', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ items: [1, 2] }));
    await expect(apiFetch<{ items: number[] }>('/api/foo')).resolves.toEqual({ items: [1, 2] });
  });

  it('returns undefined for 204 No Content', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
    await expect(apiFetch('/api/foo')).resolves.toBeUndefined();
  });

  it('throws with body.message when response is not ok', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ message: 'Bad input' }, { status: 400 }));
    await expect(apiFetch('/api/foo')).rejects.toThrow('Bad input');
  });

  it('falls back to HTTP <status> when body has no message', async () => {
    fetchMock.mockResolvedValueOnce(new Response('not json', { status: 500 }));
    await expect(apiFetch('/api/foo')).rejects.toThrow('HTTP 500');
  });

  it('throws "Tempo de resposta excedido" when the request exceeds the timeout', async () => {
    fetchMock.mockImplementationOnce(
      (_url, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener('abort', () =>
            reject(new DOMException('aborted', 'AbortError')),
          );
        }),
    );
    const pending = apiFetch('/api/slow');
    pending.catch(() => undefined);
    await vi.advanceTimersByTimeAsync(15_000);
    await expect(pending).rejects.toThrow('Tempo de resposta excedido');
  });

  it('sets Content-Type to application/json when a body is provided', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({}));
    await apiFetch('/api/foo', { method: 'POST', body: JSON.stringify({ a: 1 }) });
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Headers;
    expect(headers.get('content-type')).toBe('application/json');
  });
});
