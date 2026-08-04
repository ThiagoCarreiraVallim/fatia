import type { AddressInfo } from 'node:net';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { ThrottlerModule } from '@nestjs/throttler';
import type { NextFunction, Request, Response } from 'express';
import { CommonModule } from '../../common/common.module';
import { PrismaService } from '../../common/prisma.service';
import { MealRecognitionService } from '../meal-recognition.service';
import { NutritionModule } from '../nutrition.module';

/**
 * A rota `POST /api/nutrition/meals/recognize` pela **porta da frente**.
 *
 * Existe porque tudo que separa esta rota de funcionar é fiação que não aparece
 * em teste de serviço, e que quebra sem derrubar nada:
 *
 * - o corpo é `text/plain` e é parseado por um middleware casado por
 *   `req.path.endsWith('/meals/recognize')`. Trocar esse sufixo, ou o
 *   `forRoutes`, não gera erro: o corpo simplesmente chega vazio, em silêncio, e
 *   a funcionalidade morre com o CI verde. É o modo de falha que o próprio
 *   comentário do `nutrition.module.ts` descreve;
 * - o `setGlobalPrefix('api')` **não** vale para o caminho declarado no
 *   consumer, então o casamento precisa ser pelo fim do caminho, e é isso que
 *   este arquivo exercita — com o prefixo ligado, como em produção;
 * - o teto por usuário é um guard de rota. Sem ele a rota não tinha limite
 *   nenhum (o `ThrottlerModule` nunca foi `APP_GUARD`), e um token válido em
 *   laço vira inferência paga ilimitada.
 *
 * O app sobe de verdade, mas nada externo: o `MealRecognitionService` é dublê —
 * o que se afirma aqui é a fiação HTTP, não o reconhecimento.
 */

const USER = '11111111-1111-1111-1111-111111111111';
const OUTRO_USER = '22222222-2222-2222-2222-222222222222';

/** JPEG mínimo em base64. O conteúdo não importa: quem reconhece é dublê. */
const FOTO_BASE64 = Buffer.from([0xff, 0xd8, 0xff, 0xd9]).toString('base64');

interface Cenario {
  app: INestApplication;
  url: string;
  reconhecer: jest.Mock;
  /** Quem o guard global de autenticação teria posto em `req.user`. */
  comoUsuario: (id: string) => void;
}

async function subirApp(): Promise<Cenario> {
  const reconhecer = jest.fn().mockResolvedValue({ itens: [], observacao: null });

  const modulo = await Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
      // O mesmo `forRoot` do `AppModule`: o named limiter 'default' precisa
      // existir para o `@Throttle({ default: … })` da rota ter onde se apoiar.
      ThrottlerModule.forRoot([
        { name: 'default', ttl: 60_000, limit: 100 },
        { name: 'oauth', ttl: 60_000, limit: 600 },
      ]),
      CommonModule,
      NutritionModule,
    ],
  })
    // Nenhum teste daqui toca o banco; o Postgres de teste é compartilhado.
    .overrideProvider(PrismaService)
    .useValue({})
    .overrideProvider(MealRecognitionService)
    .useValue({ reconhecer, disponivel: jest.fn().mockResolvedValue(true) })
    .compile();

  const app = modulo.createNestApplication({ logger: false });

  let usuarioAtual = USER;
  const comoUsuario = (id: string) => {
    usuarioAtual = id;
  };
  // Substitui o `APP_GUARD` de autenticação, que não está montado aqui: o que
  // importa para esta rota é que `req.user` chegue populado, porque é dele que
  // saem o `@CurrentUser()` e a chave do rate limit.
  app.use((req: Request, _res: Response, next: NextFunction) => {
    (req as Request & { user?: unknown }).user = { id: usuarioAtual };
    next();
  });

  // As duas peças do `main.ts` que interferem nesta rota: o prefixo (que o
  // middleware do módulo não enxerga) e o pipe global (que precisa deixar um
  // corpo `string` passar intocado).
  app.setGlobalPrefix('api');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  await app.listen(0, '127.0.0.1');
  const { port } = app.getHttpServer().address() as AddressInfo;

  return {
    app,
    url: `http://127.0.0.1:${port}/api/nutrition/meals/recognize`,
    reconhecer,
    comoUsuario,
  };
}

function postarFoto(url: string, corpo: string): Promise<globalThis.Response> {
  return fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: corpo,
  });
}

describe('POST /api/nutrition/meals/recognize', () => {
  let cenario: Cenario;

  beforeEach(async () => {
    // App por teste: o armazenamento do throttler é em memória e o teto de um
    // caso vazaria para o seguinte.
    cenario = await subirApp();
  });

  afterEach(async () => {
    await cenario.app.close();
  });

  it('a foto em base64 atravessa o parser e chega decodificada ao serviço', async () => {
    const resposta = await postarFoto(cenario.url, FOTO_BASE64);

    expect(resposta.status).toBe(201);
    expect(cenario.reconhecer).toHaveBeenCalledTimes(1);

    const [userId, foto] = cenario.reconhecer.mock.calls[0] as [string, Buffer];
    // O `userId` é o do `@CurrentUser()`, nunca algo vindo do corpo (ADR 010).
    expect(userId).toBe(USER);
    // E o corpo não chegou vazio — que é como a fiação quebrada se manifesta.
    expect(Buffer.isBuffer(foto)).toBe(true);
    expect(foto).toEqual(Buffer.from(FOTO_BASE64, 'base64'));
  });

  it('corpo que não é base64 vira 400 e não chega a pagar inferência', async () => {
    const resposta = await postarFoto(cenario.url, 'isto não é base64!!');

    expect(resposta.status).toBe(400);
    expect(cenario.reconhecer).not.toHaveBeenCalled();
  });

  it('corpo vazio vira 400 em vez de reconhecer uma foto de zero byte', async () => {
    const resposta = await postarFoto(cenario.url, '   ');

    expect(resposta.status).toBe(400);
    expect(cenario.reconhecer).not.toHaveBeenCalled();
  });

  it('passa do teto por minuto e o excedente vira 429 sem inferir', async () => {
    // O cenário que a revisão levantou: token válido em laço. Sem o guard de
    // rota, as seis chamadas passavam e as seis pagavam inferência.
    const status: number[] = [];
    for (let i = 0; i < 6; i++) {
      status.push((await postarFoto(cenario.url, FOTO_BASE64)).status);
    }

    expect(status).toEqual([201, 201, 201, 201, 201, 429]);
    // O 429 é barrado **antes** do serviço: o custo é a inferência, não o 201.
    expect(cenario.reconhecer).toHaveBeenCalledTimes(5);
  });

  it('o teto é por usuário, e não por IP', async () => {
    // Chavear por IP faria uma pessoa atrás de CGNAT gastar o teto de todas as
    // outras — negação de serviço acidental. Os dois usuários abaixo saem do
    // mesmo 127.0.0.1.
    for (let i = 0; i < 5; i++) await postarFoto(cenario.url, FOTO_BASE64);
    expect((await postarFoto(cenario.url, FOTO_BASE64)).status).toBe(429);

    cenario.comoUsuario(OUTRO_USER);

    expect((await postarFoto(cenario.url, FOTO_BASE64)).status).toBe(201);
  });
});
