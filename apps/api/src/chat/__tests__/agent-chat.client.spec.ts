import {
  BadGatewayException,
  GatewayTimeoutException,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { MessageRole } from '@prisma/client';
import { AgentChatClient, ErroDeStreamDoAgente } from '../agent-chat.client';

/**
 * O cliente do `/chat` do agente (#249).
 *
 * O agente Python nunca é chamado de verdade — `fetch` é sempre dublê. O que este
 * arquivo fixa é o que sai daqui e o que **não** sai: o Bearer do usuário chega
 * ao agente (é a inversão que a épica #247 autorizou), e nem ele nem o corpo da
 * conversa aparecem em log nenhum.
 */

const ENV_PADRAO: Record<string, string> = {
  AGENT_BASE_URL: 'http://agent.local:8100',
  AGENT_API_KEY: '',
};

function montar(env: Record<string, string> = {}) {
  const valores = { ...ENV_PADRAO, ...env };
  const config = {
    get: (chave: string, padrao?: string) => valores[chave] ?? padrao,
  } as unknown as ConfigService;
  return new AgentChatClient(config);
}

const ENTRADA = {
  bearer: 'token-secreto-do-usuario',
  conversationId: 'c1',
  timezone: 'America/Sao_Paulo',
  messages: [{ role: MessageRole.user, content: 'tomei 3 insulinas hoje' }],
};

function respostaSse(texto: string, status = 200) {
  return new Response(
    new ReadableStream<Uint8Array>({
      start(controlador) {
        controlador.enqueue(new TextEncoder().encode(texto));
        controlador.close();
      },
    }),
    { status, headers: { 'Content-Type': 'text/event-stream' } },
  );
}

let fetchMock: jest.SpyInstance;
const linhasDeLog: string[] = [];

beforeEach(() => {
  linhasDeLog.length = 0;
  for (const nivel of ['warn', 'error', 'log', 'debug'] as const) {
    jest.spyOn(Logger.prototype, nivel).mockImplementation((mensagem: unknown) => {
      linhasDeLog.push(String(mensagem));
    });
  }
});

afterEach(() => {
  fetchMock?.mockRestore();
  jest.restoreAllMocks();
});

function dublarFetch(resposta: Response | Error) {
  fetchMock = jest.spyOn(globalThis, 'fetch').mockImplementation(async () => {
    if (resposta instanceof Error) throw resposta;
    return resposta;
  });
  return fetchMock;
}

describe('AgentChatClient.abrir', () => {
  it('manda o Bearer do usuário intacto para o agente', async () => {
    dublarFetch(respostaSse('event: done\ndata: {}\n\n'));

    await montar().abrir(ENTRADA);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://agent.local:8100/chat');
    const headers = init.headers as Record<string, string>;
    // É com este token que o agente chama o `/mcp` em nome da pessoa. Sem ele, a
    // única coisa que o agente consegue ler é nada.
    expect(headers.Authorization).toBe('Bearer token-secreto-do-usuario');
    expect(headers.Accept).toBe('text/event-stream');
  });

  it('manda o segredo compartilhado quando configurado, e omite quando não', async () => {
    dublarFetch(respostaSse('event: done\ndata: {}\n\n'));
    await montar({ AGENT_API_KEY: 'segredo-do-compose' }).abrir(ENTRADA);
    expect((fetchMock.mock.calls[0][1] as RequestInit).headers).toMatchObject({
      'X-Fatia-Agent-Key': 'segredo-do-compose',
    });

    fetchMock.mockRestore();
    dublarFetch(respostaSse('event: done\ndata: {}\n\n'));
    await montar().abrir(ENTRADA);
    expect((fetchMock.mock.calls[0][1] as RequestInit).headers).not.toHaveProperty(
      'X-Fatia-Agent-Key',
    );
  });

  it('manda o histórico e o fuso no corpo, com `conversation_id` nulo quando é conversa nova', async () => {
    dublarFetch(respostaSse('event: done\ndata: {}\n\n'));

    await montar().abrir({ ...ENTRADA, conversationId: null });

    const corpo: unknown = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(corpo).toEqual({
      conversation_id: null,
      timezone: 'America/Sao_Paulo',
      messages: [{ role: 'user', content: 'tomei 3 insulinas hoje' }],
    });
  });

  it('sem AGENT_BASE_URL recusa 503 sem chamar ninguém', async () => {
    const fetchSpy = dublarFetch(respostaSse(''));

    await expect(montar({ AGENT_BASE_URL: '' }).abrir(ENTRADA)).rejects.toThrow(
      ServiceUnavailableException,
    );
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(montar({ AGENT_BASE_URL: '' }).configurado()).toBe(false);
  });

  it('401 do agente é erro de configuração, e não "o modelo falhou"', async () => {
    // API com AGENT_API_KEY e agente sem (ou com outra). Cair no caso genérico
    // mandaria quem opera procurar defeito no modelo.
    dublarFetch(new Response('não autorizado', { status: 401 }));

    await expect(montar().abrir(ENTRADA)).rejects.toThrow(
      /mal configurado.*autenticar no agente/is,
    );
  });

  it('traduz pelo `code` do agente, e não pela prosa da mensagem', async () => {
    dublarFetch(
      new Response(JSON.stringify({ error: { code: 'AI_PROVIDER_TIMEOUT', message: 'x' } }), {
        status: 504,
      }),
    );
    await expect(montar().abrir(ENTRADA)).rejects.toThrow(GatewayTimeoutException);

    fetchMock.mockRestore();
    dublarFetch(
      new Response(JSON.stringify({ error: { code: 'AI_PROVIDER_NOT_CONFIGURED' } }), {
        status: 503,
      }),
    );
    await expect(montar().abrir(ENTRADA)).rejects.toThrow(ServiceUnavailableException);

    fetchMock.mockRestore();
    dublarFetch(new Response(JSON.stringify({ error: { code: 'DESCONHECIDO' } }), { status: 500 }));
    await expect(montar().abrir(ENTRADA)).rejects.toThrow(BadGatewayException);
  });

  it('agente inacessível vira 503, não 500', async () => {
    dublarFetch(Object.assign(new Error('connect ECONNREFUSED'), { name: 'TypeError' }));
    await expect(montar().abrir(ENTRADA)).rejects.toThrow(ServiceUnavailableException);
  });
});

describe('AgentChatClient — o stream', () => {
  it('entrega os pedaços na ordem em que o agente os emitiu', async () => {
    const partes = ['event: token\ndata: {"text":"a"}\n\n', 'event: token\ndata: {"text":"b"}\n\n'];
    dublarFetch(
      new Response(
        new ReadableStream<Uint8Array>({
          start(controlador) {
            for (const parte of partes) controlador.enqueue(new TextEncoder().encode(parte));
            controlador.close();
          },
        }),
        { status: 200 },
      ),
    );

    const stream = await montar().abrir(ENTRADA);
    const recebidos: string[] = [];
    for await (const pedaco of stream.pedacos()) {
      recebidos.push(new TextDecoder().decode(pedaco));
    }
    expect(recebidos).toEqual(partes);
  });

  it('corpo que quebra no meio vira erro nomeado, não exceção crua', async () => {
    dublarFetch(
      new Response(
        new ReadableStream<Uint8Array>({
          start(controlador) {
            controlador.enqueue(new TextEncoder().encode('event: token\ndata: {"text":"a"}\n\n'));
            controlador.error(new Error('conexão caiu'));
          },
        }),
        { status: 200 },
      ),
    );

    const stream = await montar().abrir(ENTRADA);
    const consumir = async () => {
      const lidos: Uint8Array[] = [];
      for await (const pedaco of stream.pedacos()) lidos.push(pedaco);
      return lidos;
    };
    // Nomeado porque o cabeçalho já foi: o cliente só vai receber isto como
    // evento `error` dentro de um 200.
    await expect(consumir()).rejects.toThrow(ErroDeStreamDoAgente);
  });
});

describe('AgentChatClient — o que NÃO pode vazar', () => {
  it('não escreve o Bearer nem o corpo da conversa em nenhum log', async () => {
    // Percorre os três caminhos que logam: falha de rede, status ruim e stream
    // quebrado. É o conjunto todo, porque basta um deles vazar.
    dublarFetch(Object.assign(new Error('boom'), { name: 'TypeError' }));
    await expect(montar().abrir(ENTRADA)).rejects.toThrow();

    fetchMock.mockRestore();
    dublarFetch(new Response(JSON.stringify({ error: { code: 'X' } }), { status: 500 }));
    await expect(montar().abrir(ENTRADA)).rejects.toThrow();

    fetchMock.mockRestore();
    dublarFetch(
      new Response(
        new ReadableStream<Uint8Array>({
          start: (c) => c.error(new Error('caiu')),
        }),
        { status: 200 },
      ),
    );
    const stream = await montar().abrir(ENTRADA);
    await expect(
      (async () => {
        const lidos: Uint8Array[] = [];
        for await (const pedaco of stream.pedacos()) lidos.push(pedaco);
        return lidos;
      })(),
    ).rejects.toThrow();

    const tudo = linhasDeLog.join('\n');
    expect(tudo).not.toBe('');
    expect(tudo).not.toContain('token-secreto-do-usuario');
    expect(tudo).not.toContain('insulinas');
  });
});
