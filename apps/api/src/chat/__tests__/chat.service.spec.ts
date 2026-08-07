import { Logger, NotFoundException } from '@nestjs/common';
import { MessageRole } from '@prisma/client';
import { AiQuotaExceededException } from '../../ai/ai-quota';
import type { AiUsageService } from '../../ai/ai-usage.service';
import type { CurrentUserPayload } from '../../common/decorators/current-user.decorator';
import {
  ErroDeStreamDoAgente,
  type AgentChatClient,
  type EntradaDoTurno,
  type StreamDoAgente,
} from '../agent-chat.client';
import { ChatService, type DestinoDoStream } from '../chat.service';
import type {
  ConversationService,
  MensagemDoHistorico,
  ToolChamada,
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
    /** Segura o `abrir` até resolver — a janela em que o agente ainda pensa. */
    atrasarAbertura?: Promise<void>;
  } = {},
) {
  const canal = canalDoAgente();
  const stream = opcoes.stream ?? canal.stream;
  const chamadas: EntradaDoTurno[] = [];

  const conversas = {
    historicoParaOAgente: jest.fn(
      async (_userId: string, _id: string): Promise<MensagemDoHistorico[]> =>
        opcoes.historico ?? [],
    ),
    iniciarTurno: jest.fn(async (_userId: string, id: string | undefined, _texto: string) => ({
      conversationId: id ?? 'conversa-nova',
    })),
    concluirTurno: jest.fn(
      async (
        _userId: string,
        _conversationId: string,
        _resposta: { texto: string; tools: ToolChamada[] },
      ): Promise<void> => undefined,
    ),
  } satisfies Partial<ConversationService>;

  const agent = {
    abrir: jest.fn(async (entrada: EntradaDoTurno): Promise<StreamDoAgente> => {
      chamadas.push(entrada);
      if (opcoes.atrasarAbertura) await opcoes.atrasarAbertura;
      return stream;
    }),
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

    const turno = service.conversar(USUARIO, { message: 'oi' }, 'token-do-usuario', saida.destino);
    await respirar();

    canal.emitir('event: token\ndata: {"text":"Boa "}\n\n');
    await respirar();

    // O ponto do arquivo inteiro: aqui o agente AINDA está falando. Uma
    // implementação que acumulasse para escrever no fim teria só o evento
    // `conversation` neste instante, e esta linha ficaria vermelha.
    expect(saida.tudo()).toContain('"Boa "');
    expect(saida.escritos.length).toBeGreaterThan(1);

    canal.emitir('event: token\ndata: {"text":"tarde"}\n\n');
    await respirar();
    expect(saida.tudo()).toContain('"tarde"');

    canal.encerrar();
    await turno;
  });

  it('repassa os bytes do agente sem reescrever o envelope', async () => {
    const { service, canal } = montar();
    const saida = destinoDeTeste();

    const turno = service.conversar(USUARIO, { message: 'oi' }, 'tok', saida.destino);
    await respirar();
    canal.emitir('event: tool\ndata: {"name":"log_meal","status":"ok"}\n\n');
    canal.encerrar();
    await turno;

    expect(saida.tudo()).toContain('event: tool\ndata: {"name":"log_meal","status":"ok"}\n\n');
  });

  it('anuncia o id da conversa como primeiro evento', async () => {
    const { service, canal } = montar();
    const saida = destinoDeTeste();

    const turno = service.conversar(USUARIO, { message: 'oi' }, 'tok', saida.destino);
    await respirar();
    canal.encerrar();
    await turno;

    // Sem isto, quem acabou de começar uma conversa não teria como continuá-la.
    expect(saida.escritos[0]).toBe(
      'event: conversation\ndata: {"conversationId":"conversa-nova"}\n\n',
    );
  });

  it('corta o upstream quando o cliente vai embora', async () => {
    const { service, canal } = montar();
    const saida = destinoDeTeste();

    const turno = service.conversar(USUARIO, { message: 'oi' }, 'tok', saida.destino);
    await respirar();
    // Aba fechada no meio da resposta. Sem o cancelamento, a inferência paga
    // seguiria até o fim para ninguém.
    saida.simularClienteSaindo();
    await turno;

    expect(canal.foiCancelado()).toBe(true);
  });

  it('corta o upstream quando o cliente vai embora ANTES de o agente responder', async () => {
    const canal = canalDoAgente();
    // O agente demora a aceitar o turno — é a janela mais longa do fluxo
    // (`TIMEOUT_DE_ABERTURA_MS` é 120 s) e a mais provável de a pessoa desistir.
    let aceitarOTurno!: () => void;
    const abriu = new Promise<void>((resolve) => {
      aceitarOTurno = resolve;
    });
    const { service } = montar({
      stream: canal.stream,
      atrasarAbertura: abriu,
    });
    const saida = destinoDeTeste();

    const turno = service.conversar(USUARIO, { message: 'oi' }, 'tok', saida.destino);
    await respirar();

    // Aba fechada com o `abrir` ainda pendurado. `res.on('close')` NÃO reentrega
    // um evento já emitido: registrar o callback só depois do `await abrir`
    // deixava esta janela inteira sem cancelamento nenhum.
    saida.simularClienteSaindo();
    aceitarOTurno();
    await respirar();
    await respirar();

    // Lido antes de destravar o canal à mão: sem o cancelamento, o turno ficaria
    // pendurado esperando pedaço de um agente que ninguém mais vai ler, e a
    // falha viraria um timeout de 5 s em vez de uma asserção legível.
    const cancelou = canal.foiCancelado();
    canal.encerrar();
    await turno;

    expect(cancelou).toBe(true);
  });
});

describe('ChatService — ordem das guardas', () => {
  it('conversa alheia recusa sem chamar o agente', async () => {
    const { service, agent, uso, conversas } = montar();
    conversas.historicoParaOAgente.mockRejectedValueOnce(
      new NotFoundException('Conversa não encontrada.'),
    );
    const saida = destinoDeTeste();

    await expect(
      service.conversar(
        USUARIO,
        { conversationId: 'conversa-do-vizinho', message: 'oi' },
        'tok',
        saida.destino,
      ),
    ).rejects.toThrow(NotFoundException);

    // Recusar depois de gastar seria recusar tarde: o dinheiro já teria saído.
    expect(agent.abrir).not.toHaveBeenCalled();
    expect(uso.assertDentroDaCota).not.toHaveBeenCalled();
    // E nada foi escrito: a recusa precisa chegar como 404 de verdade, não como
    // um 200 com um evento de erro dentro.
    expect(saida.escritos).toEqual([]);
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

    await expect(
      service.conversar(USUARIO, { message: 'oi' }, 'tok', saida.destino),
    ).rejects.toThrow(AiQuotaExceededException);

    expect(agent.abrir).not.toHaveBeenCalled();
    expect(conversas.iniciarTurno).not.toHaveBeenCalled();
    expect(saida.escritos).toEqual([]);
  });

  it('agente fora do ar não deixa a pergunta órfã no histórico', async () => {
    const { service, agent, conversas } = montar();
    agent.abrir.mockRejectedValueOnce(new Error('conexão recusada'));
    const saida = destinoDeTeste();

    await expect(
      service.conversar(USUARIO, { message: 'oi' }, 'tok', saida.destino),
    ).rejects.toThrow();

    // Gravar antes de o agente aceitar deixaria uma conversa com pergunta e
    // nenhuma resposta toda vez que o agente estivesse fora do ar.
    expect(conversas.iniciarTurno).not.toHaveBeenCalled();
  });

  it('manda o Bearer do usuário e o histórico com a mensagem nova no fim', async () => {
    const { service, canal, chamadasAoAgente } = montar({
      historico: [{ role: MessageRole.user, content: 'anterior' }],
    });
    const saida = destinoDeTeste();

    const turno = service.conversar(
      USUARIO,
      { conversationId: 'c1', message: 'e agora?' },
      'token-do-usuario',
      saida.destino,
    );
    await respirar();
    canal.encerrar();
    await turno;

    expect(chamadasAoAgente[0]).toEqual({
      bearer: 'token-do-usuario',
      conversationId: 'c1',
      timezone: 'America/Sao_Paulo',
      messages: [
        { role: MessageRole.user, content: 'anterior' },
        { role: MessageRole.user, content: 'e agora?' },
      ],
    });
  });

  it('conversa nova vai ao agente com `conversationId: null`', async () => {
    const { service, canal, chamadasAoAgente, conversas } = montar();
    const saida = destinoDeTeste();

    const turno = service.conversar(USUARIO, { message: 'oi' }, 'tok', saida.destino);
    await respirar();
    canal.encerrar();
    await turno;

    expect(chamadasAoAgente[0].conversationId).toBeNull();
    expect(chamadasAoAgente[0].messages).toEqual([{ role: MessageRole.user, content: 'oi' }]);
    // E o histórico do banco nem é consultado: não há conversa para consultar.
    expect(conversas.historicoParaOAgente).not.toHaveBeenCalled();
  });
});

describe('ChatService — o que fica no banco', () => {
  it('junta os tokens de vários eventos numa mensagem só', async () => {
    const { service, canal, conversas } = montar();
    const saida = destinoDeTeste();

    const turno = service.conversar(USUARIO, { message: 'oi' }, 'tok', saida.destino);
    await respirar();
    canal.emitir('event: token\ndata: {"text":"Boa "}\n\n');
    canal.emitir('event: token\ndata: {"text":"tarde!"}\n\n');
    canal.emitir('event: done\ndata: {}\n\n');
    canal.encerrar();
    await turno;

    expect(conversas.concluirTurno).toHaveBeenCalledWith('user-a', 'conversa-nova', {
      texto: 'Boa tarde!',
      tools: [],
    });
  });

  it('guarda o nome de cada tool uma vez, na ordem em que foram chamadas', async () => {
    const { service, canal, conversas } = montar();
    const saida = destinoDeTeste();

    const turno = service.conversar(USUARIO, { message: 'registra aí' }, 'tok', saida.destino);
    await respirar();
    // O agente avisa o começo e o fim da mesma chamada; o histórico guarda a
    // chamada, não os dois avisos.
    canal.emitir('event: tool\ndata: {"name":"search_food","status":"started"}\n\n');
    canal.emitir('event: tool\ndata: {"name":"search_food","status":"ok"}\n\n');
    canal.emitir('event: tool\ndata: {"name":"log_meal","status":"ok"}\n\n');
    canal.emitir('event: token\ndata: {"text":"Registrei."}\n\n');
    canal.encerrar();
    await turno;

    expect(conversas.concluirTurno).toHaveBeenCalledWith('user-a', 'conversa-nova', {
      texto: 'Registrei.',
      tools: [{ name: 'search_food' }, { name: 'log_meal' }],
    });
  });

  it('grava o parcial e avisa o cliente quando o stream quebra no meio', async () => {
    const { service, conversas } = montar({
      stream: {
        cancelar: () => undefined,
        async *pedacos() {
          yield enc('event: token\ndata: {"text":"Come"}\n\n');
          throw new ErroDeStreamDoAgente('AGENT_STREAM_INTERRUPTED', 'Interrompida.');
        },
      },
    });
    const saida = destinoDeTeste();

    await service.conversar(USUARIO, { message: 'oi' }, 'tok', saida.destino);

    // O erro chega como evento, não como status: o 200 já saiu com o primeiro
    // pedaço, e a conversa continua utilizável.
    expect(saida.tudo()).toContain('event: error');
    expect(saida.tudo()).toContain('AGENT_STREAM_INTERRUPTED');
    // E o pedaço que a pessoa leu na tela não some no F5.
    expect(conversas.concluirTurno).toHaveBeenCalledWith('user-a', 'conversa-nova', {
      texto: 'Come',
      tools: [],
    });
  });

  it('erro inesperado no meio do stream vira evento, e não exceção relançada', async () => {
    const { service, uso } = montar({
      stream: {
        cancelar: () => undefined,
        async *pedacos() {
          yield enc('event: token\ndata: {"text":"oi"}\n\n');
          throw new TypeError('defeito nosso, não do agente');
        },
      },
    });
    const saida = destinoDeTeste();

    // Relançar faria o filtro de exceção do Nest tentar escrever um corpo de erro
    // numa resposta cujo cabeçalho já foi — e o cliente veria o stream parar sem
    // nada que a interface saiba mostrar.
    await expect(
      service.conversar(USUARIO, { message: 'oi' }, 'tok', saida.destino),
    ).resolves.toBeUndefined();
    expect(saida.tudo()).toContain('CHAT_INTERNAL_ERROR');
    // E o custo continua sendo lançado: a inferência aconteceu do mesmo jeito.
    expect(uso.registrar).toHaveBeenCalled();
  });

  it('ignora evento com `data` que não é JSON em vez de derrubar o turno', async () => {
    const { service, canal, conversas } = montar();
    const saida = destinoDeTeste();

    const turno = service.conversar(USUARIO, { message: 'oi' }, 'tok', saida.destino);
    await respirar();
    canal.emitir('event: token\ndata: isto não é json\n\n');
    canal.emitir('event: token\ndata: {"text":"ok"}\n\n');
    canal.encerrar();
    await turno;

    expect(conversas.concluirTurno).toHaveBeenCalledWith('user-a', 'conversa-nova', {
      texto: 'ok',
      tools: [],
    });
  });
});

describe('ChatService — o que vai para o livro-caixa', () => {
  it('registra o custo com o modelo e as unidades que o agente reportou', async () => {
    const { service, canal, uso } = montar();
    const saida = destinoDeTeste();

    const turno = service.conversar(USUARIO, { message: 'oi' }, 'tok', saida.destino);
    await respirar();
    canal.emitir('event: token\ndata: {"text":"oi"}\n\n');
    canal.emitir(
      'event: usage\ndata: {"model":"gateway/modelo","inputUnits":1200,"outputUnits":300}\n\n',
    );
    canal.encerrar();
    await turno;

    expect(uso.registrar).toHaveBeenCalledWith('user-a', {
      feature: 'chat',
      model: 'gateway/modelo',
      units: { inputUnits: 1200, outputUnits: 300 },
    });
  });

  it('agente que não reporta `usage` vira custo NÃO MEDIDO, não custo zero', async () => {
    const { service, canal, uso } = montar();
    const saida = destinoDeTeste();

    const turno = service.conversar(USUARIO, { message: 'oi' }, 'tok', saida.destino);
    await respirar();
    canal.emitir('event: token\ndata: {"text":"oi"}\n\n');
    canal.encerrar();
    await turno;

    // `model: null` é o que faz `AiUsageService.registrar` gravar
    // `pricingKnown: false`. Se este turno entrasse como custo 0 medido, a soma
    // da janela ficaria em 0 para sempre e a cota se desligaria sozinha — o modo
    // de falha que a #135 escreveu que queria evitar.
    expect(uso.registrar).toHaveBeenCalledWith('user-a', {
      feature: 'chat',
      model: null,
      units: { inputUnits: undefined, outputUnits: undefined },
    });
  });

  it('SOMA os `usage` do turno em vez de ficar com o último', async () => {
    const { service, canal, uso } = montar();
    const saida = destinoDeTeste();

    const turno = service.conversar(USUARIO, { message: 'registra aí' }, 'tok', saida.destino);
    await respirar();
    // O formato natural de um grafo LangGraph com uma rodada de tool: uma chamada
    // ao modelo para decidir a tool, outra para responder com o resultado dela.
    canal.emitir('event: usage\ndata: {"model":"m","inputUnits":1000,"outputUnits":50}\n\n');
    canal.emitir('event: tool\ndata: {"name":"log_meal","status":"ok"}\n\n');
    canal.emitir('event: usage\ndata: {"model":"m","inputUnits":5000,"outputUnits":400}\n\n');
    canal.emitir('event: token\ndata: {"text":"Registrei."}\n\n');
    canal.encerrar();
    await turno;

    // Ficar com o último descartaria 1.000 + 50 — e gravaria a linha com `model`
    // preenchido, ou seja `pricingKnown: true`: `unpricedCalls` não contaria, o
    // alerta de anomalia não acenderia e a cota do dia fecharia tarde. Custo a
    // menos disfarçado de custo medido é pior que custo ausente.
    expect(uso.registrar).toHaveBeenCalledTimes(1);
    expect(uso.registrar).toHaveBeenCalledWith('user-a', {
      feature: 'chat',
      model: 'm',
      units: { inputUnits: 6000, outputUnits: 450 },
    });
  });

  it('modelos diferentes no mesmo turno viram uma linha cada', async () => {
    const { service, canal, uso } = montar();
    const saida = destinoDeTeste();

    const turno = service.conversar(USUARIO, { message: 'oi' }, 'tok', saida.destino);
    await respirar();
    canal.emitir('event: usage\ndata: {"model":"rapido","inputUnits":100,"outputUnits":10}\n\n');
    canal.emitir('event: usage\ndata: {"model":"caro","inputUnits":900,"outputUnits":80}\n\n');
    canal.encerrar();
    await turno;

    // Dois modelos têm dois preços na tabela. Uma linha só teria de escolher um
    // deles, e o resultado seria preço errado gravado como se fosse conhecido.
    expect(uso.registrar.mock.calls.map(([, entrada]) => entrada)).toEqual([
      { feature: 'chat', model: 'rapido', units: { inputUnits: 100, outputUnits: 10 } },
      { feature: 'chat', model: 'caro', units: { inputUnits: 900, outputUnits: 80 } },
    ]);
  });

  it('rodada sem uma das unidades contamina o total em vez de subnotificar', async () => {
    const { service, canal, uso } = montar();
    const saida = destinoDeTeste();

    const turno = service.conversar(USUARIO, { message: 'oi' }, 'tok', saida.destino);
    await respirar();
    canal.emitir('event: usage\ndata: {"model":"m","inputUnits":1000,"outputUnits":50}\n\n');
    // A segunda rodada não reportou a saída. Somar só o que veio devolveria 50 —
    // um número menor que o real, com cara de medido, que `estimateAiCost`
    // cobraria com `pricingKnown: true`. `undefined` manda o turno para custo
    // NÃO MEDIDO, que é o que a #135 pediu para a ausência.
    canal.emitir('event: usage\ndata: {"model":"m","inputUnits":5000}\n\n');
    canal.encerrar();
    await turno;

    expect(uso.registrar).toHaveBeenCalledWith('user-a', {
      feature: 'chat',
      model: 'm',
      units: { inputUnits: 6000, outputUnits: undefined },
    });
  });

  it('registra o custo mesmo quando o stream quebrou — o dinheiro já saiu', async () => {
    const { service, uso } = montar({
      stream: {
        cancelar: () => undefined,
        async *pedacos() {
          yield enc('event: usage\ndata: {"model":"gateway/modelo","inputUnits":900}\n\n');
          throw new ErroDeStreamDoAgente('AGENT_STREAM_INTERRUPTED', 'Interrompida.');
        },
      },
    });
    const saida = destinoDeTeste();

    await service.conversar(USUARIO, { message: 'oi' }, 'tok', saida.destino);

    expect(uso.registrar).toHaveBeenCalledWith('user-a', {
      feature: 'chat',
      model: 'gateway/modelo',
      units: { inputUnits: 900, outputUnits: undefined },
    });
  });
});

describe('ChatService — o que NÃO pode vazar', () => {
  it('não escreve o Bearer nem o que a pessoa disse em nenhum log', async () => {
    const linhas: string[] = [];
    jest.spyOn(Logger.prototype, 'error').mockImplementation((m: unknown) => {
      linhas.push(String(m));
    });
    jest.spyOn(Logger.prototype, 'warn').mockImplementation((m: unknown) => {
      linhas.push(String(m));
    });
    jest.spyOn(Logger.prototype, 'log').mockImplementation((m: unknown) => {
      linhas.push(String(m));
    });

    const { service, conversas } = montar({
      stream: {
        cancelar: () => undefined,
        async *pedacos() {
          yield enc('event: token\ndata: {"text":"sua glicemia está alta"}\n\n');
          throw new ErroDeStreamDoAgente('AGENT_STREAM_INTERRUPTED', 'Interrompida.');
        },
      },
    });
    // Força também o caminho de erro de gravação, que é onde a tentação de logar
    // "o que eu estava tentando gravar" aparece.
    conversas.concluirTurno.mockRejectedValueOnce(new Error('banco caiu'));
    const saida = destinoDeTeste();

    await service.conversar(
      USUARIO,
      { message: 'tomei 3 insulinas hoje' },
      'token-secreto-do-usuario',
      saida.destino,
    );

    const tudo = linhas.join('\n');
    expect(tudo).not.toContain('token-secreto-do-usuario');
    expect(tudo).not.toContain('tomei 3 insulinas');
    expect(tudo).not.toContain('glicemia');
  });
});
