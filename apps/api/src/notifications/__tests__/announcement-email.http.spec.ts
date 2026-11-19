import type { AddressInfo } from 'node:net';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ThrottlerModule } from '@nestjs/throttler';
import { AnnouncementEmailController } from '../announcement-email.controller';
import { AnnouncementEmailService } from '../announcement-email.service';

/**
 * O descadastro pela porta da frente (#398, revisão): a rota é pública e a
 * web chama a API pelo servidor, então o IP é o mesmo para todo mundo. O teto
 * é por link (pessoa do token): quem abusa de um link não trava o de outra.
 */
const T_ANA = `${Buffer.from('ana').toString('base64url')}.${'a'.repeat(43)}`;
const T_BIA = `${Buffer.from('bia').toString('base64url')}.${'b'.repeat(43)}`;

describe('descadastro: teto por link (HTTP)', () => {
  let app: INestApplication;
  let base: string;
  const status = jest.fn().mockResolvedValue({ subscribed: true });
  const setSubscribed = jest.fn().mockResolvedValue({ subscribed: false });

  beforeEach(async () => {
    const modulo = await Test.createTestingModule({
      imports: [
        ThrottlerModule.forRoot([
          { name: 'default', ttl: 60_000, limit: 100 },
          { name: 'oauth', ttl: 60_000, limit: 600 },
        ]),
      ],
      controllers: [AnnouncementEmailController],
      providers: [{ provide: AnnouncementEmailService, useValue: { status, setSubscribed } }],
    }).compile();
    app = modulo.createNestApplication({ logger: false });
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.listen(0, '127.0.0.1');
    const { port } = app.getHttpServer().address() as AddressInfo;
    base = `http://127.0.0.1:${port}/api/email/announcements/subscription`;
  });

  afterEach(async () => {
    await app.close();
  });

  const ler = (t: string) => fetch(`${base}?t=${encodeURIComponent(t)}`);
  const mudar = (t: string) =>
    fetch(base, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ t, subscribed: false }),
    });

  it('o mesmo link estoura o teto; o link de outra pessoa, do mesmo IP, segue', async () => {
    for (let i = 0; i < 20; i++) expect((await ler(T_ANA)).status).toBe(200);
    expect((await ler(T_ANA)).status).toBe(429);
    expect((await ler(T_BIA)).status).toBe(200);
  });

  it('o POST tem teto próprio por link', async () => {
    for (let i = 0; i < 10; i++) expect((await mudar(T_ANA)).status).toBe(201);
    expect((await mudar(T_ANA)).status).toBe(429);
    expect((await mudar(T_BIA)).status).toBe(201);
  });

  it('o POST de um clique do provedor (List-Unsubscribe=One-Click) descadastra pelo link', async () => {
    const r = await fetch(
      `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}/api/email/announcements/one-click?t=${encodeURIComponent(T_ANA)}`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: 'List-Unsubscribe=One-Click',
      },
    );
    expect(r.status).toBe(200);
    expect(setSubscribed).toHaveBeenCalledWith(T_ANA, false);
  });
});
