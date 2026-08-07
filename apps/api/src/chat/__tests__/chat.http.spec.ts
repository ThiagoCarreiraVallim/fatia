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
import { ConversationService } from '../conversation.service';

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
  assertDentroDaCota: jest.Mock<Promise<void>, [string]>;
  comoUsuario: (id: string) => void;
}

async function subirApp(): Promise<Cenario> {
  const canal = canalDoAgente();
  const abrir = jest.fn(async (_entrada: EntradaDoTurno) => canal.stream);
  const configurado = jest.fn(() => true);
  const assertDentroDaCota = jest.fn(async (_userId: string) => undefined);

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
    .useValue({ abrir, configurado })
    .overrideProvider(AiUsageService)
    .useValue({ assertDentroDaCota, registrar: jest.fn(async () => undefined) })
    .overrideProvider(ConversationService)
    .useValue({
      historicoParaOAgente: jest.fn(async () => []),
      iniciarTurno: jest.fn(async () => ({ conversationId: 'c0ffee' })),
      concluirTurno: jest.fn(async () => undefined),
      listar: jest.fn(async () => []),
    })
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
    assertDentroDaCota,
    comoUsuario: (id: string) => {
      usuarioAtual = id;
    },
  };
}

function conversar(
  url: string,
  corpo: unknown,
  opcoes: { bearer?: string | null } = {},
): Promise<globalThis.Response> {
  const bearer = opcoes.bearer === undefined ? 'token-do-usuario' : opcoes.bearer;
  return fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(bearer === null ? {} : { Authorization: `Bearer ${bearer}` }),
    },
    body: JSON.stringify(corpo),
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

    // O primeiro evento é nosso: sem o `conversationId`, quem acabou de começar
    // uma conversa não teria como continuá-la.
    expect(await lerPedaco(leitor)).toContain('event: conversation');

    cenario.canal.emitir('event: token\ndata: {"text":"Boa "}\n\n');
    // Lido AQUI, com o stream ainda aberto e o agente ainda falando. Uma
    // implementação que bufferizasse devolveria `null` nesta linha — e passaria
    // em todos os outros testes deste arquivo.
    expect(await lerPedaco(leitor)).toContain('"Boa "');

    cenario.canal.emitir('event: token\ndata: {"text":"tarde"}\n\n');
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

  it('diz que o chat existe quando há agente configurado', async () => {
    expect(await (await fetch(`${cenario.url}/availability`)).json()).toEqual({ available: true });
  });

  it('instância sem agente responde `available: false` em vez de deixar a aba quebrar', async () => {
    // Uma funcionalidade que sempre falha é pior que uma que não aparece: é o
    // que permite o auto-hospedado sem agente continuar um produto inteiro.
    cenario.configurado.mockReturnValueOnce(false);

    expect(await (await fetch(`${cenario.url}/availability`)).json()).toEqual({ available: false });
  });
});
