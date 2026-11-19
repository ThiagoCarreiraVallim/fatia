import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';

const jwtVerifyMock = jest.fn();
jest.mock('jose', () => ({
  jwtVerify: (token: string, jwks: unknown, opts: unknown) => jwtVerifyMock(token, jwks, opts),
  createRemoteJWKSet: () => ({ jwks: true }),
}));

import { IdentitySyncService } from '../identity-sync.service';
import type { PrismaService } from '../../common/prisma.service';
import type { LogtoManagementService } from '../logto-management.service';

const SUB = 'sub-ana';
const USER = { id: 'user-ana', logtoSub: SUB, email: `${SUB}@logto.local`, name: SUB };

const config = (values: Record<string, string | undefined>): ConfigService =>
  ({
    get: jest.fn((k: string) => values[k]),
    getOrThrow: jest.fn((k: string) => {
      if (!values[k]) throw new Error(`Missing ${k}`);
      return values[k];
    }),
  }) as unknown as ConfigService;

const BASE = {
  LOGTO_ENDPOINT: 'https://auth.example.com/',
  LOGTO_MOBILE_APP_ID: 'mobile-app',
};

function setup(values: Record<string, string | undefined> = BASE) {
  const prisma = {
    user: {
      findUnique: jest.fn().mockResolvedValue({ ...USER }),
      update: jest.fn(async ({ data }: { data: Record<string, string> }) => ({ ...USER, ...data })),
    },
  };
  const logto = {
    isConfigured: jest.fn().mockReturnValue(true),
    updateUserName: jest.fn().mockResolvedValue(true),
    verifyPassword: jest.fn().mockResolvedValue(true),
    sendEmailCode: jest.fn().mockResolvedValue(undefined),
    verifyEmailCode: jest.fn().mockResolvedValue(true),
    updatePrimaryEmail: jest.fn().mockResolvedValue('ok'),
  };
  const service = new IdentitySyncService(
    config(values),
    prisma as unknown as PrismaService,
    logto as unknown as LogtoManagementService,
  );
  service.onModuleInit();
  return { service, prisma, logto };
}

const idToken = (claims: Record<string, unknown>) =>
  jwtVerifyMock.mockResolvedValue({ payload: { sub: SUB, ...claims }, protectedHeader: {} });

describe('IdentitySyncService.syncFromIdToken', () => {
  beforeEach(() => jwtVerifyMock.mockReset());

  it('valida assinatura, iss e aud do app mobile', async () => {
    const { service } = setup();
    idToken({ email: 'ana@x.com', email_verified: true, name: 'Ana Souza' });
    await service.syncFromIdToken(USER.id, 'tok');
    expect(jwtVerifyMock).toHaveBeenCalledWith('tok', expect.anything(), {
      issuer: 'https://auth.example.com/oidc',
      audience: ['mobile-app'],
    });
  });

  it('troca o e-mail provisório e o nome-sub pelos reais', async () => {
    const { service, prisma } = setup();
    idToken({ email: 'Ana@X.com', email_verified: true, name: '  Ana   Souza ' });
    const result = await service.syncFromIdToken(USER.id, 'tok');
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: USER.id },
        data: { email: 'ana@x.com', name: 'Ana Souza' },
      }),
    );
    expect(result).toEqual({ email: 'ana@x.com', name: 'Ana Souza' });
  });

  it('recusa id_token de outra conta (isolamento) sem gravar nada', async () => {
    const { service, prisma } = setup();
    jwtVerifyMock.mockResolvedValue({
      payload: { sub: 'sub-de-outra-pessoa', email: 'outra@x.com', email_verified: true },
      protectedHeader: {},
    });
    await expect(service.syncFromIdToken(USER.id, 'tok')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('recusa token com assinatura, emissor ou audience inválidos', async () => {
    const { service, prisma } = setup();
    jwtVerifyMock.mockRejectedValue(new Error('unexpected "aud" claim value'));
    await expect(service.syncFromIdToken(USER.id, 'tok')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('ignora e-mail não verificado', async () => {
    const { service, prisma } = setup();
    idToken({ email: 'ana@x.com', email_verified: false, name: 'Ana' });
    await service.syncFromIdToken(USER.id, 'tok');
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { name: 'Ana' } }),
    );
  });

  it('não sobrescreve o nome que a pessoa já escolheu', async () => {
    const { service, prisma } = setup();
    prisma.user.findUnique.mockResolvedValue({
      ...USER,
      email: 'ana@x.com',
      name: 'Aninha',
    });
    idToken({ email: 'ana@x.com', email_verified: true, name: 'Ana Souza' });
    const result = await service.syncFromIdToken(USER.id, 'tok');
    expect(prisma.user.update).not.toHaveBeenCalled();
    expect(result).toEqual({ email: 'ana@x.com', name: 'Aninha' });
  });

  it('e-mail já usado por outra conta: grava só o nome', async () => {
    const { service, prisma } = setup();
    prisma.user.update
      .mockRejectedValueOnce(
        new Prisma.PrismaClientKnownRequestError('unique', { code: 'P2002', clientVersion: 'x' }),
      )
      .mockImplementationOnce(async ({ data }: { data: Record<string, string> }) => ({
        ...USER,
        ...data,
      }));
    idToken({ email: 'ana@x.com', email_verified: true, name: 'Ana' });
    const result = await service.syncFromIdToken(USER.id, 'tok');
    expect(prisma.user.update).toHaveBeenLastCalledWith(
      expect.objectContaining({ data: { name: 'Ana' } }),
    );
    expect(result.email).toBe(USER.email);
  });

  it('sem LOGTO_MOBILE_APP_ID responde 503', async () => {
    const { service } = setup({ LOGTO_ENDPOINT: BASE.LOGTO_ENDPOINT });
    await expect(service.syncFromIdToken(USER.id, 'tok')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});

describe('IdentitySyncService — nome e e-mail para o Logto', () => {
  it('manda o nome editado ao Logto pelo sub da própria pessoa', async () => {
    const { service, logto } = setup();
    await service.pushName(USER.id, 'Ana Souza');
    expect(logto.updateUserName).toHaveBeenCalledWith(SUB, 'Ana Souza');
  });

  it('troca de e-mail: confere a senha antes de mandar o código', async () => {
    const { service, logto } = setup();
    logto.verifyPassword.mockResolvedValue(false);
    await expect(
      service.requestEmailChange(USER.id, 'nova@x.com', 'errada'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(logto.sendEmailCode).not.toHaveBeenCalled();

    logto.verifyPassword.mockResolvedValue(true);
    await service.requestEmailChange(USER.id, ' Nova@X.com ', 'certa');
    expect(logto.verifyPassword).toHaveBeenLastCalledWith(SUB, 'certa');
    expect(logto.sendEmailCode).toHaveBeenCalledWith('nova@x.com');
  });

  it('troca de e-mail: código certo grava no Logto e no perfil', async () => {
    const { service, logto, prisma } = setup();
    const result = await service.confirmEmailChange(USER.id, 'nova@x.com', '123456');
    expect(logto.verifyEmailCode).toHaveBeenCalledWith('nova@x.com', '123456');
    expect(logto.updatePrimaryEmail).toHaveBeenCalledWith(SUB, 'nova@x.com');
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { email: 'nova@x.com' } }),
    );
    expect(result.email).toBe('nova@x.com');
  });

  it('troca de e-mail: código errado não muda nada', async () => {
    const { service, logto, prisma } = setup();
    logto.verifyEmailCode.mockResolvedValue(false);
    await expect(
      service.confirmEmailChange(USER.id, 'nova@x.com', '000000'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(logto.updatePrimaryEmail).not.toHaveBeenCalled();
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('troca de e-mail: e-mail de outra conta vira 409', async () => {
    const { service, logto } = setup();
    logto.updatePrimaryEmail.mockResolvedValue('in_use');
    await expect(
      service.confirmEmailChange(USER.id, 'outra@x.com', '123456'),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('sem a Management API a troca de e-mail fica indisponível', async () => {
    const { service, logto } = setup();
    logto.isConfigured.mockReturnValue(false);
    expect(service.emailChangeEnabled()).toBe(false);
    await expect(service.requestEmailChange(USER.id, 'nova@x.com', 'x')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});
