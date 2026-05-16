import { UnauthorizedException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';

const jwtVerifyMock = jest.fn();
const createRemoteJWKSetMock: jest.Mock<{ __mockJwks: boolean }, [URL]> = jest.fn((_url: URL) => ({
  __mockJwks: true,
}));

jest.mock('jose', () => ({
  jwtVerify: (token: string, jwks: unknown, opts: unknown) => jwtVerifyMock(token, jwks, opts),
  createRemoteJWKSet: (url: URL) => createRemoteJWKSetMock(url),
}));

import { JwtValidationService } from '../jwt-validation.service';

const makeConfig = (values: Record<string, string>): ConfigService =>
  ({
    getOrThrow: jest.fn((key: string) => {
      if (!(key in values)) throw new Error(`Missing config: ${key}`);
      return values[key];
    }),
  }) as unknown as ConfigService;

const bootService = (values: Record<string, string> = {}) => {
  const config = makeConfig({
    LOGTO_ENDPOINT: 'https://logto.example.com',
    LOGTO_AUDIENCE: 'https://api.example.com',
    ...values,
  });
  const service = new JwtValidationService(config);
  service.onModuleInit();
  return service;
};

describe('JwtValidationService', () => {
  beforeEach(() => {
    jwtVerifyMock.mockReset();
    createRemoteJWKSetMock.mockClear();
  });

  describe('onModuleInit', () => {
    it('strips trailing slashes from LOGTO_ENDPOINT before building the issuer/jwks URLs', async () => {
      bootService({ LOGTO_ENDPOINT: 'https://logto.example.com///' });

      const jwksUrl = createRemoteJWKSetMock.mock.calls[0][0] as unknown as URL;
      expect(jwksUrl.toString()).toBe('https://logto.example.com/oidc/jwks');
    });

    it('throws when LOGTO_ENDPOINT or LOGTO_AUDIENCE is missing', () => {
      const config = makeConfig({ LOGTO_ENDPOINT: 'https://x' });
      const service = new JwtValidationService(config);

      expect(() => service.onModuleInit()).toThrow(/LOGTO_AUDIENCE/);
    });
  });

  describe('verify', () => {
    it('returns the payload when jwtVerify succeeds and sub is present', async () => {
      const service = bootService();
      jwtVerifyMock.mockResolvedValue({
        payload: { sub: 'logto|abc', email: 'u@x.y' },
        protectedHeader: {},
      });

      const result = await service.verify('valid-token');

      expect(result).toEqual({ sub: 'logto|abc', email: 'u@x.y' });
    });

    it('passes the configured issuer and audience to jwtVerify', async () => {
      const service = bootService();
      jwtVerifyMock.mockResolvedValue({ payload: { sub: 'x' }, protectedHeader: {} });

      await service.verify('t');

      expect(jwtVerifyMock).toHaveBeenCalledWith(
        't',
        expect.anything(),
        expect.objectContaining({
          issuer: 'https://logto.example.com/oidc',
          audience: 'https://api.example.com',
        }),
      );
    });

    it('throws UnauthorizedException when jose rejects the token', async () => {
      const service = bootService();
      jwtVerifyMock.mockRejectedValue(new Error('signature verification failed'));

      await expect(service.verify('bad-token')).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('throws UnauthorizedException when the verified payload has no sub claim', async () => {
      const service = bootService();
      jwtVerifyMock.mockResolvedValue({ payload: { email: 'x@y.z' }, protectedHeader: {} });

      await expect(service.verify('subless-token')).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });
});
