import type { AddressInfo } from 'node:net';
import { HttpException, HttpStatus, UnauthorizedException, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ThrottlerModule } from '@nestjs/throttler';
import { KEY_CALLS_PER_MINUTE } from '../api-key';
import { ApiKeyService, type ApiKeyContext } from '../api-key.service';
import { IntegrationApiController } from '../integration-api.controller';
import { IntegrationReadService } from '../integration-read.service';

/**
 * A API das integrações pela porta da frente (#413): sem login do Fatia, só
 * com a chave no `Authorization`; teto por chave por minuto (o
 * `ThrottlerModule` não é `APP_GUARD`, então o guard de rota é o que vale);
 * a cota do mês cobrada antes de ler.
 */
const CTX: ApiKeyContext = {
  keyId: 'k1',
  groupId: 'g1',
  monthlyLimit: 10_000,
  timezone: 'America/Sao_Paulo',
  scopes: ['INVITES', 'MEMBERS', 'SENDS'],
};
const SEGREDO = `fatia_live_${'a'.repeat(32)}`;

async function subirApp() {
  const authenticate = jest.fn(async (raw: string | null | undefined) => {
    if (raw !== SEGREDO) throw new UnauthorizedException('Chave de API inválida');
    return CTX;
  });
  const consume = jest.fn(async () => undefined);
  const members = jest.fn(async () => ({ items: [{ id: 'm1', name: 'Ana' }] }));
  const invites = jest.fn(async () => ({ items: [] }));
  const sends = jest.fn(async () => ({ items: [] }));
  const quota = jest.fn(async () => ({ used: 1, limit: 10_000 }));
  const modulo = await Test.createTestingModule({
    imports: [
      ThrottlerModule.forRoot([
        { name: 'default', ttl: 60_000, limit: 100 },
        { name: 'oauth', ttl: 60_000, limit: 600 },
      ]),
    ],
    controllers: [IntegrationApiController],
    providers: [
      { provide: ApiKeyService, useValue: { authenticate, consume, quota } },
      { provide: IntegrationReadService, useValue: { members, invites, sends } },
    ],
  }).compile();
  const app = modulo.createNestApplication({ logger: false });
  app.setGlobalPrefix('api');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  await app.listen(0, '127.0.0.1');
  const { port } = app.getHttpServer().address() as AddressInfo;
  return {
    app,
    base: `http://127.0.0.1:${port}/api/integrations/v1`,
    authenticate,
    consume,
    members,
    sends,
  };
}

describe('API das integrações (HTTP, #413)', () => {
  let c: Awaited<ReturnType<typeof subirApp>>;
  beforeEach(async () => {
    c = await subirApp();
  });
  afterEach(async () => {
    await c.app.close();
  });

  const com = (h?: string) => (h ? { headers: { authorization: h } } : {});

  it('sem chave, ou com chave errada: 401, e nada é lido nem contado', async () => {
    for (const h of [undefined, 'Bearer ', `Bearer fatia_live_${'b'.repeat(32)}`, SEGREDO]) {
      const r = await fetch(`${c.base}/members`, com(h));
      expect(r.status).toBe(401);
    }
    expect(c.members).not.toHaveBeenCalled();
    expect(c.consume).not.toHaveBeenCalled();
  });

  it('com a chave: cobra a cota com o escopo da rota e devolve a lista', async () => {
    const r = await fetch(
      `${c.base}/members?since=2026-11-01T00:00:00Z&limit=10`,
      com(`Bearer ${SEGREDO}`),
    );
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ items: [{ id: 'm1', name: 'Ana' }] });
    expect(c.consume).toHaveBeenCalledWith(CTX, 'MEMBERS', 'members');
    expect(c.members).toHaveBeenCalledWith(CTX, {
      since: new Date('2026-11-01T00:00:00Z'),
      limit: 10,
    });
  });

  it('cota esgotada: 429 e a leitura não acontece', async () => {
    c.consume.mockRejectedValueOnce(
      new HttpException('A cota deste mês acabou.', HttpStatus.TOO_MANY_REQUESTS),
    );
    const r = await fetch(`${c.base}/sends`, com(`Bearer ${SEGREDO}`));
    expect(r.status).toBe(429);
    expect(c.sends).not.toHaveBeenCalled();
  });

  it('parâmetro inválido: 400 antes de contar', async () => {
    const r = await fetch(`${c.base}/members?limit=1000`, com(`Bearer ${SEGREDO}`));
    expect(r.status).toBe(400);
    const s = await fetch(`${c.base}/sends?kind=SAUDE`, com(`Bearer ${SEGREDO}`));
    expect(s.status).toBe(400);
    expect(c.consume).not.toHaveBeenCalled();
  });

  it(`teto de ${KEY_CALLS_PER_MINUTE} chamadas por minuto por chave`, async () => {
    const status: number[] = [];
    for (let i = 0; i <= KEY_CALLS_PER_MINUTE; i++) {
      status.push((await fetch(`${c.base}/members`, com(`Bearer ${SEGREDO}`))).status);
    }
    expect(status.slice(0, KEY_CALLS_PER_MINUTE).every((s) => s === 200)).toBe(true);
    expect(status.at(-1)).toBe(429);
  });

  it('o teto é da chave, não da rota: alternar rotas não multiplica o limite', async () => {
    const rotas = ['members', 'invites', 'sends', 'me'];
    const status: number[] = [];
    for (let i = 0; i <= KEY_CALLS_PER_MINUTE; i++) {
      const r = await fetch(`${c.base}/${rotas[i % rotas.length]}`, com(`Bearer ${SEGREDO}`));
      status.push(r.status);
    }
    expect(status.slice(0, KEY_CALLS_PER_MINUTE).every((s) => s === 200)).toBe(true);
    expect(status.at(-1)).toBe(429);
  });
});
