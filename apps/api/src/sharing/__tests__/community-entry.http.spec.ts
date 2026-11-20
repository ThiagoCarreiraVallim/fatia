import type { AddressInfo } from 'node:net';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ThrottlerModule } from '@nestjs/throttler';
import type { NextFunction, Request, Response } from 'express';
import { PrismaService } from '../../common/prisma.service';
import { ConsentService } from '../consent.service';
import { ContentService } from '../content.service';
import { GroupService } from '../group.service';
import { InviteService } from '../invite.service';
import { MemberAdminService } from '../member-admin.service';
import { TeamService } from '../team.service';
import { MembershipService } from '../membership.service';
import { SharingController } from '../sharing.controller';

/**
 * Entrar com código pela **porta da frente** (#393, revisão I1): o
 * `ThrottlerModule` não é `APP_GUARD`, então `@Throttle` sozinho não faz nada.
 * Sem o guard de rota, o preview e o join viram oráculo de código: um token
 * válido em laço testa códigos sem limite.
 */

const USER = '11111111-1111-1111-1111-111111111111';
const OUTRO = '22222222-2222-2222-2222-222222222222';

interface Cenario {
  app: INestApplication;
  base: string;
  previewByCode: jest.Mock;
  requestJoin: jest.Mock;
  comoUsuario: (id: string) => void;
}

async function subirApp(): Promise<Cenario> {
  const previewByCode = jest.fn().mockResolvedValue({ id: 'g1' });
  const requestJoin = jest.fn().mockResolvedValue({ groupId: 'g1' });
  const modulo = await Test.createTestingModule({
    imports: [
      // O mesmo `forRoot` do `AppModule`, e nenhum `APP_GUARD` de throttle.
      ThrottlerModule.forRoot([
        { name: 'default', ttl: 60_000, limit: 100 },
        { name: 'oauth', ttl: 60_000, limit: 600 },
      ]),
    ],
    controllers: [SharingController],
    providers: [
      // Rotas `@SelfOnly`: o guarda de grupo não consulta o banco.
      { provide: PrismaService, useValue: {} },
      { provide: GroupService, useValue: { previewByCode } },
      { provide: MembershipService, useValue: { requestJoin } },
      { provide: InviteService, useValue: {} },
      { provide: ConsentService, useValue: {} },
      { provide: ContentService, useValue: {} },
      { provide: MemberAdminService, useValue: {} },
      { provide: TeamService, useValue: {} },
    ],
  }).compile();

  const app = modulo.createNestApplication({ logger: false });
  let atual = USER;
  app.use((req: Request, _res: Response, next: NextFunction) => {
    (req as Request & { user?: unknown }).user = { id: atual };
    next();
  });
  app.setGlobalPrefix('api');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  await app.listen(0, '127.0.0.1');
  const { port } = app.getHttpServer().address() as AddressInfo;
  return {
    app,
    base: `http://127.0.0.1:${port}/api/groups`,
    previewByCode,
    requestJoin,
    comoUsuario: (id) => {
      atual = id;
    },
  };
}

describe('entrar com código: teto por usuário (HTTP)', () => {
  let c: Cenario;
  beforeEach(async () => {
    c = await subirApp();
  });
  afterEach(async () => {
    await c.app.close();
  });

  const preview = (code: string) => fetch(`${c.base}/preview?code=${code}`);
  const join = (code: string) =>
    fetch(`${c.base}/join`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    });

  it('o preview passa de 30 por minuto e o excedente é 429, sem procurar', async () => {
    const status: number[] = [];
    for (let i = 0; i < 31; i++) status.push((await preview(`CODE${i}XYZ`)).status);
    expect(status.slice(0, 30).every((s) => s === 200)).toBe(true);
    expect(status[30]).toBe(429);
    expect(c.previewByCode).toHaveBeenCalledTimes(30);
  });

  it('o join passa de 20 por minuto e o excedente é 429, sem tentar entrar', async () => {
    const status: number[] = [];
    for (let i = 0; i < 21; i++) status.push((await join(`CODE${i}XYZ`)).status);
    expect(status.slice(0, 20).every((s) => s === 201)).toBe(true);
    expect(status[20]).toBe(429);
    expect(c.requestJoin).toHaveBeenCalledTimes(20);
  });

  it('o teto é por usuário', async () => {
    for (let i = 0; i < 20; i++) await join(`CODE${i}XYZ`);
    expect((await join('ZZZZZZZZ')).status).toBe(429);
    c.comoUsuario(OUTRO);
    expect((await join('ZZZZZZZZ')).status).toBe(201);
  });

  it('code: null não é 500 (cai no slug, ou responde 400)', async () => {
    const r = await fetch(`${c.base}/join`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: null }),
    });
    expect(r.status).toBe(400);
    const p = await fetch(`${c.base}/join`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: null, slug: 'academia-x' }),
    });
    expect(p.status).toBe(201);
    expect(c.requestJoin).toHaveBeenLastCalledWith(USER, 'academia-x', expect.anything());
  });
});
