import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  GatewayTimeoutException,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { MessageRole } from '@prisma/client';
import { AgentStreamError } from '../agent.adapter';
import { HttpAgentAdapter } from '../http-agent.adapter';

/**
 * O único cliente HTTP do agente: chat (#249), foto (#139), ditado e título (#141).
 *
 * O agente Python nunca é chamado de verdade — `fetch` é sempre dublê. O que este
 * arquivo fixa é o que sai daqui e o que **não** sai: o Bearer do usuário chega
 * ao agente só no chat (é a inversão que a épica #247 autorizou), a foto vai sem
 * nada de quem a mandou, e nem o token nem o conteúdo aparecem em log nenhum.
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
  return new HttpAgentAdapter(config);
}

const CONVERSA = '3f1c9a52-6b1e-4d8a-9c2f-0a5e7b3d1c44';

const ENTRADA = {
  bearer: 'token-secreto-do-usuario',
  timezone: 'America/Sao_Paulo',
  conversationId: CONVERSA,
  message: 'tomei 3 insulinas hoje',
  history: [{ role: MessageRole.assistant, content: 'oi, tudo bem?' }],
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

describe('HttpAgentAdapter.openTurn', () => {
  it('manda o Bearer do usuário intacto para o agente', async () => {
    dublarFetch(respostaSse('event: done\ndata: {}\n\n'));

    await montar().openTurn(ENTRADA);

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
    await montar({ AGENT_API_KEY: 'segredo-do-compose' }).openTurn(ENTRADA);
    expect((fetchMock.mock.calls[0][1] as RequestInit).headers).toMatchObject({
      'X-Fatia-Agent-Key': 'segredo-do-compose',
    });

    fetchMock.mockRestore();
    dublarFetch(respostaSse('event: done\ndata: {}\n\n'));
    await montar().openTurn(ENTRADA);
    expect((fetchMock.mock.calls[0][1] as RequestInit).headers).not.toHaveProperty(
      'X-Fatia-Agent-Key',
    );
  });

  /**
   * O corpo **exato** que o agente declara, e não um parecido.
   *
   * Esta camada mandava `{conversation_id, timezone, messages}`, que o
   * `ChatRequest` do `apps/agent` recusa com 422 (`extra: "forbid"`): todo turno
   * chegava ao aluno como "o chat falhou". O teste que existia aqui afirmava o
   * corpo errado contra um `fetch` dublê — verde dos dois lados, quebrado no
   * meio. `toEqual` e não `toMatchObject` porque campo a mais é exatamente o que
   * o outro lado recusa.
   */
  it('manda a mensagem, o histórico e o fuso no corpo que o agente declara', async () => {
    dublarFetch(respostaSse('event: done\ndata: {}\n\n'));

    await montar().openTurn(ENTRADA);

    const corpo: unknown = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(corpo).toEqual({
      conversationId: CONVERSA,
      message: 'tomei 3 insulinas hoje',
      timezone: 'America/Sao_Paulo',
      history: [{ role: 'assistant', content: 'oi, tudo bem?' }],
      memories: [],
    });
  });

  /**
   * A resposta a uma pausa vai **sem** `message` e sem interpretação.
   *
   * O agente recusa com 422 um corpo com as duas coisas (`extra: forbid` e o
   * "um dos dois" do `ChatRequest`), e é ele — não esta camada — quem sabe o que
   * a pausa espera (ADR 023).
   */
  it('repassa a retomada no lugar da mensagem, sem tocar no valor', async () => {
    dublarFetch(respostaSse('event: done\ndata: {}\n\n'));
    await montar().openTurn({
      bearer: ENTRADA.bearer,
      timezone: ENTRADA.timezone,
      conversationId: ENTRADA.conversationId,
      history: [],
      resume: { interruptId: 'pausa-1', value: { approvals: { c1: true } } },
    });

    const corpo = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string) as Record<
      string,
      unknown
    >;
    expect(corpo).not.toHaveProperty('message');
    expect(corpo.resume).toEqual({ interruptId: 'pausa-1', value: { approvals: { c1: true } } });
  });

  it('conversa nova vai com o histórico vazio, e não sem o campo', async () => {
    dublarFetch(respostaSse('event: done\ndata: {}\n\n'));

    await montar().openTurn({ ...ENTRADA, history: [] });

    const corpo = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string) as {
      history: unknown;
    };
    expect(corpo.history).toEqual([]);
  });

  it('sem AGENT_BASE_URL recusa 503 sem chamar ninguém', async () => {
    const fetchSpy = dublarFetch(respostaSse(''));

    await expect(montar({ AGENT_BASE_URL: '' }).openTurn(ENTRADA)).rejects.toThrow(
      ServiceUnavailableException,
    );
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(montar({ AGENT_BASE_URL: '' }).configured()).toBe(false);
  });

  it('401 do /mcp é o token da pessoa: sobe como 401, não como instância quebrada', async () => {
    dublarFetch(
      new Response(JSON.stringify({ error: { code: 'MCP_UNAUTHORIZED', message: 'x' } }), {
        status: 401,
      }),
    );

    await expect(montar().openTurn(ENTRADA)).rejects.toThrow(UnauthorizedException);
  });

  it('retomada que não bate com a pausa pendente vira 409 com o code', async () => {
    dublarFetch(
      new Response(JSON.stringify({ error: { code: 'CHAT_RESUME_MISMATCH', message: 'x' } }), {
        status: 409,
      }),
    );

    const erro = await montar()
      .openTurn(ENTRADA)
      .catch((e: unknown) => e);
    expect(erro).toBeInstanceOf(ConflictException);
    expect((erro as ConflictException).getResponse()).toMatchObject({
      code: 'CHAT_RESUME_MISMATCH',
    });
  });

  it('401 do agente é erro de configuração, e não "o modelo falhou"', async () => {
    // API com AGENT_API_KEY e agente sem (ou com outra). Cair no caso genérico
    // mandaria quem opera procurar defeito no modelo.
    dublarFetch(new Response('não autorizado', { status: 401 }));

    await expect(montar().openTurn(ENTRADA)).rejects.toThrow(
      /mal configurado.*autenticar no agente/is,
    );
  });

  it('traduz pelo `code` do agente, e não pela prosa da mensagem', async () => {
    dublarFetch(
      new Response(JSON.stringify({ error: { code: 'AI_PROVIDER_TIMEOUT', message: 'x' } }), {
        status: 504,
      }),
    );
    await expect(montar().openTurn(ENTRADA)).rejects.toThrow(GatewayTimeoutException);

    fetchMock.mockRestore();
    dublarFetch(
      new Response(JSON.stringify({ error: { code: 'AI_PROVIDER_NOT_CONFIGURED' } }), {
        status: 503,
      }),
    );
    await expect(montar().openTurn(ENTRADA)).rejects.toThrow(ServiceUnavailableException);

    fetchMock.mockRestore();
    dublarFetch(new Response(JSON.stringify({ error: { code: 'DESCONHECIDO' } }), { status: 500 }));
    await expect(montar().openTurn(ENTRADA)).rejects.toThrow(BadGatewayException);
  });

  it('socket que cai antes da resposta é tentado de novo uma vez', async () => {
    const caiu = Object.assign(new TypeError('fetch failed'), {
      cause: Object.assign(new Error('other side closed'), { code: 'UND_ERR_SOCKET' }),
    });
    fetchMock = jest
      .spyOn(globalThis, 'fetch')
      .mockRejectedValueOnce(caiu)
      .mockResolvedValueOnce(respostaSse('event: done\ndata: {}\n\n'));

    await montar().openTurn(ENTRADA);

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('não tenta de novo quando o agente recusa de novo, nem em timeout', async () => {
    const recusado = Object.assign(new TypeError('fetch failed'), {
      cause: Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' }),
    });
    fetchMock = jest.spyOn(globalThis, 'fetch').mockRejectedValue(recusado);
    await expect(montar().openTurn(ENTRADA)).rejects.toThrow(ServiceUnavailableException);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    fetchMock.mockRestore();
    const timeout = Object.assign(new Error('timeout'), { name: 'TimeoutError' });
    fetchMock = jest.spyOn(globalThis, 'fetch').mockRejectedValue(timeout);
    await expect(montar().openTurn(ENTRADA)).rejects.toThrow(GatewayTimeoutException);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('agente inacessível vira 503, não 500', async () => {
    dublarFetch(Object.assign(new Error('connect ECONNREFUSED'), { name: 'TypeError' }));
    await expect(montar().openTurn(ENTRADA)).rejects.toThrow(ServiceUnavailableException);
  });
});

describe('HttpAgentAdapter.sendFeedback', () => {
  it('manda o sinal e os motivos com a chave, nunca o comentário livre', async () => {
    dublarFetch(new Response(JSON.stringify({ recorded: true })));
    await montar({ AGENT_API_KEY: 'segredo' }).sendFeedback('run-1', 'dislike', ['incorrect']);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/\/feedback$/);
    expect(init.headers).toMatchObject({ 'X-Fatia-Agent-Key': 'segredo' });
    expect(JSON.parse(init.body as string)).toEqual({
      runId: 'run-1',
      review: 'dislike',
      reasons: ['incorrect'],
    });
  });

  it('nunca lança: agente fora do ar não desfaz o voto', async () => {
    dublarFetch(Object.assign(new Error('connect ECONNREFUSED'), { name: 'TypeError' }));
    await expect(montar().sendFeedback('run-1', 'like', [])).resolves.toBeUndefined();
  });
});

describe('HttpAgentAdapter.title', () => {
  it('pede o nome sem Bearer e devolve título e custo', async () => {
    dublarFetch(
      new Response(
        JSON.stringify({ title: 'Almoço', usage: { model: 'm', inputUnits: 9, outputUnits: 2 } }),
        { status: 200 },
      ),
    );

    const gerado = await montar({ AGENT_API_KEY: 'k' }).title('registra o almoço');

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://agent.local:8100/title');
    expect(init.headers).not.toHaveProperty('Authorization');
    expect(init.headers).toMatchObject({ 'X-Fatia-Agent-Key': 'k' });
    expect(gerado).toEqual({
      title: 'Almoço',
      usage: { model: 'm', inputUnits: 9, outputUnits: 2 },
    });
  });

  it('nunca lança: agente fora do ar ou status ruim viram null', async () => {
    dublarFetch(Object.assign(new Error('boom'), { name: 'TypeError' }));
    await expect(montar().title('oi')).resolves.toBeNull();

    fetchMock.mockRestore();
    dublarFetch(new Response('{}', { status: 503 }));
    await expect(montar().title('oi')).resolves.toBeNull();
  });
});

describe('HttpAgentAdapter — o stream', () => {
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

    const stream = await montar().openTurn(ENTRADA);
    const recebidos: string[] = [];
    for await (const pedaco of stream.chunks()) {
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

    const stream = await montar().openTurn(ENTRADA);
    const consumir = async () => {
      const lidos: Uint8Array[] = [];
      for await (const pedaco of stream.chunks()) lidos.push(pedaco);
      return lidos;
    };
    // Nomeado porque o cabeçalho já foi: o cliente só vai receber isto como
    // evento `error` dentro de um 200.
    await expect(consumir()).rejects.toThrow(AgentStreamError);
  });
});

describe('HttpAgentAdapter — o que NÃO pode vazar', () => {
  it('não escreve o Bearer nem o corpo da conversa em nenhum log', async () => {
    // Percorre os três caminhos que logam: falha de rede, status ruim e stream
    // quebrado. É o conjunto todo, porque basta um deles vazar.
    dublarFetch(Object.assign(new Error('boom'), { name: 'TypeError' }));
    await expect(montar().openTurn(ENTRADA)).rejects.toThrow();

    fetchMock.mockRestore();
    dublarFetch(new Response(JSON.stringify({ error: { code: 'X' } }), { status: 500 }));
    await expect(montar().openTurn(ENTRADA)).rejects.toThrow();

    fetchMock.mockRestore();
    dublarFetch(
      new Response(
        new ReadableStream<Uint8Array>({
          start: (c) => c.error(new Error('caiu')),
        }),
        { status: 200 },
      ),
    );
    const stream = await montar().openTurn(ENTRADA);
    await expect(
      (async () => {
        const lidos: Uint8Array[] = [];
        for await (const pedaco of stream.chunks()) lidos.push(pedaco);
        return lidos;
      })(),
    ).rejects.toThrow();

    const tudo = linhasDeLog.join('\n');
    expect(tudo).not.toBe('');
    expect(tudo).not.toContain('token-secreto-do-usuario');
    expect(tudo).not.toContain('insulinas');
  });
});

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);

const json = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), { status, headers: { 'Content-Type': 'application/json' } });

describe('HttpAgentAdapter.recognizeMeal', () => {
  it('manda só a foto e o formato, com a chave do serviço e sem identidade', async () => {
    dublarFetch(json({ items: [], note: null, usage: null }));

    await montar({ AGENT_API_KEY: 'segredo-do-compose' }).recognizeMeal(JPEG);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://agent.local:8100/recognize-meal');
    // Lista fechada de propósito: um `userId` acrescentado "só para o log"
    // criaria um segundo lugar onde o dado do usuário existe.
    const enviado = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(Object.keys(enviado).sort()).toEqual(['image_base64', 'media_type']);
    expect(Buffer.from(enviado.image_base64 as string, 'base64')).toEqual(JPEG);
    // O segredo é do serviço, não da pessoa: o agente não fica sabendo de quem é a foto.
    expect(Object.keys(init.headers as Record<string, string>).sort()).toEqual([
      'Accept',
      'Content-Type',
      'X-Fatia-Agent-Key',
    ]);
  });

  it('devolve itens, nota e o usage que o agente reportou', async () => {
    dublarFetch(
      json({
        items: [{ name: 'arroz', grams: 150, confidence: 0.9 }],
        note: 'prato cheio',
        usage: { model: 'z-ai/glm-5.3-flash', inputUnits: 1200, outputUnits: 90 },
      }),
    );

    await expect(montar().recognizeMeal(JPEG)).resolves.toEqual({
      items: [{ name: 'arroz', grams: 150, confidence: 0.9 }],
      note: 'prato cheio',
      usage: { model: 'z-ai/glm-5.3-flash', inputUnits: 1200, outputUnits: 90 },
    });
  });

  it('agente antigo, sem usage, vira usage nulo — custo não medido, não zero', async () => {
    dublarFetch(json({ items: [] }));

    await expect(montar().recognizeMeal(JPEG)).resolves.toMatchObject({ usage: null, note: null });
  });

  it('resposta sem `items` vira 502 em vez de itens undefined', async () => {
    dublarFetch(json({ resultado: 'ok' }));

    await expect(montar().recognizeMeal(JPEG)).rejects.toBeInstanceOf(BadGatewayException);
  });

  it('traduz pelo `code` do agente, não pela mensagem em prosa', async () => {
    const casos: Array<[string, unknown]> = [
      ['AI_PROVIDER_NOT_CONFIGURED', ServiceUnavailableException],
      ['AI_PROVIDER_TIMEOUT', GatewayTimeoutException],
      ['AI_RESPONSE_UNPARSEABLE', BadGatewayException],
      ['AI_PROVIDER_REFUSED', BadGatewayException],
    ];
    for (const [code, tipo] of casos) {
      fetchMock?.mockRestore();
      dublarFetch(json({ error: { code, message: 'qualquer coisa' } }, 502));
      await expect(montar().recognizeMeal(JPEG)).rejects.toBeInstanceOf(tipo as never);
    }
  });

  it('401 com a chave recusada é configuração, e a mensagem manda registrar à mão', async () => {
    dublarFetch(json({ error: { code: 'AGENT_KEY_REJECTED', message: 'x' } }, 401));

    await expect(montar().recognizeMeal(JPEG)).rejects.toThrow(
      /mal configurado.*autenticar no agente.*manualmente/is,
    );
  });

  it('timeout vira 504; agente fora do ar vira 503 com o caminho manual', async () => {
    dublarFetch(Object.assign(new Error('aborted'), { name: 'TimeoutError' }));
    await expect(montar().recognizeMeal(JPEG)).rejects.toBeInstanceOf(GatewayTimeoutException);

    fetchMock.mockRestore();
    dublarFetch(Object.assign(new Error('connect ECONNREFUSED'), { name: 'TypeError' }));
    await expect(montar().recognizeMeal(JPEG)).rejects.toThrow(/manualmente/);
  });

  it('socket caído antes da resposta também é tentado de novo na foto', async () => {
    // A correção que antes só chegava ao chat: a conexão do pool que o agente
    // fechou por ociosidade derrubava a foto com 503.
    const caiu = Object.assign(new TypeError('fetch failed'), {
      cause: Object.assign(new Error('other side closed'), { code: 'UND_ERR_SOCKET' }),
    });
    fetchMock = jest
      .spyOn(globalThis, 'fetch')
      .mockRejectedValueOnce(caiu)
      .mockResolvedValueOnce(json({ items: [] }));

    await expect(montar().recognizeMeal(JPEG)).resolves.toMatchObject({ items: [] });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('sem AGENT_BASE_URL responde 503 sem chamar ninguém', async () => {
    const spy = dublarFetch(json({}));

    await expect(montar({ AGENT_BASE_URL: '' }).recognizeMeal(JPEG)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('HttpAgentAdapter.transcribe', () => {
  it('manda o áudio cru, sem Bearer, e lê o texto e o usage', async () => {
    dublarFetch(json({ text: 'almocei arroz', usage: { model: 'whisper-1', inputUnits: 4.2 } }));

    const lido = await montar({ AGENT_API_KEY: 'k' }).transcribe(Buffer.from('ogg'), 'audio/ogg');

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://agent.local:8100/transcribe');
    expect(init.headers).toEqual({ 'X-Fatia-Agent-Key': 'k', 'Content-Type': 'audio/ogg' });
    expect(lido).toEqual({
      text: 'almocei arroz',
      usage: { model: 'whisper-1', inputUnits: 4.2 },
    });
  });

  it('as recusas de formato dizem o que a pessoa pode corrigir', async () => {
    dublarFetch(json({ detail: 'vazio' }, 400));
    await expect(montar().transcribe(Buffer.from('x'), 'audio/ogg')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});

describe('HttpAgentAdapter.capabilities', () => {
  it('foto e ditado pelo que o agente anuncia, e em cache por um minuto', async () => {
    dublarFetch(json({ capabilities: { vision: 'z-ai/glm-5.3-flash', transcription: null } }));
    const adapter = montar();

    await expect(adapter.capabilities(1_000)).resolves.toEqual({
      vision: true,
      transcription: false,
    });
    await adapter.capabilities(30_000);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await adapter.capabilities(70_000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('agente inacessível não estoura — só desliga foto e voz', async () => {
    dublarFetch(new Error('connect ECONNREFUSED'));

    await expect(montar().capabilities()).resolves.toEqual({
      vision: false,
      transcription: false,
    });
  });

  it('sem AGENT_BASE_URL responde nada disponível sem tocar a rede', async () => {
    const spy = dublarFetch(json({}));

    await expect(montar({ AGENT_BASE_URL: '' }).capabilities()).resolves.toEqual({
      vision: false,
      transcription: false,
    });
    expect(spy).not.toHaveBeenCalled();
  });
});
