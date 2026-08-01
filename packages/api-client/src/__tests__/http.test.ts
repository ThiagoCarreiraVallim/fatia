import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, apiFetch, configureApiClient, resetApiClient } from '../http';
import type { ApiTransport } from '../transport';

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
    ...init,
  });
}

const fetchMock = vi.fn();

/** Transporte mínimo: identidade na URL, `fetch` mockado. */
function configure(overrides: Partial<ApiTransport> = {}) {
  configureApiClient({
    resolveUrl: (path) => path,
    fetch: fetchMock as unknown as typeof fetch,
    ...overrides,
  });
}

describe('apiFetch', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    configure();
  });

  afterEach(() => {
    vi.useRealTimers();
    resetApiClient();
  });

  it('exige configuração antes do primeiro uso', async () => {
    resetApiClient();
    await expect(apiFetch('/api/foo')).rejects.toThrow('não foi configurado');
  });

  it('delega a montagem da URL ao transporte', async () => {
    configure({ resolveUrl: (path) => `https://api.exemplo${path}` });
    fetchMock.mockResolvedValueOnce(jsonResponse({}));
    await apiFetch('/api/nutrition/summary?date=2026-05-19');
    expect(fetchMock.mock.calls[0][0]).toBe(
      'https://api.exemplo/api/nutrition/summary?date=2026-05-19',
    );
  });

  it('soma os cabeçalhos do transporte — é assim que o mobile manda o Bearer', async () => {
    configure({ headers: () => ({ Authorization: 'Bearer abc123' }) });
    fetchMock.mockResolvedValueOnce(jsonResponse({}));
    await apiFetch('/api/foo');
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Headers).get('authorization')).toBe('Bearer abc123');
  });

  it('aceita cabeçalhos assíncronos, porque obter o token pode disparar refresh', async () => {
    configure({ headers: async () => ({ Authorization: 'Bearer renovado' }) });
    fetchMock.mockResolvedValueOnce(jsonResponse({}));
    await apiFetch('/api/foo');
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Headers).get('authorization')).toBe('Bearer renovado');
  });

  it('devolve o JSON já parseado em respostas 2xx', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ items: [1, 2] }));
    await expect(apiFetch<{ items: number[] }>('/api/foo')).resolves.toEqual({ items: [1, 2] });
  });

  it.each([204, 304])('devolve undefined em %i, que não tem corpo', async (status) => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status }));
    await expect(apiFetch('/api/foo')).resolves.toBeUndefined();
  });

  it('usa body.message quando a resposta não é ok', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ message: 'Bad input' }, { status: 400 }));
    await expect(apiFetch('/api/foo')).rejects.toThrow('Bad input');
  });

  it('junta as mensagens quando o Nest devolve um array de erros de validação', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        { message: ['grams deve ser positivo', 'foodId é obrigatório'] },
        { status: 400 },
      ),
    );
    await expect(apiFetch('/api/foo')).rejects.toThrow(
      'grams deve ser positivo, foodId é obrigatório',
    );
  });

  it('cai para HTTP <status> quando o corpo não traz mensagem', async () => {
    fetchMock.mockResolvedValueOnce(new Response('not json', { status: 500 }));
    await expect(apiFetch('/api/foo')).rejects.toThrow('HTTP 500');
  });

  it('preserva o status no ApiError — é como a tela distingue CONFLICT de falha genérica', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ message: 'Refeição já registrada' }, { status: 409 }),
    );
    const err = await apiFetch('/api/nutrition/meals', { method: 'POST' }).catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).status).toBe(409);
    expect((err as ApiError).isConflict).toBe(true);
  });

  it('avisa o transporte no 401 antes de lançar', async () => {
    const onUnauthorized = vi.fn();
    configure({ onUnauthorized });
    fetchMock.mockResolvedValueOnce(jsonResponse({ source: 'proxy-no-token' }, { status: 401 }));
    await expect(apiFetch('/api/foo')).rejects.toThrow('Sessão expirada');
    expect(onUnauthorized).toHaveBeenCalledWith({
      path: '/api/foo',
      body: { source: 'proxy-no-token' },
    });
  });

  it('lança "Tempo de resposta excedido" quando estoura o timeout', async () => {
    fetchMock.mockImplementationOnce(
      (_url: string, init: RequestInit) =>
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

  it('respeita o timeout que o transporte definir', async () => {
    configure({ timeoutMs: 3_000 });
    fetchMock.mockImplementationOnce(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener('abort', () =>
            reject(new DOMException('aborted', 'AbortError')),
          );
        }),
    );
    const pending = apiFetch('/api/slow');
    pending.catch(() => undefined);
    await vi.advanceTimersByTimeAsync(3_000);
    await expect(pending).rejects.toThrow('Tempo de resposta excedido');
  });

  it('marca Content-Type json quando há corpo', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({}));
    await apiFetch('/api/foo', { method: 'POST', body: JSON.stringify({ a: 1 }) });
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Headers).get('content-type')).toBe('application/json');
  });
});
