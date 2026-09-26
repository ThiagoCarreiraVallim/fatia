import { afterEach, describe, expect, it, vi } from 'vitest';
import { configureApiClient, resetApiClient } from '../http';
import type { ApiTransport } from '../transport';
import {
  CHAT_ERROR_CODES,
  erroDoChat,
  parseQuadro,
  recortarQuadros,
  streamChat,
  textoDeErroDoChat,
  type ChatStreamFrame,
} from '../chat';

const fetchMock = vi.fn();

function configure(overrides: Partial<ApiTransport> = {}) {
  configureApiClient({
    resolveUrl: (path) => `/api/proxy${path.slice('/api'.length)}`,
    fetch: fetchMock as unknown as typeof fetch,
    ...overrides,
  });
}

/** Resposta SSE cujos pedaços chegam **exatamente** como listados. */
function sse(pedacos: string[], init: ResponseInit = {}): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const pedaco of pedacos) controller.enqueue(encoder.encode(pedaco));
      controller.close();
    },
  });
  return new Response(body, {
    status: 200,
    headers: { 'content-type': 'text/event-stream' },
    ...init,
  });
}

async function coletar(gen: AsyncGenerator<ChatStreamFrame>): Promise<ChatStreamFrame[]> {
  const eventos: ChatStreamFrame[] = [];
  for await (const evento of gen) eventos.push(evento);
  return eventos;
}

const CONVERSA = '3f1c9a52-6b1e-4d8a-9c2f-0a5e7b3d1c44';

afterEach(() => {
  resetApiClient();
  fetchMock.mockReset();
});

describe('recortarQuadros', () => {
  it('só devolve quadro terminado, e guarda o resto', () => {
    const { quadros, resto } = recortarQuadros('event: done\ndata: {}\n\nevent: mess');
    expect(quadros).toEqual(['event: done\ndata: {}']);
    expect(resto).toBe('event: mess');
  });

  it('aceita CRLF, que é o que proxy reverso costuma entregar', () => {
    const { quadros } = recortarQuadros('event: done\r\ndata: {}\r\n\r\n');
    expect(quadros).toEqual(['event: done\ndata: {}']);
  });
});

describe('parseQuadro', () => {
  it('ignora o comentário que a API manda para abrir o stream', () => {
    expect(parseQuadro(': aberto')).toBeNull();
  });

  it('ignora JSON quebrado em vez de derrubar a conversa', () => {
    expect(parseQuadro('event: messages\ndata: {nao')).toBeNull();
  });

  /**
   * O `data` de `messages` é uma LISTA, e é o formato que o runtime do
   * assistant-ui desserializa. Um parser que exigisse objeto — como o que
   * existia aqui — descartaria justamente o texto da resposta.
   */
  it('entrega o `data` de `messages` como veio: a tupla mensagem + metadados', () => {
    const quadro =
      'event: messages\ndata: [{"type":"AIMessageChunk","content":"Oi","id":"ai-1"},{"langgraph_node":"agente"}]';
    expect(parseQuadro(quadro)).toEqual({
      event: 'messages',
      data: [{ type: 'AIMessageChunk', content: 'Oi', id: 'ai-1' }, { langgraph_node: 'agente' }],
    });
  });
});

describe('erroDoChat', () => {
  it('código desconhecido vira AI_UNKNOWN_ERROR e a mensagem do servidor não vem junto', () => {
    expect(
      erroDoChat({ code: 'AI_NOVIDADE', message: 'Falha em POST chat/completions. AI_BASE_URL.' }),
    ).toEqual({ code: 'AI_UNKNOWN_ERROR' });
  });

  it('mantém o resetsAt da cota', () => {
    expect(erroDoChat({ code: 'AI_QUOTA_EXCEEDED', resetsAt: '2026-08-07T00:00:00Z' })).toEqual({
      code: 'AI_QUOTA_EXCEEDED',
      resetsAt: '2026-08-07T00:00:00Z',
    });
  });
});

describe('streamChat', () => {
  it('não corta o quadro que chega partido entre dois chunks', async () => {
    configure();
    fetchMock.mockResolvedValue(
      sse([
        'event: messages\ndata: [{"type":"AIMessageChunk","content":"Boa ',
        'tarde","id":"ai-1"},{}]\n\nevent: done\ndata: {"status":"completed"}\n\n',
      ]),
    );

    const eventos = await coletar(streamChat({ conversationId: CONVERSA, message: 'oi' }));

    expect(eventos).toEqual([
      {
        event: 'messages',
        data: [{ type: 'AIMessageChunk', content: 'Boa tarde', id: 'ai-1' }, {}],
      },
      { event: 'done', data: { status: 'completed' } },
    ]);
  });

  it('emite o último quadro mesmo sem linha em branco final', async () => {
    configure();
    fetchMock.mockResolvedValue(sse(['event: done\ndata: {"status":"completed"}']));

    expect(await coletar(streamChat({ conversationId: CONVERSA, message: 'oi' }))).toEqual([
      { event: 'done', data: { status: 'completed' } },
    ]);
  });

  it('manda a conversa e a mensagem, pelo proxy do Next, com Accept de event-stream', async () => {
    configure();
    fetchMock.mockResolvedValue(sse([]));

    await coletar(streamChat({ conversationId: CONVERSA, message: 'oi' }));

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/proxy/chat');
    expect(new Headers(init.headers).get('Accept')).toBe('text/event-stream');
    expect(JSON.parse(init.body as string)).toEqual({ conversationId: CONVERSA, message: 'oi' });
  });

  it('a retomada vai com o id da pausa e sem mensagem', async () => {
    configure();
    fetchMock.mockResolvedValue(sse([]));

    await coletar(
      streamChat({
        conversationId: CONVERSA,
        resume: { interruptId: 'p1', value: { approvals: { c1: true } } },
      }),
    );

    expect(JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string)).toEqual({
      conversationId: CONVERSA,
      resume: { interruptId: 'p1', value: { approvals: { c1: true } } },
    });
  });

  it('falha de rede vira error + done — nunca exceção', async () => {
    configure();
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));

    expect(await coletar(streamChat({ conversationId: CONVERSA, message: 'oi' }))).toEqual([
      { event: 'error', data: { code: 'AI_NETWORK_ERROR' } },
      { event: 'done', data: { status: 'error' } },
    ]);
  });

  it('queda no meio do stream preserva o que já chegou e termina com done', async () => {
    configure();
    const encoder = new TextEncoder();
    let puxadas = 0;
    // `pull`, e não `start`: um erro no `start` descarta o que já estava na fila,
    // e o caso aqui é o oposto — o primeiro pedaço chegou, a conexão caiu depois.
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        puxadas += 1;
        if (puxadas === 1)
          controller.enqueue(encoder.encode('event: start\ndata: {"runId":"r"}\n\n'));
        else controller.error(new Error('caiu'));
      },
    });
    fetchMock.mockResolvedValue(new Response(body, { status: 200 }));

    expect(await coletar(streamChat({ conversationId: CONVERSA, message: 'oi' }))).toEqual([
      { event: 'start', data: { runId: 'r' } },
      { event: 'error', data: { code: 'AI_NETWORK_ERROR' } },
      { event: 'done', data: { status: 'error' } },
    ]);
  });

  it('cota estourada chega como erro nomeado, com o horário em que volta', async () => {
    configure();
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          code: 'AI_QUOTA_EXCEEDED',
          resetsAt: '2026-08-07T00:00:00Z',
          message: 'x',
        }),
        { status: 429 },
      ),
    );

    const [erro] = await coletar(streamChat({ conversationId: CONVERSA, message: 'oi' }));
    expect(erro).toEqual({
      event: 'error',
      data: { code: 'AI_QUOTA_EXCEEDED', resetsAt: '2026-08-07T00:00:00Z' },
    });
  });

  it('retomada fora de hora é 409 com o código de lá', async () => {
    configure();
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ code: 'CHAT_RESUME_MISMATCH', message: 'x' }), { status: 409 }),
    );

    const [erro] = await coletar(
      streamChat({ conversationId: CONVERSA, resume: { interruptId: 'p', value: true } }),
    );
    expect(erro).toEqual({ event: 'error', data: { code: 'CHAT_RESUME_MISMATCH' } });
  });

  it('sem código nomeado, o status ainda separa cota de provedor fora', async () => {
    configure();
    fetchMock.mockResolvedValueOnce(new Response('{}', { status: 429 }));
    fetchMock.mockResolvedValueOnce(new Response('{}', { status: 503 }));

    const [cota] = await coletar(streamChat({ conversationId: CONVERSA, message: 'oi' }));
    const [fora] = await coletar(streamChat({ conversationId: CONVERSA, message: 'oi' }));
    expect(cota.data).toEqual({ code: 'AI_QUOTA_EXCEEDED' });
    expect(fora.data).toEqual({ code: 'AI_PROVIDER_UNREACHABLE' });
  });

  it('401 avisa o transporte antes de emitir o erro', async () => {
    const onUnauthorized = vi.fn();
    configure({ onUnauthorized });
    fetchMock.mockResolvedValue(new Response('{}', { status: 401 }));

    const [erro] = await coletar(streamChat({ conversationId: CONVERSA, message: 'oi' }));

    expect(onUnauthorized).toHaveBeenCalledWith({ path: '/api/chat', body: null });
    expect(erro.data).toEqual({ code: 'AI_UNAUTHORIZED' });
  });
});

describe('textoDeErroDoChat', () => {
  it('separa os casos em que a ação de quem lê é diferente', () => {
    const cota = textoDeErroDoChat({ code: 'AI_QUOTA_EXCEEDED' });
    const fora = textoDeErroDoChat({ code: 'AI_PROVIDER_UNREACHABLE' });
    const config = textoDeErroDoChat({ code: 'AI_PROVIDER_NOT_CONFIGURED' });
    const sessao = textoDeErroDoChat({ code: 'MCP_UNAUTHORIZED' });
    expect(new Set([cota, fora, config, sessao]).size).toBe(4);
  });

  it('todo código conhecido tem cópia', () => {
    for (const code of CHAT_ERROR_CODES) {
      expect(textoDeErroDoChat({ code }).length).toBeGreaterThan(20);
    }
  });

  it('429 do provedor não vira cota — quem conversa não estourou limite nenhum', () => {
    expect(textoDeErroDoChat({ code: 'AI_PROVIDER_REFUSED' })).not.toContain('limite de uso');
  });

  it('a cota diz quando volta em data legível, e não em ISO', () => {
    const texto = textoDeErroDoChat({
      code: 'AI_QUOTA_EXCEEDED',
      resetsAt: '2026-08-07T00:00:00.000Z',
    });
    expect(texto).not.toContain('2026-08-07T00:00:00.000Z');
    expect(texto).toContain('2026');
    expect(texto).toMatch(/\d{2}\/\d{2}\/\d{4},? \d{2}:\d{2}/);
  });

  it('resetsAt impossível cai na frase sem horário em vez de derrubar o balão', () => {
    expect(textoDeErroDoChat({ code: 'AI_QUOTA_EXCEEDED', resetsAt: 'ontem' })).toContain(
      'volta amanhã',
    );
  });
});
