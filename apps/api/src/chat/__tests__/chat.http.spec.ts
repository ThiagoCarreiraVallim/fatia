import type { AddressInfo } from 'node:net';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { ThrottlerModule } from '@nestjs/throttler';
import type { NextFunction, Request, Response } from 'express';
import { AiUsageService } from '../../ai/ai-usage.service';
import { AiQuotaExceededException } from '../../ai/ai-quota';
import { CommonModule } from '../../common/common.module';
import { PrismaService } from '../../common/prisma.service';
import { AgentChatClient, type EntradaDoTurno, type StreamDoAgente } from '../agent-chat.client';
import { ChatModule } from '../chat.module';
import { CheckpointPurgeService } from '../checkpoint-purge.service';
import { ConversationService } from '../conversation.service';
import { MemoryService } from '../memory/memory.service';
import { registrarCorposDoChat, TETO_DO_AUDIO } from '../corpos-do-chat';
import { JPEG_COM_EXIF_GPS } from '../../nutrition/helpers/jpeg-com-exif.fixture';

/**
 * `POST /api/chat` pela **porta da frente**, com express de verdade no meio.
 *
 * O `chat.service.spec.ts` prova a ordem dentro do serviço, contra um destino de
 * mentira. O que ele não alcança é tudo que mora no controller e que quebra sem
 * derrubar nada:
 *
 * - o `destinoSse` monta o cabeçalho **no primeiro `escrever`**, e não na
 *   montagem. Mover o `res.status(200)`/`flushHeaders()` para cima deixa as
 *   outras suítes verdes e transforma cota estourada e agente fora do ar em
 *   "stream vazio" — a interface perde a única informação que a faria dizer o
 *   que houve;
 * - `X-Accel-Buffering: no` e `no-transform` só existem por causa de um proxy
 *   reverso que não está presente em desenvolvimento. Apagá-los não produz
 *   sintoma nenhum aqui e entrega o chat inteiro de uma vez em produção, que é o
 *   desperdício exato que a épica #247 manda evitar;
 * - o repasse sem buffer tem de sobreviver ao `res.write` do express, e não só
 *   ao dublê: por isso este arquivo lê o corpo **com o agente ainda falando**;
 * - `extrairBearer` e o `ChatThrottlerGuard` não são exercitados por nenhum
 *   outro teste. Sem o guard, um token válido em laço vira inferência paga
 *   ilimitada.
 *
 * O app sobe de verdade; nada externo sobe: agente, persistência e livro-caixa
 * são dublês. O que se afirma aqui é a fiação HTTP.
 */

const USER = '11111111-1111-1111-1111-111111111111';
const OUTRO_USER = '22222222-2222-2222-2222-222222222222';
const CONVERSA = '3f1c9a52-6b1e-4d8a-9c2f-0a5e7b3d1c44';

const enc = (texto: string) => new TextEncoder().encode(texto);

/** Deixa o laço de eventos girar antes de olhar o socket. */
const respirar = () => new Promise((resolve) => setImmediate(resolve));

/**
 * Lê o próximo pedaço do socket, ou devolve `null` se ele não chegar a tempo.
 *
 * O relógio existe para a falha ser **legível**: uma implementação que
 * bufferizasse simplesmente não entregaria nada até o fim do turno, e sem o
 * `null` o sintoma seria um timeout de 5 s do jest — que é indistinguível de
 * teste travado por outro motivo. Com ele, a asserção diz o que aconteceu.
 */
async function lerPedaco(
  leitor: ReadableStreamDefaultReader<Uint8Array>,
  ms = 1_000,
): Promise<string | null> {
  let relogio: NodeJS.Timeout | undefined;
  const espera = new Promise<null>((resolve) => {
    relogio = setTimeout(() => resolve(null), ms);
  });
  try {
    const pedaco = await Promise.race([leitor.read().then((r) => r.value ?? null), espera]);
    return pedaco === null ? null : new TextDecoder().decode(pedaco);
  } finally {
    clearTimeout(relogio);
  }
}

/** Um stream do agente que o teste alimenta pedaço a pedaço. */
function canalDoAgente() {
  const fila: Array<Uint8Array | null> = [];
  const aguardando: Array<(valor: Uint8Array | null) => void> = [];

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
    cancelar: () => entregar(null),
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
  };
}

interface Cenario {
  app: INestApplication;
  url: string;
  canal: ReturnType<typeof canalDoAgente>;
  abrir: jest.Mock<Promise<StreamDoAgente>, [EntradaDoTurno]>;
  configurado: jest.Mock<boolean, []>;
  capacidades: jest.Mock;
  transcrever: jest.Mock;
  registrar: jest.Mock;
  assertDentroDaCota: jest.Mock<Promise<void>, [string]>;
  comoUsuario: (id: string) => void;
}

async function subirApp(): Promise<Cenario> {
  const canal = canalDoAgente();
  const abrir = jest.fn(async (_entrada: EntradaDoTurno) => canal.stream);
  const configurado = jest.fn(() => true);
  const assertDentroDaCota = jest.fn(async (_userId: string) => undefined);
  const capacidades = jest.fn(async () => ({ fotos: true, ditado: false }));
  const transcrever = jest.fn(async (_audio: Buffer, _tipo: string) => ({
    texto: 'registra 200 g de frango',
    uso: { model: 'whisper-1', inputUnits: 3.4 },
  }));
  const registrar = jest.fn(async () => undefined);

  const modulo = await Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
      // O mesmo `forRoot` do `AppModule`: o `@Throttle({ default: … })` da rota
      // precisa do limiter nomeado 'default' para ter onde se apoiar.
      ThrottlerModule.forRoot([
        { name: 'default', ttl: 60_000, limit: 100 },
        { name: 'oauth', ttl: 60_000, limit: 600 },
      ]),
      CommonModule,
      ChatModule,
    ],
  })
    // Nenhum teste daqui toca o banco; o Postgres de teste é compartilhado.
    .overrideProvider(PrismaService)
    .useValue({})
    .overrideProvider(AgentChatClient)
    .useValue({ abrir, configurado, capacidades, transcrever })
    .overrideProvider(AiUsageService)
    .useValue({ assertDentroDaCota, registrar })
    .overrideProvider(ConversationService)
    .useValue({
      encontrar: jest.fn(async () => null),
      historicoParaOAgente: jest.fn(async () => []),
      limparPausas: jest.fn(async () => undefined),
      iniciarTurno: jest.fn(async () => ({ conversationId: CONVERSA })),
      concluirTurno: jest.fn(async () => null),
      listar: jest.fn(async () => []),
    })
    .overrideProvider(CheckpointPurgeService)
    .useValue({ apagarConversa: jest.fn(async () => undefined) })
    .overrideProvider(MemoryService)
    .useValue({ listar: jest.fn(async () => []) })
    .compile();

  const app = modulo.createNestApplication({ logger: false });

  let usuarioAtual = USER;
  // Substitui o `APP_GUARD` de autenticação, que não está montado aqui: o que a
  // rota precisa é `req.user` populado — é dele que saem o `@CurrentUser()` e a
  // chave do rate limit. O `Authorization` continua vindo do cliente, porque é
  // ele que o `extrairBearer` lê.
  app.use((req: Request, _res: Response, next: NextFunction) => {
    (req as Request & { user?: unknown }).user = {
      id: usuarioAtual,
      email: 'a@test.local',
      role: 'USER',
      timezone: 'America/Sao_Paulo',
    };
    next();
  });

  registrarCorposDoChat(app);
  app.setGlobalPrefix('api');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  await app.listen(0, '127.0.0.1');
  const { port } = app.getHttpServer().address() as AddressInfo;

  return {
    app,
    url: `http://127.0.0.1:${port}/api/chat`,
    canal,
    abrir,
    configurado,
    capacidades,
    transcrever,
    registrar,
    assertDentroDaCota,
    comoUsuario: (id: string) => {
      usuarioAtual = id;
    },
  };
}

function conversar(
  url: string,
  corpoSemConversa: Record<string, unknown>,
  opcoes: { bearer?: string | null } = {},
): Promise<globalThis.Response> {
  const bearer = opcoes.bearer === undefined ? 'token-do-usuario' : opcoes.bearer;
  return fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(bearer === null ? {} : { Authorization: `Bearer ${bearer}` }),
    },
    body: JSON.stringify({ conversationId: CONVERSA, ...corpoSemConversa }),
  });
}

describe('POST /api/chat', () => {
  let cenario: Cenario;

  beforeEach(async () => {
    // App por teste: o armazenamento do throttler é em memória e o teto de um
    // caso vazaria para o seguinte.
    cenario = await subirApp();
  });

  afterEach(async () => {
    cenario.canal.encerrar();
    await cenario.app.close();
  });

  it('o token chega ao socket com o agente ainda falando, e com os cabeçalhos que o proxy respeita', async () => {
    const resposta = await conversar(cenario.url, { message: 'oi' });

    expect(resposta.status).toBe(200);
    expect(resposta.headers.get('content-type')).toContain('text/event-stream');
    // Sem estes dois, o nginx segura a resposta em blocos e entrega o chat
    // inteiro de uma vez — invisível em desenvolvimento, onde não há proxy.
    expect(resposta.headers.get('x-accel-buffering')).toBe('no');
    expect(resposta.headers.get('cache-control')).toContain('no-transform');

    const leitor = resposta.body!.getReader();
    // O cabeçalho sai assim que o agente aceita o turno, com um comentário SSE
    // que nenhum leitor interpreta.
    expect(await lerPedaco(leitor)).toBe(': aberto\n\n');

    cenario.canal.emitir(
      'event: messages\ndata: [{"type":"AIMessageChunk","content":"Boa ","id":"ai-1"},{}]\n\n',
    );
    // Lido AQUI, com o stream ainda aberto e o agente ainda falando. Uma
    // implementação que bufferizasse devolveria `null` nesta linha — e passaria
    // em todos os outros testes deste arquivo.
    expect(await lerPedaco(leitor)).toContain('"Boa "');

    cenario.canal.emitir(
      'event: messages\ndata: [{"type":"AIMessageChunk","content":"tarde","id":"ai-1"},{}]\n\n',
    );
    expect(await lerPedaco(leitor)).toContain('"tarde"');

    cenario.canal.encerrar();
    await leitor.cancel();
  });

  it('manda ao agente o Bearer do header, e não algo vindo do corpo', async () => {
    // `userId` nunca vem de input (ADR 010); o Bearer também não. O corpo abaixo
    // tenta os dois nomes, e o `whitelist` do ValidationPipe os descarta.
    const resposta = await conversar(
      cenario.url,
      { message: 'oi', bearer: 'token-forjado', userId: OUTRO_USER },
      { bearer: 'token-de-verdade' },
    );
    cenario.canal.encerrar();
    await resposta.text();

    expect(cenario.abrir).toHaveBeenCalledTimes(1);
    expect(cenario.abrir.mock.calls[0][0].bearer).toBe('token-de-verdade');
  });

  it('sem `Authorization` recusa com 401 e não chama o agente', async () => {
    // Inalcançável com o guard global no lugar, e é exatamente por isso que
    // importa: no dia em que alguém marcar a rota como `@Public()`, o agente
    // receberia `Bearer undefined` e chamaria o `/mcp` sem identidade.
    const resposta = await conversar(cenario.url, { message: 'oi' }, { bearer: null });

    expect(resposta.status).toBe(401);
    expect(cenario.abrir).not.toHaveBeenCalled();
  });

  it('cota estourada é 429 com corpo JSON, e não um stream vazio', async () => {
    cenario.assertDentroDaCota.mockRejectedValueOnce(
      new AiQuotaExceededException({
        allowed: false,
        scope: 'user',
        spentMicros: 10,
        limitMicros: 10,
        resetsAt: new Date('2026-08-07T00:00:00Z'),
      }),
    );

    const resposta = await conversar(cenario.url, { message: 'oi' });

    // O cabeçalho SSE ainda não tinha saído: é isso que preserva o status de
    // verdade. Mandando o 200 na montagem do destino, isto viraria um 200 com
    // corpo vazio e a interface não teria o que dizer.
    expect(resposta.status).toBe(429);
    expect(resposta.headers.get('content-type')).toContain('application/json');
    expect(await resposta.json()).toMatchObject({ code: 'AI_QUOTA_EXCEEDED', scope: 'user' });
    expect(cenario.abrir).not.toHaveBeenCalled();
  });

  it('agente fora do ar é 503 com corpo JSON', async () => {
    const { ServiceUnavailableException } = await import('@nestjs/common');
    cenario.abrir.mockRejectedValueOnce(new ServiceUnavailableException('fora do ar'));

    const resposta = await conversar(cenario.url, { message: 'oi' });

    expect(resposta.status).toBe(503);
    expect(resposta.headers.get('content-type')).toContain('application/json');
  });

  it('mensagem vazia é 400 antes de qualquer inferência', async () => {
    const resposta = await conversar(cenario.url, { message: '' });

    expect(resposta.status).toBe(400);
    expect(cenario.abrir).not.toHaveBeenCalled();
  });

  it('sem mensagem nem retomada é 400', async () => {
    const resposta = await conversar(cenario.url, {});

    expect(resposta.status).toBe(400);
    expect(cenario.abrir).not.toHaveBeenCalled();
  });

  it('a retomada chega ao agente com o id da pausa e o valor intacto', async () => {
    const conversas = cenario.app.get(ConversationService) as unknown as {
      encontrar: jest.Mock;
    };
    conversas.encontrar.mockResolvedValueOnce({ id: CONVERSA, userId: USER });

    const resposta = await conversar(cenario.url, {
      resume: { interruptId: 'pausa-1', value: { approvals: { c1: true } } },
    });
    cenario.canal.encerrar();
    await resposta.text();

    expect(resposta.status).toBe(200);
    expect(cenario.abrir.mock.calls[0][0]).toMatchObject({
      retomada: { interruptId: 'pausa-1', value: { approvals: { c1: true } } },
    });
  });

  it('`conversationId` que não é UUID é 400', async () => {
    const resposta = await conversar(cenario.url, { conversationId: 'nao-e-uuid', message: 'oi' });

    expect(resposta.status).toBe(400);
    expect(cenario.abrir).not.toHaveBeenCalled();
  });

  it('passa do teto de turnos por minuto e o excedente vira 429 sem inferir', async () => {
    const status: number[] = [];
    for (let i = 0; i < 13; i++) {
      const resposta = await conversar(cenario.url, { message: 'oi' });
      status.push(resposta.status);
      cenario.canal.encerrar();
      await resposta.text();
      await respirar();
    }

    expect(status.slice(0, 12)).toEqual(Array<number>(12).fill(200));
    expect(status[12]).toBe(429);
    // O 429 é barrado ANTES do serviço: o custo é a inferência, não o 200.
    expect(cenario.abrir).toHaveBeenCalledTimes(12);
  });

  it('o teto é por usuário, e não por IP', async () => {
    // Chavear por IP faria uma pessoa atrás de CGNAT consumir o teto de todas as
    // outras. Os dois usuários abaixo saem do mesmo 127.0.0.1.
    for (let i = 0; i < 12; i++) {
      const resposta = await conversar(cenario.url, { message: 'oi' });
      cenario.canal.encerrar();
      await resposta.text();
      await respirar();
    }
    expect((await conversar(cenario.url, { message: 'oi' })).status).toBe(429);

    cenario.comoUsuario(OUTRO_USER);

    const doOutro = await conversar(cenario.url, { message: 'oi' });
    expect(doOutro.status).toBe(200);
    cenario.canal.encerrar();
    await doOutro.text();
  });
});

describe('GET /api/chat/availability', () => {
  let cenario: Cenario;

  beforeEach(async () => {
    cenario = await subirApp();
  });

  afterEach(async () => {
    await cenario.app.close();
  });

  it('diz que o chat existe e o que ele sabe fazer além de texto', async () => {
    expect(await (await fetch(`${cenario.url}/availability`)).json()).toEqual({
      available: true,
      photos: true,
      dictation: false,
    });
  });

  it('instância sem agente responde `available: false` em vez de deixar a aba quebrar', async () => {
    // Uma funcionalidade que sempre falha é pior que uma que não aparece: é o
    // que permite o auto-hospedado sem agente continuar um produto inteiro.
    cenario.configurado.mockReturnValueOnce(false);

    expect(await (await fetch(`${cenario.url}/availability`)).json()).toEqual({
      available: false,
      photos: false,
      dictation: false,
    });
    expect(cenario.capacidades).not.toHaveBeenCalled();
  });
});

describe('GET /api/chat/tools e POST /api/chat/preview', () => {
  let cenario: Cenario;

  beforeEach(async () => {
    cenario = await subirApp();
  });

  afterEach(async () => {
    await cenario.app.close();
  });

  it('o título de cada tool vem do registry, para rotular o histórico depois de um F5', async () => {
    const titulos = (await (await fetch(`${cenario.url}/tools`)).json()) as Record<string, string>;

    expect(titulos.log_meal).toBe('Registrar refeição');
    expect(titulos.save_memory).toBe('Guardar memória');
  });

  it('o resumo recusa tool que não pede confirmação, e corpo sem o nome da tool', async () => {
    const pedir = (corpo: unknown) =>
      fetch(`${cenario.url}/preview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(corpo),
      });

    expect((await pedir({ tool: 'list_meals', arguments: {} })).status).toBe(400);
    expect((await pedir({ arguments: {} })).status).toBe(400);
  });

  it('argumento inválido volta como resumo inválido, e não como erro', async () => {
    const resposta = await fetch(`${cenario.url}/preview`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tool: 'log_weight', arguments: {} }),
    });

    expect(resposta.status).toBe(200);
    expect(await resposta.json()).toEqual({
      valida: false,
      linhas: [],
      problema: 'Faltou informar: peso. Peça de novo ao assistente.',
    });
  });
});

describe('POST /api/chat com foto', () => {
  let cenario: Cenario;

  beforeEach(async () => {
    cenario = await subirApp();
  });

  afterEach(async () => {
    cenario.canal.encerrar();
    await cenario.app.close();
  });

  it('um turno com foto passa do teto global de 100 kB e chega ao agente sem EXIF', async () => {
    // Uma foto de celular reduzida ainda passa dos 100 kB do parser global:
    // o recheio garante que o teste falharia sem o parser da rota.
    const grande = Buffer.concat([JPEG_COM_EXIF_GPS, Buffer.alloc(150_000)]);
    const resposta = await conversar(cenario.url, {
      message: 'o que tem nesse prato?',
      photos: [{ mediaType: 'image/jpeg', data: grande.toString('base64') }],
    });

    expect(resposta.status).toBe(200);
    const entrada = cenario.abrir.mock.calls[0][0] as { fotos?: { data: string }[] };
    const enviada = Buffer.from(entrada.fotos?.[0]?.data ?? '', 'base64');
    expect(enviada.length).toBeGreaterThan(150_000);
    expect(enviada.includes(Buffer.from('iPhone 15 Pro'))).toBe(false);
    expect(enviada.includes(Buffer.from('F2LZQ8XKJC'))).toBe(false);
    cenario.canal.encerrar();
    await resposta.text();
  });

  it('recusa o que não é JPEG antes de abrir o agente', async () => {
    const resposta = await conversar(cenario.url, {
      message: 'o que é isso?',
      photos: [{ mediaType: 'image/jpeg', data: Buffer.from('não sou jpeg').toString('base64') }],
    });

    expect(resposta.status).toBe(400);
    expect(cenario.abrir).not.toHaveBeenCalled();
  });

  it('recusa foto na resposta a uma pausa', async () => {
    const resposta = await conversar(cenario.url, {
      resume: { interruptId: 'i-1', value: true },
      photos: [{ mediaType: 'image/jpeg', data: JPEG_COM_EXIF_GPS.toString('base64') }],
    });

    expect([400, 404]).toContain(resposta.status);
    expect(cenario.abrir).not.toHaveBeenCalled();
  });
});

describe('POST /api/chat/transcribe', () => {
  let cenario: Cenario;

  beforeEach(async () => {
    cenario = await subirApp();
  });

  afterEach(async () => {
    await cenario.app.close();
  });

  const ditar = (corpo: Uint8Array<ArrayBuffer>, tipo: string) =>
    fetch(`${cenario.url}/transcribe`, {
      method: 'POST',
      headers: { 'Content-Type': tipo, Authorization: 'Bearer token-do-usuario' },
      body: new Blob([corpo]),
    });

  it('repassa os bytes intactos, devolve o texto e lança o custo em segundos de áudio', async () => {
    const audio = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0xff, 0x00, 0x80]);

    const resposta = await ditar(audio, 'audio/webm;codecs=opus');

    expect(resposta.status).toBe(200);
    expect(await resposta.json()).toEqual({ text: 'registra 200 g de frango' });
    const [bytes, tipo] = cenario.transcrever.mock.calls[0];
    expect(Buffer.compare(bytes, Buffer.from(audio))).toBe(0);
    expect(tipo).toBe('audio/webm;codecs=opus');
    expect(cenario.assertDentroDaCota).toHaveBeenCalledWith(USER);
    expect(cenario.registrar).toHaveBeenCalledWith(USER, {
      feature: 'transcription',
      model: 'whisper-1',
      units: { inputUnits: 3.4, outputUnits: 0 },
    });
  });

  it('recusa o que não é áudio sem chamar o agente', async () => {
    const resposta = await ditar(enc('{"oi":1}'), 'application/json');

    expect(resposta.status).toBe(415);
    expect(cenario.transcrever).not.toHaveBeenCalled();
  });

  it('recusa áudio acima do teto sem chamar o agente', async () => {
    const resposta = await ditar(new Uint8Array(TETO_DO_AUDIO + 1), 'audio/webm');

    expect(resposta.status).toBe(413);
    expect(cenario.transcrever).not.toHaveBeenCalled();
  });

  it('cota estourada barra antes do agente', async () => {
    cenario.assertDentroDaCota.mockRejectedValueOnce(
      new AiQuotaExceededException({
        allowed: false,
        scope: 'user',
        spentMicros: 1,
        limitMicros: 1,
        resetsAt: new Date(),
      }),
    );

    const resposta = await ditar(new Uint8Array([1, 2, 3]), 'audio/webm');

    expect(resposta.status).toBe(429);
    expect(cenario.transcrever).not.toHaveBeenCalled();
  });
});
