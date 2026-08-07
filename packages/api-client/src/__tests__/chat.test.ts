import { afterEach, describe, expect, it, vi } from 'vitest';
import { configureApiClient, resetApiClient } from '../http';
import type { ApiTransport } from '../transport';
import {
  CHAT_ERROR_CODES,
  parseQuadro,
  recortarQuadros,
  streamChat,
  textoDeErroDoChat,
  type ChatStreamError,
  type ChatStreamEvent,
  type ChatToolCall,
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

async function coletar(gen: AsyncGenerator<ChatStreamEvent>): Promise<ChatStreamEvent[]> {
  const eventos: ChatStreamEvent[] = [];
  for await (const evento of gen) eventos.push(evento);
  return eventos;
}

afterEach(() => resetApiClient());

describe('recortarQuadros', () => {
  it('só devolve quadro terminado, e guarda o resto', () => {
    const { quadros, resto } = recortarQuadros('event: token\ndata: {"text":"a"}\n\nevent: tok');
    expect(quadros).toEqual(['event: token\ndata: {"text":"a"}']);
    expect(resto).toBe('event: tok');
  });

  it('aceita CRLF, que é o que proxy reverso costuma entregar', () => {
    const { quadros } = recortarQuadros('event: done\r\ndata: {}\r\n\r\n');
    expect(quadros).toEqual(['event: done\ndata: {}']);
  });
});

describe('parseQuadro', () => {
  it('ignora comentário de keep-alive', () => {
    expect(parseQuadro(': ping')).toBeNull();
  });

  it('ignora JSON quebrado em vez de derrubar a conversa', () => {
    expect(parseQuadro('event: token\ndata: {"text":')).toBeNull();
  });

  it('recusa tool sem nome — payload torto não vira bloco mudo na tela', () => {
    expect(parseQuadro('event: tool\ndata: {"id":"t1","state":"output-available"}')).toBeNull();
  });

  it('recusa estado de tool que não existe no contrato', () => {
    expect(parseQuadro('event: tool\ndata: {"id":"t1","name":"x","state":"voando"}')).toBeNull();
  });

  it('código desconhecido vira AI_UNKNOWN_ERROR e a mensagem do servidor não vem junto', () => {
    // A `message` do agente é "para o humano que lê o log" (`errors.py:4-5`) e
    // carrega endpoint, `AI_BASE_URL`, modelo e host do subprocessador (#136).
    const quadro =
      'event: error\ndata: {"code":"AI_NOVIDADE","message":"Falha em POST chat/completions. Verifique AI_BASE_URL."}';
    expect(parseQuadro(quadro)).toEqual({ type: 'error', error: { code: 'AI_UNKNOWN_ERROR' } });
  });
});

describe('streamChat', () => {
  it('não corta o token quando o quadro chega partido entre dois chunks', async () => {
    configure();
    // O corte cai no meio do JSON — é o caso que um parser ingênuo transforma em
    // "ol" seguido de nada, ou em exceção de JSON.
    fetchMock.mockResolvedValueOnce(
      sse(['event: token\ndata: {"te', 'xt":"Olá "}\n\nevent: token\ndata: {"text":"mundo"}\n\n']),
    );

    const esperado: ChatStreamEvent[] = [
      { type: 'token', text: 'Olá ' },
      { type: 'token', text: 'mundo' },
    ];
    await expect(coletar(streamChat({ message: 'oi' }))).resolves.toEqual(esperado);
  });

  it('emite o último quadro mesmo sem linha em branco final', async () => {
    configure();
    fetchMock.mockResolvedValueOnce(sse(['event: token\ndata: {"text":"fim"}']));
    await expect(coletar(streamChat({ message: 'oi' }))).resolves.toEqual([
      { type: 'token', text: 'fim' },
    ]);
  });

  it('entrega a chamada de tool com o mesmo id nos dois quadros', async () => {
    configure();
    // Fixtures anotadas com o tipo do cliente: se o contrato mudar de forma, o
    // erro aparece no `tsc` e não como bloco vazio na tela (lição da #157).
    const chamada: ChatToolCall = {
      id: 'call-1',
      name: 'registrar_refeicao',
      state: 'input-available',
      input: { descricao: '2 ovos' },
    };
    const resultado: ChatToolCall = {
      id: 'call-1',
      name: 'registrar_refeicao',
      state: 'output-available',
      output: { mealId: 'm-1' },
    };
    fetchMock.mockResolvedValueOnce(
      sse([
        `event: tool\ndata: ${JSON.stringify(chamada)}\n\n`,
        `event: tool\ndata: ${JSON.stringify(resultado)}\n\n`,
      ]),
    );

    await expect(coletar(streamChat({ message: 'registra 2 ovos' }))).resolves.toEqual([
      { type: 'tool', tool: chamada },
      { type: 'tool', tool: resultado },
    ]);
  });

  it('manda o conversationId no corpo — é o que continua a mesma conversa', async () => {
    configure();
    fetchMock.mockResolvedValueOnce(sse(['event: done\ndata: {}\n\n']));
    await coletar(streamChat({ message: 'e depois?', conversationId: 'conv-9' }));
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toEqual({
      message: 'e depois?',
      conversationId: 'conv-9',
    });
  });

  it('vai pelo proxy do Next, com o Accept de event-stream', async () => {
    configure();
    fetchMock.mockResolvedValueOnce(sse(['event: done\ndata: {}\n\n']));
    await coletar(streamChat({ message: 'oi' }));
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/proxy/chat');
    expect((init.headers as Headers).get('accept')).toBe('text/event-stream');
  });

  it('falha de rede vira evento de erro — nunca exceção', async () => {
    configure();
    fetchMock.mockRejectedValueOnce(new Error('Failed to fetch'));
    const eventos = await coletar(streamChat({ message: 'oi' }));
    expect(eventos).toEqual([{ type: 'error', error: { code: 'AI_NETWORK_ERROR' } }]);
  });

  it('queda no meio do stream preserva o que já chegou', async () => {
    configure();
    const encoder = new TextEncoder();
    let entregou = false;
    // `pull` e não `start`: `controller.error()` descarta o que ainda está na
    // fila, então errar no `start` simularia uma queda **antes** do primeiro
    // token — que é outro caso, e o teste passaria sem provar nada.
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (entregou) {
          controller.error(new Error('network error'));
          return;
        }
        entregou = true;
        controller.enqueue(encoder.encode('event: token\ndata: {"text":"come"}\n\n'));
      },
    });
    fetchMock.mockResolvedValueOnce(
      new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } }),
    );

    const eventos = await coletar(streamChat({ message: 'oi' }));
    expect(eventos[0]).toEqual({ type: 'token', text: 'come' });
    expect(eventos[1]).toMatchObject({ type: 'error', error: { code: 'AI_NETWORK_ERROR' } });
  });

  it.each([
    [429, 'AI_QUOTA_EXCEEDED'],
    [503, 'AI_PROVIDER_UNREACHABLE'],
    [500, 'AI_UNKNOWN_ERROR'],
  ])('status %i sem código nomeado ainda distingue o caso', async (status, code) => {
    configure();
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ message: 'x' }), {
        status,
        headers: { 'content-type': 'application/json' },
      }),
    );
    const eventos = await coletar(streamChat({ message: 'oi' }));
    expect(eventos).toHaveLength(1);
    expect(eventos[0]).toMatchObject({ type: 'error', error: { code } });
  });

  it('respeita o código nomeado do corpo acima do status', async () => {
    configure();
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ code: 'AI_PROVIDER_NOT_CONFIGURED', message: 'sem provedor' }),
        { status: 503, headers: { 'content-type': 'application/json' } },
      ),
    );
    const eventos = await coletar(streamChat({ message: 'oi' }));
    expect(eventos[0]).toEqual({
      type: 'error',
      error: { code: 'AI_PROVIDER_NOT_CONFIGURED' },
    });
  });

  it('código desconhecido não põe diagnóstico do servidor na tela', async () => {
    configure();
    // Payload real de `apps/agent/.../openai_compat.py:266` quando o provedor
    // está fora do ar. A `message` nomeia endpoint e variável de ambiente, e —
    // em `AIModelNotAllowed`/`AIEndpointNotAllowed` — modelo e host do
    // subprocessador, que é o que a #136 controla.
    const doServidor = {
      code: 'AI_CODIGO_QUE_AINDA_NAO_EXISTE',
      message:
        'Falha de transporte em POST chat/completions: ConnectError. Verifique AI_BASE_URL e ' +
        'se o provedor está no ar.',
    };
    fetchMock.mockResolvedValueOnce(sse([`event: error\ndata: ${JSON.stringify(doServidor)}\n\n`]));

    const eventos = await coletar(streamChat({ message: 'oi' }));
    const evento = eventos[0] as Extract<ChatStreamEvent, { type: 'error' }>;
    expect(evento).toEqual({ type: 'error', error: { code: 'AI_UNKNOWN_ERROR' } });

    const naTela = textoDeErroDoChat(evento.error);
    expect(naTela).not.toContain('AI_BASE_URL');
    expect(naTela).not.toContain('chat/completions');
  });

  it('401 avisa o transporte antes de emitir o erro', async () => {
    const onUnauthorized = vi.fn();
    configure({ onUnauthorized });
    fetchMock.mockResolvedValueOnce(new Response('', { status: 401 }));
    const eventos = await coletar(streamChat({ message: 'oi' }));
    expect(onUnauthorized).toHaveBeenCalledOnce();
    expect(eventos).toEqual([{ type: 'error', error: { code: 'AI_UNAUTHORIZED' } }]);
  });
});

describe('textoDeErroDoChat', () => {
  it('separa os casos em que a ação de quem lê é diferente', () => {
    const casos: ChatStreamError[] = [
      { code: 'AI_PROVIDER_NOT_CONFIGURED' },
      { code: 'AI_PROVIDER_UNREACHABLE' },
      { code: 'AI_PROVIDER_TIMEOUT' },
      { code: 'AI_RESPONSE_TRUNCATED' },
      { code: 'AI_QUOTA_EXCEEDED' },
      { code: 'AI_NETWORK_ERROR' },
      { code: 'AI_UNAUTHORIZED' },
    ];
    expect(new Set(casos.map(textoDeErroDoChat)).size).toBe(casos.length);
  });

  it('todo código conhecido tem cópia', () => {
    for (const code of CHAT_ERROR_CODES) {
      expect(textoDeErroDoChat({ code }).length).toBeGreaterThan(20);
    }
  });

  it('429 do provedor não vira cota — quem conversa não estourou limite nenhum', () => {
    expect(textoDeErroDoChat({ code: 'AI_PROVIDER_REFUSED' })).not.toContain('limite diário');
  });

  it('a cota diz quando volta em data legível, e não em ISO', () => {
    const texto = textoDeErroDoChat({
      code: 'AI_QUOTA_EXCEEDED',
      resetsAt: '2026-08-07T00:00:00.000Z',
    });
    expect(texto).not.toContain('2026-08-07T00:00:00.000Z');
    // Sem fuso fixo no caso: a data sai no do aparelho. O ano é o mesmo em
    // qualquer fuso da Terra, e prova que a frase veio do `resetsAt`.
    expect(texto).toContain('2026');
    expect(texto).toMatch(/\d{2}\/\d{2}\/\d{4},? \d{2}:\d{2}/);
  });

  it('resetsAt impossível cai na frase sem horário em vez de derrubar o balão', () => {
    expect(textoDeErroDoChat({ code: 'AI_QUOTA_EXCEEDED', resetsAt: 'ontem' })).toContain(
      'volta amanhã',
    );
  });
});
