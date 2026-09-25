import { BadRequestException, Logger, NotFoundException } from '@nestjs/common';
import { MessageRole } from '@prisma/client';
import { AiQuotaExceededException } from '../../ai/ai-quota';
import type { AiUsageService } from '../../ai/ai-usage.service';
import type { CurrentUserPayload } from '../../common/decorators/current-user.decorator';
import {
  ErroDeStreamDoAgente,
  type AgentChatClient,
  type EntradaDoTurno,
  type StreamDoAgente,
  type TituloDoAgente,
} from '../agent-chat.client';
import { ChatService, type DestinoDoStream } from '../chat.service';
import type {
  ConversationService,
  MensagemDoHistorico,
  RespostaDoTurno,
} from '../conversation.service';

/**
 * O turno de chat (#249).
 *
 * O caso que dá nome ao arquivo é o **repasse sem bufferizar**: existe um teste
 * que só passa se o byte do agente chegar ao cliente **antes** de o stream
 * terminar. Uma implementação que junte tudo e escreva no fim continua correta
 * para todos os outros testes daqui — e faz o chat parecer travado, que é
 * exatamente o desperdício que a épica #247 manda evitar.
 *
 * Os dublês são declarados com `satisfies Partial<...>` de propósito: um dublê
 * cuja forma a realidade não tem passa verde justamente sobre a tradução que
 * deveria testar. Aqui, mudar a assinatura do serviço real quebra este arquivo no
 * `tsc`.
 */

const enc = (texto: string) => new TextEncoder().encode(texto);
const dec = (bytes: Uint8Array | string) =>
  typeof bytes === 'string' ? bytes : new TextDecoder().decode(bytes);

const USUARIO: CurrentUserPayload = {
  id: 'user-a',
  email: 'a@test.local',
  role: 'USER',
  timezone: 'America/Sao_Paulo',
};

const CONVERSA = '3f1c9a52-6b1e-4d8a-9c2f-0a5e7b3d1c44';

/** Os quadros do protocolo nativo (ADR 023), na forma exata que o agente emite. */
const quadro = (evento: string, dados: unknown) =>
  `event: ${evento}\ndata: ${JSON.stringify(dados)}\n\n`;
const fragmento = (id: string, texto: string) =>
  quadro('messages', [
    { type: 'AIMessageChunk', content: texto, id },
    { langgraph_node: 'agente' },
  ]);
const pedidoDeTool = (id: string, ...nomes: string[]) =>
  quadro('updates', {
    agente: {
      messages: [
        {
          type: 'ai',
          id,
          tool_calls: nomes.map((name, i) => ({ id: `c${i}`, name, args: {} })),
        },
      ],
    },
  });
const pausa = (id: string, value: unknown) => quadro('updates', { __interrupt__: [{ id, value }] });
const completa = (id: string, texto: string) =>
  quadro('messages/complete', [{ type: 'ai', id, content: texto }]);
const fim = (status: string) => quadro('done', { status });
const turnoNovo = (message: string) => ({ conversationId: CONVERSA, message });

/** Deixa o laço de eventos girar — o `await` sozinho não basta para I/O falso. */
const respirar = () => new Promise((resolve) => setImmediate(resolve));

/**
 * Um stream que o teste controla pedaço a pedaço.
 *
 * É o que permite perguntar "o cliente já recebeu isto?" **enquanto** o agente
 * ainda está falando. Com um array pronto não dá para distinguir repasse de
 * acúmulo: os dois terminam com os mesmos bytes escritos.
 */
function canalDoAgente() {
  const fila: Array<Uint8Array | null> = [];
  const aguardando: Array<(valor: Uint8Array | null) => void> = [];
  let cancelado = false;

  const entregar = (valor: Uint8Array | null) => {
    const proximo = aguardando.shift();
    if (proximo) proximo(valor);
    else fila.push(valor);
  };

  const proximo = () =>
    new Promise<Uint8Array | null>((resolve) => {
      const pronto = fila.shift();
      if (pronto !== undefined) resolve(pronto);
      else aguardando.push(resolve);
    });

  const stream: StreamDoAgente = {
    cancelar: () => {
      cancelado = true;
      entregar(null);
    },
    async *pedacos() {
      for (;;) {
        const valor = await proximo();
        if (valor === null) return;
        yield valor;
      }
    },
  };

  return {
    stream,
    emitir: (texto: string) => entregar(enc(texto)),
    encerrar: () => entregar(null),
    foiCancelado: () => cancelado,
  };
}

function destinoDeTeste() {
  const escritos: string[] = [];
  let fechouCallback: (() => void) | null = null;
  const destino: DestinoDoStream = {
    escrever: (pedaco) => {
      escritos.push(dec(pedaco));
    },
    fim: jest.fn(),
    aoFechar: (callback) => {
      fechouCallback = callback;
    },
  };
  return {
    destino,
    escritos,
    tudo: () => escritos.join(''),
    simularClienteSaindo: () => fechouCallback?.(),
  };
}

function montar(
  opcoes: {
    stream?: StreamDoAgente;
    historico?: MensagemDoHistorico[];
    /** `false` = a conversa ainda não existe (primeira mensagem). */
    existente?: boolean;
    /** Segura o `abrir` até resolver — a janela em que o agente ainda pensa. */
    atrasarAbertura?: Promise<void>;
  } = {},
) {
  const canal = canalDoAgente();
  const stream = opcoes.stream ?? canal.stream;
  const chamadas: EntradaDoTurno[] = [];

  const conversas = {
    encontrar: jest.fn(async (_userId: string, id: string) =>
      opcoes.existente === false
        ? null
        : { id, userId: 'user-a', title: 't', createdAt: new Date(0), updatedAt: new Date(0) },
    ),
    historicoParaOAgente: jest.fn(
      async (_userId: string, _id: string): Promise<MensagemDoHistorico[]> =>
        opcoes.historico ?? [],
    ),
    limparPausas: jest.fn(async (_userId: string, _id: string): Promise<void> => undefined),
    iniciarTurno: jest.fn(async (_userId: string, id: string, _texto: string) => ({
      conversationId: id,
    })),
    titularSeProvisorio: jest.fn(
      async (_u: string, _c: string, _p: string, _t: string): Promise<void> => undefined,
    ),
    concluirTurno: jest.fn(
      async (
        _userId: string,
        _conversationId: string,
        _resposta: RespostaDoTurno,
      ): Promise<string | null> => 'linha-1',
    ),
  } satisfies Partial<ConversationService>;

  const agent = {
    abrir: jest.fn(async (entrada: EntradaDoTurno): Promise<StreamDoAgente> => {
      chamadas.push(entrada);
      if (opcoes.atrasarAbertura) await opcoes.atrasarAbertura;
      return stream;
    }),
    titular: jest.fn(async (_texto: string): Promise<TituloDoAgente | null> => null),
  } satisfies Partial<AgentChatClient>;

  const uso = {
    assertDentroDaCota: jest.fn(async (_userId: string): Promise<void> => undefined),
    registrar: jest.fn(
      async (
        _userId: string,
        _entrada: { feature: string; model: string | null; units: Record<string, unknown> },
      ): Promise<void> => undefined,
    ),
  } satisfies Partial<AiUsageService>;

  const service = new ChatService(
    conversas as unknown as ConversationService,
    agent as unknown as AgentChatClient,
    uso as unknown as AiUsageService,
  );

  return { service, conversas, agent, uso, canal, chamadasAoAgente: chamadas };
}

beforeEach(() => {
  // O turno grava com `catch` e loga a falha; sem silenciar, o teste do caminho
  // triste enche a saída de ruído vermelho que não é falha.
  jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
});

afterEach(() => jest.restoreAllMocks());

describe('ChatService — repasse do SSE', () => {
  it('escreve o pedaço no cliente ANTES de o stream terminar', async () => {
    const { service, canal } = montar();
    const saida = destinoDeTeste();

    const turno = service.conversar(USUARIO, turnoNovo('oi'), 'token-do-usuario', saida.destino);
    await respirar();

    canal.emitir(fragmento('ai-1', 'Boa '));
    await respirar();

    // O ponto do arquivo inteiro: aqui o agente AINDA está falando. Uma
    // implementação que acumulasse para escrever no fim não teria escrito nada
    // neste instante, e esta linha ficaria vermelha.
    expect(saida.tudo()).toContain('"Boa "');

    canal.emitir(fragmento('ai-1', 'tarde'));
    await respirar();
    expect(saida.tudo()).toContain('"tarde"');

    canal.encerrar();
    await turno;
  });

  it('repassa os bytes do agente sem reescrever o envelope', async () => {
    const { service, canal } = montar();
    const saida = destinoDeTeste();

    const turno = service.conversar(USUARIO, turnoNovo('oi'), 'tok', saida.destino);
    await respirar();
    canal.emitir(pedidoDeTool('ai-1', 'log_meal'));
    canal.encerrar();
    await turno;

    expect(saida.tudo()).toContain(pedidoDeTool('ai-1', 'log_meal'));
  });

  it('fecha com `persisted`, ligando o id da tela à linha do banco', async () => {
    const { service, canal } = montar();
    const saida = destinoDeTeste();

    const turno = service.conversar(USUARIO, turnoNovo('oi'), 'tok', saida.destino);
    await respirar();
    canal.emitir(fragmento('ai-1', 'Oi!'));
    canal.emitir(fim('completed'));
    canal.encerrar();
    await turno;

    // Depois do `done` do agente: é o último quadro, e o voto da tela depende dele.
    expect(saida.escritos.at(-1)).toBe(
      quadro('persisted', { messageId: 'ai-1', assistantMessageId: 'linha-1' }),
    );
  });

  it('corta o upstream quando o cliente vai embora', async () => {
    const { service, canal } = montar();
    const saida = destinoDeTeste();

    const turno = service.conversar(USUARIO, turnoNovo('oi'), 'tok', saida.destino);
    await respirar();
    saida.simularClienteSaindo();
    await turno;

    expect(canal.foiCancelado()).toBe(true);
  });

  it('corta o upstream quando o cliente vai embora ANTES de o agente responder', async () => {
    const canal = canalDoAgente();
    let aceitarOTurno!: () => void;
    const abriu = new Promise<void>((resolve) => {
      aceitarOTurno = resolve;
    });
    const { service } = montar({ stream: canal.stream, atrasarAbertura: abriu });
    const saida = destinoDeTeste();

    const turno = service.conversar(USUARIO, turnoNovo('oi'), 'tok', saida.destino);
    await respirar();

    // Aba fechada com o `abrir` ainda pendurado. `res.on('close')` NÃO reentrega
    // um evento já emitido: registrar o callback só depois do `await abrir`
    // deixava esta janela inteira sem cancelamento nenhum.
    saida.simularClienteSaindo();
    aceitarOTurno();
    await respirar();
    await respirar();

    const cancelou = canal.foiCancelado();
    canal.encerrar();
    await turno;

    expect(cancelou).toBe(true);
  });
});

describe('ChatService — ordem das guardas', () => {
  it('conversa alheia recusa sem chamar o agente', async () => {
    const { service, agent, uso, conversas } = montar();
    conversas.encontrar.mockRejectedValueOnce(new NotFoundException('Conversa não encontrada.'));
    const saida = destinoDeTeste();

    await expect(service.conversar(USUARIO, turnoNovo('oi'), 'tok', saida.destino)).rejects.toThrow(
      NotFoundException,
    );

    // Recusar depois de gastar seria recusar tarde: o dinheiro já teria saído.
    expect(agent.abrir).not.toHaveBeenCalled();
    expect(uso.assertDentroDaCota).not.toHaveBeenCalled();
    // A recusa chega como 404 de verdade, não como um 200 com erro dentro.
    expect(saida.escritos).toEqual([]);
  });

  it('retomada numa conversa que não existe é 404, sem chamar o agente', async () => {
    const { service, agent } = montar({ existente: false });
    const saida = destinoDeTeste();

    await expect(
      service.conversar(
        USUARIO,
        { conversationId: CONVERSA, resume: { interruptId: 'p1', value: true } },
        'tok',
        saida.destino,
      ),
    ).rejects.toThrow(NotFoundException);
    expect(agent.abrir).not.toHaveBeenCalled();
  });

  it('mensagem e retomada juntas é 400', async () => {
    const { service, agent } = montar();
    await expect(
      service.conversar(
        USUARIO,
        { conversationId: CONVERSA, message: 'oi', resume: { interruptId: 'p1', value: true } },
        'tok',
        destinoDeTeste().destino,
      ),
    ).rejects.toThrow(BadRequestException);
    expect(agent.abrir).not.toHaveBeenCalled();
  });

  it('cota estourada recusa antes de chamar o agente', async () => {
    const { service, agent, uso, conversas } = montar();
    uso.assertDentroDaCota.mockRejectedValueOnce(
      new AiQuotaExceededException({
        allowed: false,
        scope: 'user',
        spentMicros: 10,
        limitMicros: 10,
        resetsAt: new Date('2026-08-07T00:00:00Z'),
      }),
    );
    const saida = destinoDeTeste();

    await expect(service.conversar(USUARIO, turnoNovo('oi'), 'tok', saida.destino)).rejects.toThrow(
      AiQuotaExceededException,
    );

    expect(agent.abrir).not.toHaveBeenCalled();
    expect(conversas.iniciarTurno).not.toHaveBeenCalled();
    expect(saida.escritos).toEqual([]);
  });

  it('agente fora do ar não deixa a pergunta órfã no histórico', async () => {
    const { service, agent, conversas } = montar();
    agent.abrir.mockRejectedValueOnce(new Error('conexão recusada'));

    await expect(
      service.conversar(USUARIO, turnoNovo('oi'), 'tok', destinoDeTeste().destino),
    ).rejects.toThrow();

    expect(conversas.iniciarTurno).not.toHaveBeenCalled();
    expect(conversas.limparPausas).not.toHaveBeenCalled();
  });

  it('manda o Bearer, a conversa e o histórico junto da mensagem nova', async () => {
    const { service, canal, chamadasAoAgente } = montar({
      historico: [{ role: MessageRole.user, content: 'anterior' }],
    });

    const turno = service.conversar(
      USUARIO,
      turnoNovo('e agora?'),
      'token-do-usuario',
      destinoDeTeste().destino,
    );
    await respirar();
    canal.encerrar();
    await turno;

    expect(chamadasAoAgente[0]).toEqual({
      bearer: 'token-do-usuario',
      timezone: 'America/Sao_Paulo',
      conversationId: CONVERSA,
      mensagem: 'e agora?',
      historico: [{ role: MessageRole.user, content: 'anterior' }],
    });
  });

  it('conversa nova vai ao agente com o histórico vazio, e nasce com o id do PWA', async () => {
    const { service, canal, chamadasAoAgente, conversas } = montar({ existente: false });

    const turno = service.conversar(USUARIO, turnoNovo('oi'), 'tok', destinoDeTeste().destino);
    await respirar();
    canal.encerrar();
    await turno;

    expect(chamadasAoAgente[0].historico).toEqual([]);
    expect(conversas.historicoParaOAgente).not.toHaveBeenCalled();
    expect(conversas.iniciarTurno).toHaveBeenCalledWith('user-a', CONVERSA, 'oi');
  });

  it('a retomada vai ao agente sem mensagem e não grava fala da pessoa', async () => {
    const { service, canal, chamadasAoAgente, conversas } = montar();

    const turno = service.conversar(
      USUARIO,
      {
        conversationId: CONVERSA,
        resume: { interruptId: 'p1', value: { approvals: { c0: true } } },
      },
      'tok',
      destinoDeTeste().destino,
    );
    await respirar();
    canal.encerrar();
    await turno;

    expect(chamadasAoAgente[0]).toMatchObject({
      retomada: { interruptId: 'p1', value: { approvals: { c0: true } } },
    });
    expect(chamadasAoAgente[0].mensagem).toBeUndefined();
    expect(conversas.iniciarTurno).not.toHaveBeenCalled();
    // A pausa anterior está resolvida: o card não pode voltar depois de um F5.
    expect(conversas.limparPausas).toHaveBeenCalledWith('user-a', CONVERSA);
  });
});

describe('ChatService — o que fica no banco', () => {
  it('junta os fragmentos de uma mensagem, e a completa tem a palavra final', async () => {
    const { service, canal, conversas } = montar();

    const turno = service.conversar(USUARIO, turnoNovo('oi'), 'tok', destinoDeTeste().destino);
    await respirar();
    canal.emitir(quadro('start', { conversationId: CONVERSA, runId: 'run-9' }));
    canal.emitir(fragmento('ai-1', 'Boa '));
    canal.emitir(fragmento('ai-1', 'tar'));
    // O stream pode ter perdido um pedaço; o estado do grafo é a verdade.
    canal.emitir(completa('ai-1', 'Boa tarde!'));
    canal.emitir(fim('completed'));
    canal.encerrar();
    await turno;

    expect(conversas.concluirTurno).toHaveBeenCalledWith('user-a', CONVERSA, {
      texto: 'Boa tarde!',
      tools: [],
      status: 'completed',
      pausa: null,
      runId: 'run-9',
    });
  });

  it('guarda o nome de cada tool uma vez e o texto das duas voltas do modelo', async () => {
    const { service, canal, conversas } = montar();

    const turno = service.conversar(USUARIO, turnoNovo('oi'), 'tok', destinoDeTeste().destino);
    await respirar();
    canal.emitir(fragmento('ai-1', 'Vou consultar.'));
    canal.emitir(pedidoDeTool('ai-1', 'list_meals', 'get_streak', 'list_meals'));
    canal.emitir(fragmento('ai-2', 'Você comeu arroz.'));
    canal.emitir(fim('completed'));
    canal.encerrar();
    await turno;

    const [, , resposta] = conversas.concluirTurno.mock.calls[0];
    expect(resposta.tools).toEqual([{ name: 'list_meals' }, { name: 'get_streak' }]);
    expect(resposta.texto).toBe('Vou consultar.\n\nVocê comeu arroz.');
  });

  it('grava a pausa, para o card voltar depois de um F5', async () => {
    const { service, canal, conversas } = montar();

    const turno = service.conversar(USUARIO, turnoNovo('almocei'), 'tok', destinoDeTeste().destino);
    await respirar();
    canal.emitir(pedidoDeTool('ai-1', 'log_meal'));
    const valor = { kind: 'confirm', actions: [{ toolCallId: 'c0', tool: 'log_meal' }] };
    canal.emitir(pausa('pausa-1', valor));
    canal.emitir(fim('interrupted'));
    canal.encerrar();
    await turno;

    const [, , resposta] = conversas.concluirTurno.mock.calls[0];
    expect(resposta.status).toBe('interrupted');
    expect(resposta.pausa).toEqual({ id: 'pausa-1', value: valor });
  });

  it('turno que terminou sem pausa não grava pausa, mesmo que o fluxo tenha tido uma', async () => {
    const { service, canal, conversas } = montar();

    const turno = service.conversar(USUARIO, turnoNovo('oi'), 'tok', destinoDeTeste().destino);
    await respirar();
    canal.emitir(pausa('pausa-1', { kind: 'question' }));
    canal.emitir(fim('error'));
    canal.encerrar();
    await turno;

    expect(conversas.concluirTurno.mock.calls[0][2].pausa).toBeNull();
  });

  it('grava o parcial e fecha com error + done quando o stream quebra no meio', async () => {
    const { service, conversas } = montar({
      stream: {
        cancelar: () => undefined,
        async *pedacos() {
          yield enc(fragmento('ai-1', 'Você comeu'));
          throw new ErroDeStreamDoAgente('AGENT_STREAM_INTERRUPTED', 'Interrompida.');
        },
      },
    });
    const saida = destinoDeTeste();

    await service.conversar(USUARIO, turnoNovo('oi'), 'tok', saida.destino);

    expect(conversas.concluirTurno.mock.calls[0][2]).toMatchObject({
      texto: 'Você comeu',
      status: 'error',
    });
    expect(saida.tudo()).toContain(
      quadro('error', { code: 'AGENT_STREAM_INTERRUPTED', message: 'Interrompida.' }),
    );
    // A garantia do fio: `done` é sempre o último evento do agente.
    expect(saida.tudo()).toContain(quadro('done', { status: 'error' }));
    expect(saida.destino.fim).toHaveBeenCalled();
  });

  it('erro inesperado no meio do stream vira evento, e não exceção relançada', async () => {
    const { service } = montar({
      stream: {
        cancelar: () => undefined,
        async *pedacos() {
          yield enc(fragmento('ai-1', 'a'));
          throw new TypeError('defeito');
        },
      },
    });
    const saida = destinoDeTeste();

    await service.conversar(USUARIO, turnoNovo('oi'), 'tok', saida.destino);

    expect(saida.tudo()).toContain('CHAT_INTERNAL_ERROR');
  });

  it('ignora quadro com `data` que não é JSON em vez de derrubar o turno', async () => {
    const { service, canal, conversas } = montar();

    const turno = service.conversar(USUARIO, turnoNovo('oi'), 'tok', destinoDeTeste().destino);
    await respirar();
    canal.emitir('event: messages\ndata: {nao-e-json\n\n');
    canal.emitir(fragmento('ai-1', 'ok'));
    canal.emitir(fim('completed'));
    canal.encerrar();
    await turno;

    expect(conversas.concluirTurno.mock.calls[0][2].texto).toBe('ok');
  });
});

describe('ChatService — o título da conversa', () => {
  it('conversa nova ganha o nome do agente, com o custo no livro-caixa', async () => {
    const { service, canal, agent, conversas, uso } = montar({ existente: false });
    agent.titular.mockResolvedValueOnce({
      titulo: 'Almoço com frango',
      uso: { model: 'm', inputUnits: 40, outputUnits: 5 },
    });

    const turno = service.conversar(
      USUARIO,
      turnoNovo('registra 200 g de frango'),
      'tok',
      destinoDeTeste().destino,
    );
    await respirar();
    canal.encerrar();
    await turno;
    await respirar();

    expect(agent.titular).toHaveBeenCalledWith('registra 200 g de frango');
    expect(conversas.titularSeProvisorio).toHaveBeenCalledWith(
      'user-a',
      CONVERSA,
      'registra 200 g de frango',
      'Almoço com frango',
    );
    expect(uso.registrar).toHaveBeenCalledWith('user-a', {
      feature: 'chat_title',
      model: 'm',
      units: { inputUnits: 40, outputUnits: 5 },
    });
  });

  it('conversa que já existe não é renomeada a cada mensagem', async () => {
    const { service, canal, agent } = montar();

    const turno = service.conversar(
      USUARIO,
      turnoNovo('e amanhã?'),
      'tok',
      destinoDeTeste().destino,
    );
    await respirar();
    canal.encerrar();
    await turno;

    expect(agent.titular).not.toHaveBeenCalled();
  });

  it('falha no título não derruba o turno', async () => {
    const { service, canal, agent } = montar({ existente: false });
    agent.titular.mockRejectedValueOnce(new Error('agente caiu'));
    const saida = destinoDeTeste();

    const turno = service.conversar(USUARIO, turnoNovo('oi'), 'tok', saida.destino);
    await respirar();
    canal.emitir(fragmento('ai-1', 'Oi!'));
    canal.encerrar();
    await turno;

    expect(saida.tudo()).toContain('"Oi!"');
  });
});

describe('ChatService — o que vai para o livro-caixa', () => {
  const uso = (dados: Record<string, unknown>) => quadro('usage', dados);

  it('registra o custo com o modelo e as unidades que o agente reportou', async () => {
    const { service, canal, uso: livro } = montar();

    const turno = service.conversar(USUARIO, turnoNovo('oi'), 'tok', destinoDeTeste().destino);
    await respirar();
    canal.emitir(uso({ model: 'gateway/modelo', inputUnits: 1200, outputUnits: 300 }));
    canal.encerrar();
    await turno;

    expect(livro.registrar).toHaveBeenCalledWith('user-a', {
      feature: 'chat',
      model: 'gateway/modelo',
      units: { inputUnits: 1200, outputUnits: 300 },
    });
  });

  it('agente que não reporta `usage` vira custo NÃO MEDIDO, não custo zero', async () => {
    const { service, canal, uso: livro } = montar();

    const turno = service.conversar(USUARIO, turnoNovo('oi'), 'tok', destinoDeTeste().destino);
    await respirar();
    canal.emitir(fragmento('ai-1', 'oi'));
    canal.encerrar();
    await turno;

    // `model: null` é o que faz `AiUsageService.registrar` gravar
    // `pricingKnown: false` — um turno caro não pode entrar como grátis.
    expect(livro.registrar).toHaveBeenCalledWith('user-a', {
      feature: 'chat',
      model: null,
      units: {},
    });
  });

  it('SOMA os `usage` do turno por modelo, e contamina quando falta unidade', async () => {
    const { service, canal, uso: livro } = montar();

    const turno = service.conversar(USUARIO, turnoNovo('oi'), 'tok', destinoDeTeste().destino);
    await respirar();
    canal.emitir(uso({ model: 'm', inputUnits: 1000, outputUnits: 50 }));
    canal.emitir(uso({ model: 'm', inputUnits: 5000, outputUnits: 400 }));
    canal.emitir(uso({ model: 'caro', inputUnits: 900 }));
    canal.encerrar();
    await turno;

    expect(livro.registrar.mock.calls.map(([, entrada]) => entrada)).toEqual([
      { feature: 'chat', model: 'm', units: { inputUnits: 6000, outputUnits: 450 } },
      { feature: 'chat', model: 'caro', units: { inputUnits: 900, outputUnits: undefined } },
    ]);
  });

  it('registra o custo mesmo quando o stream quebrou — o dinheiro já saiu', async () => {
    const { service, uso: livro } = montar({
      stream: {
        cancelar: () => undefined,
        async *pedacos() {
          yield enc(uso({ model: 'gateway/modelo', inputUnits: 900 }));
          throw new ErroDeStreamDoAgente('AGENT_STREAM_INTERRUPTED', 'Interrompida.');
        },
      },
    });

    await service.conversar(USUARIO, turnoNovo('oi'), 'tok', destinoDeTeste().destino);

    expect(livro.registrar).toHaveBeenCalledWith('user-a', {
      feature: 'chat',
      model: 'gateway/modelo',
      units: { inputUnits: 900, outputUnits: undefined },
    });
  });
});

describe('ChatService — o que NÃO pode vazar', () => {
  it('não escreve o Bearer nem o que a pessoa disse em nenhum log', async () => {
    const linhas: string[] = [];
    for (const nivel of ['error', 'warn', 'log'] as const) {
      jest.spyOn(Logger.prototype, nivel).mockImplementation((m: unknown) => {
        linhas.push(String(m));
      });
    }

    const { service, conversas } = montar({
      stream: {
        cancelar: () => undefined,
        async *pedacos() {
          yield enc(fragmento('ai-1', 'sua glicemia está alta'));
          throw new ErroDeStreamDoAgente('AGENT_STREAM_INTERRUPTED', 'Interrompida.');
        },
      },
    });
    // Força também o caminho de erro de gravação, que é onde a tentação de logar
    // "o que eu estava tentando gravar" aparece.
    conversas.concluirTurno.mockRejectedValueOnce(new Error('banco caiu'));

    await service.conversar(
      USUARIO,
      turnoNovo('tomei 3 insulinas hoje'),
      'token-secreto-do-usuario',
      destinoDeTeste().destino,
    );

    const tudo = linhas.join('\n');
    expect(tudo).not.toContain('token-secreto-do-usuario');
    expect(tudo).not.toContain('tomei 3 insulinas');
    expect(tudo).not.toContain('glicemia');
  });
});
