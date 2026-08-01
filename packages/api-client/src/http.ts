import type { ApiTransport } from './transport';

const DEFAULT_TIMEOUT_MS = 15_000;

/**
 * Erro de API com o status HTTP preservado.
 *
 * O `Error` genérico que existia antes obrigava a comparar strings de mensagem
 * para distinguir um caso de outro. O caso concreto que motivou isto: a API
 * recusa refeição duplicada com `409 CONFLICT`, e a tela precisa dizer "essa
 * refeição já foi registrada" em vez de "falha ao salvar" — senão a pessoa acha
 * que não salvou e tenta de novo.
 */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body: unknown = undefined,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  get isConflict(): boolean {
    return this.status === 409;
  }

  get isNotFound(): boolean {
    return this.status === 404;
  }

  get isUnauthorized(): boolean {
    return this.status === 401;
  }
}

let transport: ApiTransport | null = null;

/**
 * Liga o pacote ao transporte do app. Precisa rodar uma vez, antes da primeira
 * chamada — o web faz no provider, o mobile no layout raiz.
 */
export function configureApiClient(next: ApiTransport): void {
  transport = next;
}

/** Só para teste: desfaz a configuração. */
export function resetApiClient(): void {
  transport = null;
}

function requireTransport(): ApiTransport {
  if (!transport) {
    throw new Error(
      '@fatia/api-client não foi configurado. Chame configureApiClient() na inicialização do app.',
    );
  }
  return transport;
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const t = requireTransport();
  const url = t.resolveUrl(path);

  const headers = new Headers(init?.headers);
  const extra = await t.headers?.(path);
  if (extra) {
    new Headers(extra).forEach((value, key) => headers.set(key, value));
  }
  if (!headers.has('Content-Type') && init?.body) {
    headers.set('Content-Type', 'application/json');
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), t.timeoutMs ?? DEFAULT_TIMEOUT_MS);

  const doFetch = t.fetch ?? fetch;
  let res: Response;
  try {
    res = await doFetch(url, {
      ...t.requestInit?.(),
      ...init,
      headers,
      signal: controller.signal,
    });
  } catch (err) {
    // `cause` preserva o AbortError original. Sem ela, o stack para aqui e o
    // relatório de erro perde de onde a requisição saiu.
    if (controller.signal.aborted) {
      throw new Error('Tempo de resposta excedido', { cause: err });
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }

  if (res.status === 401) {
    const body = await res
      .clone()
      .json()
      .catch(() => ({}));
    await t.onUnauthorized?.({ path, body });
    throw new ApiError('Sessão expirada', 401, body);
  }

  // 204 (No Content) e 304 (Not Modified) não têm corpo — chamar .json() aqui
  // lança "Unexpected end of JSON input". Vale para todos os DELETEs da API.
  //
  // A checagem vem ANTES de `!res.ok` porque `res.ok` é falso para 304: tratá-lo
  // depois transforma "não modificado" em erro `HTTP 304`.
  if (res.status === 204 || res.status === 304) return undefined as T;

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string | string[] };
    const message = Array.isArray(body?.message)
      ? body.message.join(', ')
      : (body?.message ?? `HTTP ${res.status}`);
    throw new ApiError(message, res.status, body);
  }

  return res.json() as Promise<T>;
}
