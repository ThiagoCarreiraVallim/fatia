import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

/**
 * O proxy do Next repassando SSE **sem bufferizar** (épica #247).
 *
 * Antes, todo caminho terminava em `await upstream.arrayBuffer()`, que só resolve
 * quando o upstream fecha o corpo. Para JSON isso é irrelevante; para o chat é a
 * diferença entre token a token e a resposta inteira caindo de uma vez no fim —
 * o streaming das duas camadas de baixo desperdiçado, e a conversa parecendo
 * travada.
 *
 * Por isso o caso mantém o upstream **aberto**: se o handler bufferizar, ele nem
 * chega a responder e o teste estoura por tempo. Um upstream já fechado passaria
 * com as duas implementações — seria um teste vazio.
 */

vi.mock('@/lib/auth-server', () => ({ getApiAccessToken: vi.fn(async () => 'token-de-teste') }));

const { POST } = await import('../[...path]/route');

const fetchMock = vi.fn();
beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
});

function contexto(path: string[]) {
  return { params: Promise.resolve({ path }) };
}

function pedido(signal?: AbortSignal) {
  return new NextRequest('http://localhost:3030/api/proxy/chat', {
    method: 'POST',
    body: JSON.stringify({ message: 'oi' }),
    headers: { 'content-type': 'application/json' },
    signal,
  });
}

describe('proxy do Next', () => {
  it('entrega o primeiro token com o upstream ainda aberto', async () => {
    const encoder = new TextEncoder();
    let controle!: ReadableStreamDefaultController<Uint8Array>;
    const corpo = new ReadableStream<Uint8Array>({
      start(c) {
        controle = c;
        c.enqueue(encoder.encode('event: token\ndata: {"text":"Oi"}\n\n'));
      },
    });
    fetchMock.mockResolvedValueOnce(
      new Response(corpo, { status: 200, headers: { 'content-type': 'text/event-stream' } }),
    );

    const res = await POST(pedido(), contexto(['chat']));
    expect(res.headers.get('content-type')).toContain('text/event-stream');
    // Rebufferização de proxy reverso recria o sintoma fora do nosso código.
    expect(res.headers.get('x-accel-buffering')).toBe('no');

    const leitor = res.body!.getReader();
    const { value } = await leitor.read();
    expect(new TextDecoder().decode(value)).toContain('"text":"Oi"');

    controle.close();
  });

  it('resposta JSON continua vindo inteira, como sempre veio', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true }), {
        status: 201,
        headers: { 'content-type': 'application/json' },
      }),
    );
    const res = await POST(pedido(), contexto(['nutrition', 'meals']));
    expect(res.status).toBe(201);
    await expect(res.json()).resolves.toEqual({ ok: true });
  });

  it('repassa o cancelamento do navegador ao upstream', async () => {
    // "Parar resposta" aborta o fetch do PWA para cá. Sem `signal` no init, o
    // fetch daqui para o NestJS seguia vivo: o agente gerava a resposta inteira
    // e a cota de `ai-quota.ts` era debitada por tokens que ninguém ia ler.
    const cancelamento = new AbortController();
    fetchMock.mockResolvedValueOnce(
      new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }),
    );

    await POST(pedido(cancelamento.signal), contexto(['chat']));

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const repassado = init.signal;
    expect(repassado).toBeInstanceOf(AbortSignal);
    expect(repassado!.aborted).toBe(false);
    // Só o mesmo sinal (ou um encadeado nele) aborta junto — comparar por
    // identidade passaria com um `AbortSignal` novo e solto.
    cancelamento.abort();
    expect(repassado!.aborted).toBe(true);
  });

  it('injeta o Bearer no servidor e não repassa o cookie de sessão', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }),
    );
    await POST(pedido(), contexto(['chat']));
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Headers;
    expect(headers.get('authorization')).toBe('Bearer token-de-teste');
    expect(headers.get('cookie')).toBeNull();
  });
});
