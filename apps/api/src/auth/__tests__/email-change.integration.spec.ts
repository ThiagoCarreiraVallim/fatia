import { BadRequestException, ConflictException, HttpException, HttpStatus } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';

const jwtVerifyMock = jest.fn();
jest.mock('jose', () => ({
  jwtVerify: (token: string, jwks: unknown, opts: unknown) => jwtVerifyMock(token, jwks, opts),
  createRemoteJWKSet: () => ({ jwks: true }),
}));

import { PrismaService } from '../../common/prisma.service';
import { IdentitySyncService } from '../identity-sync.service';
import type { LogtoManagementService } from '../logto-management.service';

/**
 * Troca de e-mail (ADR 050) no Postgres real. O código do Logto é "Generic":
 * fica amarrado só ao e-mail, não à pessoa. Por isso a senha conferida na parte
 * 1 vira um pedido pendente desta conta e deste e-mail, e a parte 2 só vale com
 * ele — senão um access token roubado tomaria a conta com o código que o
 * atacante pediu com a própria senha.
 */
describe('troca de e-mail amarrada à conta (integração)', () => {
  const prisma = new PrismaService();
  const stamp = `emailchg-${Date.now()}`;
  const criados: string[] = [];
  let n = 0;

  /** Um Logto de mentira com o comportamento real que importa aqui. */
  const codes = new Map<string, string>();
  const primary = new Map<string, string>();
  const passwords = new Map<string, string>();
  const logto = {
    isConfigured: () => true,
    verifyPassword: jest.fn(async (sub: string, pw: string) => passwords.get(sub) === pw),
    sendEmailCode: jest.fn(async (email: string) => void codes.set(email, '123456')),
    verifyEmailCode: jest.fn(async (email: string, code: string) => codes.get(email) === code),
    findUserIdByEmail: jest.fn(async (email: string) => {
      for (const [sub, e] of primary) if (e === email) return sub;
      return null;
    }),
    updatePrimaryEmail: jest.fn(async (sub: string, email: string) => {
      primary.set(sub, email);
      return 'ok' as const;
    }),
    updateUserName: jest.fn(),
  };
  const config = {
    get: (k: string) => (k === 'LOGTO_MOBILE_APP_ID' ? 'mobile' : undefined),
    getOrThrow: () => 'https://auth.example.com',
  } as unknown as ConfigService;
  const service = new IdentitySyncService(
    config,
    prisma,
    logto as unknown as LogtoManagementService,
  );
  service.onModuleInit();

  async function pessoa(password = 'senha-certa') {
    n += 1;
    const sub = `${stamp}-${n}`;
    const email = `${sub}@test.local`;
    const user = await prisma.user.create({ data: { logtoSub: sub, email, name: `Pessoa ${n}` } });
    criados.push(user.id);
    primary.set(sub, email);
    passwords.set(sub, password);
    return { id: user.id, sub, email };
  }

  const destino = () => `${stamp}-novo-${(n += 1)}@x.com`;

  beforeEach(() => {
    codes.clear();
    jest.clearAllMocks();
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: { in: criados } } });
    await prisma.$disconnect();
  });

  it('o código pedido por OUTRA conta (com a senha dela) não troca o e-mail da vítima', async () => {
    const vitima = await pessoa('senha-da-vitima');
    const atacante = await pessoa('senha-do-atacante');
    const alvo = destino();
    const { requestToken } = await service.requestEmailChange(
      atacante.id,
      alvo,
      'senha-do-atacante',
    );

    // Com o access token roubado da vítima e tudo o que o atacante tem.
    await expect(
      service.confirmEmailChange(vitima.id, alvo, '123456', requestToken),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(logto.updatePrimaryEmail).not.toHaveBeenCalled();
    expect((await prisma.user.findUniqueOrThrow({ where: { id: vitima.id } })).email).toBe(
      vitima.email,
    );
  });

  it('com o pedido da própria conta troca uma vez só e marca a data da troca', async () => {
    const ana = await pessoa();
    const alvo = destino();
    const { requestToken } = await service.requestEmailChange(ana.id, alvo, 'senha-certa');
    expect(logto.sendEmailCode).toHaveBeenCalledWith(alvo);

    const r = await service.confirmEmailChange(ana.id, alvo, '123456', requestToken);
    expect(r.email).toBe(alvo);
    const row = await prisma.user.findUniqueOrThrow({ where: { id: ana.id } });
    expect(row.email).toBe(alvo);
    expect(row.emailChangedAt).toBeInstanceOf(Date);

    // Uso único: o mesmo pedido não serve de novo.
    await expect(
      service.confirmEmailChange(ana.id, alvo, '123456', requestToken),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('o pedido é deste e-mail e deste nonce, e vence em 15 minutos', async () => {
    const ana = await pessoa();
    const alvo = destino();
    const { requestToken } = await service.requestEmailChange(ana.id, alvo, 'senha-certa');
    codes.set('outro@x.com', '123456');

    await expect(
      service.confirmEmailChange(ana.id, 'outro@x.com', '123456', requestToken),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.confirmEmailChange(ana.id, alvo, '123456', 'nonce-inventado'),
    ).rejects.toBeInstanceOf(BadRequestException);

    await prisma.emailChangeRequest.updateMany({
      where: { userId: ana.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    await expect(
      service.confirmEmailChange(ana.id, alvo, '123456', requestToken),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('destino que já é de outra conta (aqui ou no Logto): responde igual e não manda código', async () => {
    const ana = await pessoa();
    const bia = await pessoa();
    const soNoLogto = destino();
    primary.set('sub-so-no-logto', soNoLogto);

    for (const alvo of [bia.email, soNoLogto]) {
      const r = await service.requestEmailChange(ana.id, alvo, 'senha-certa');
      expect(typeof r.requestToken).toBe('string');
    }
    expect(logto.sendEmailCode).not.toHaveBeenCalled();
  });

  it('limita a parte 1 por pessoa e por e-mail de destino', async () => {
    const ana = await pessoa();
    for (let i = 0; i < 5; i += 1)
      await service.requestEmailChange(ana.id, destino(), 'senha-certa');
    await expect(
      service.requestEmailChange(ana.id, destino(), 'senha-certa'),
    ).rejects.toMatchObject({ status: HttpStatus.TOO_MANY_REQUESTS });

    const alvo = destino();
    for (let i = 0; i < 5; i += 1) {
      const p = await pessoa();
      await service.requestEmailChange(p.id, alvo, 'senha-certa');
    }
    const outra = await pessoa();
    const err = await service.requestEmailChange(outra.id, alvo, 'senha-certa').catch((e) => e);
    expect(err).toBeInstanceOf(HttpException);
    expect((err as HttpException).getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
  });

  it('confere a unicidade local antes do Logto e desfaz no Logto se o banco recusar', async () => {
    const ana = await pessoa();
    const bia = await pessoa();
    const alvo = destino();
    const { requestToken } = await service.requestEmailChange(ana.id, alvo, 'senha-certa');
    // Entre a parte 1 e a 2, outra conta local ficou com o e-mail.
    await prisma.user.update({ where: { id: bia.id }, data: { email: alvo } });
    await expect(
      service.confirmEmailChange(ana.id, alvo, '123456', requestToken),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(logto.updatePrimaryEmail).not.toHaveBeenCalled();

    // O banco recusa depois do Logto ter aceitado: o Logto volta ao e-mail antigo.
    const caio = await pessoa();
    const alvo2 = destino();
    const pedido = await service.requestEmailChange(caio.id, alvo2, 'senha-certa');
    const update = jest.spyOn(prisma.user, 'update').mockRejectedValueOnce(new Error('banco caiu'));
    await expect(
      service.confirmEmailChange(caio.id, alvo2, '123456', pedido.requestToken),
    ).rejects.toThrow('banco caiu');
    update.mockRestore();
    expect(logto.updatePrimaryEmail).toHaveBeenNthCalledWith(1, caio.sub, alvo2);
    expect(logto.updatePrimaryEmail).toHaveBeenNthCalledWith(2, caio.sub, caio.email);
    expect(primary.get(caio.sub)).toBe(caio.email);
  });

  it('um ID token emitido antes da troca não desfaz a troca', async () => {
    const ana = await pessoa();
    const alvo = destino();
    const { requestToken } = await service.requestEmailChange(ana.id, alvo, 'senha-certa');
    await service.confirmEmailChange(ana.id, alvo, '123456', requestToken);

    const antes = Math.floor(Date.now() / 1000) - 600;
    jwtVerifyMock.mockResolvedValue({
      payload: { sub: ana.sub, iat: antes, email: ana.email, email_verified: true },
      protectedHeader: {},
    });
    const r = await service.syncFromIdToken(ana.id, 'tok-velho');
    expect(r.email).toBe(alvo);

    // Um token novo (depois da troca) continua valendo.
    const outro = destino();
    jwtVerifyMock.mockResolvedValue({
      payload: {
        sub: ana.sub,
        iat: Math.floor(Date.now() / 1000) + 5,
        email: outro,
        email_verified: true,
      },
      protectedHeader: {},
    });
    expect((await service.syncFromIdToken(ana.id, 'tok-novo')).email).toBe(outro);
  });
});
