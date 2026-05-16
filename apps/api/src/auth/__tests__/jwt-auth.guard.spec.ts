import { UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtAuthGuard } from '../jwt-auth.guard';
import type { JwtValidationService } from '../jwt-validation.service';
import type { UserProvisioningService } from '../user-provisioning.service';

type MockValidation = { verify: jest.Mock };
type MockProvisioning = { provision: jest.Mock };

const makeReflector = (isPublic: boolean): jest.Mocked<Reflector> =>
  ({ getAllAndOverride: jest.fn().mockReturnValue(isPublic) }) as unknown as jest.Mocked<Reflector>;

const makeValidation = (): MockValidation => ({ verify: jest.fn() });
const makeProvisioning = (): MockProvisioning => ({ provision: jest.fn() });

type RequestStub = {
  headers: Record<string, string | undefined>;
  protocol: string;
  user?: unknown;
};

type ResponseStub = {
  setHeader: jest.Mock;
};

const makeContext = (req: RequestStub, res: ResponseStub) =>
  ({
    getHandler: jest.fn(),
    getClass: jest.fn(),
    switchToHttp: () => ({
      getRequest: () => req,
      getResponse: () => res,
    }),
  }) as unknown as Parameters<JwtAuthGuard['canActivate']>[0];

const makeRequest = (overrides: Partial<RequestStub> = {}): RequestStub => ({
  headers: { host: 'api.example.com' },
  protocol: 'https',
  ...overrides,
});

const makeResponse = (): ResponseStub => ({ setHeader: jest.fn() });

describe('JwtAuthGuard', () => {
  describe('public routes', () => {
    it('allows the request through without inspecting the Authorization header', async () => {
      const guard = new JwtAuthGuard(
        makeReflector(true),
        makeValidation() as unknown as JwtValidationService,
        makeProvisioning() as unknown as UserProvisioningService,
      );

      const result = await guard.canActivate(makeContext(makeRequest(), makeResponse()));

      expect(result).toBe(true);
    });
  });

  describe('protected routes', () => {
    it('throws UnauthorizedException when there is no Authorization header', async () => {
      const guard = new JwtAuthGuard(
        makeReflector(false),
        makeValidation() as unknown as JwtValidationService,
        makeProvisioning() as unknown as UserProvisioningService,
      );
      const req = makeRequest();
      const res = makeResponse();

      await expect(guard.canActivate(makeContext(req, res))).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('sets the WWW-Authenticate challenge header when the token is missing', async () => {
      const guard = new JwtAuthGuard(
        makeReflector(false),
        makeValidation() as unknown as JwtValidationService,
        makeProvisioning() as unknown as UserProvisioningService,
      );
      const req = makeRequest();
      const res = makeResponse();

      await expect(guard.canActivate(makeContext(req, res))).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(res.setHeader).toHaveBeenCalledWith(
        'WWW-Authenticate',
        expect.stringContaining(
          'resource_metadata="https://api.example.com/.well-known/oauth-protected-resource"',
        ),
      );
    });

    it('throws UnauthorizedException when the Authorization header does not start with Bearer', async () => {
      const guard = new JwtAuthGuard(
        makeReflector(false),
        makeValidation() as unknown as JwtValidationService,
        makeProvisioning() as unknown as UserProvisioningService,
      );
      const req = makeRequest({ headers: { authorization: 'Basic abc', host: 'api.example.com' } });

      await expect(guard.canActivate(makeContext(req, makeResponse()))).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('extracts the bearer token, provisions the user, and attaches it to the request', async () => {
      const validation = makeValidation();
      const provisioning = makeProvisioning();
      const payload = { sub: 'auth0|123', email: 'user@example.com' };
      const user = { id: 'user-1', timezone: 'UTC' };
      validation.verify.mockResolvedValue(payload);
      provisioning.provision.mockResolvedValue(user);

      const guard = new JwtAuthGuard(
        makeReflector(false),
        validation as unknown as JwtValidationService,
        provisioning as unknown as UserProvisioningService,
      );
      const req = makeRequest({
        headers: { authorization: 'Bearer my-token-abc', host: 'api.example.com' },
      });

      const result = await guard.canActivate(makeContext(req, makeResponse()));

      expect(result).toBe(true);
      expect(validation.verify).toHaveBeenCalledWith('my-token-abc');
      expect(provisioning.provision).toHaveBeenCalledWith(payload);
      expect((req as RequestStub & { user: unknown }).user).toEqual(user);
    });

    it('propagates the validation error and sets the invalid_token challenge', async () => {
      const validation = makeValidation();
      validation.verify.mockRejectedValue(new UnauthorizedException('expired'));

      const guard = new JwtAuthGuard(
        makeReflector(false),
        validation as unknown as JwtValidationService,
        makeProvisioning() as unknown as UserProvisioningService,
      );
      const req = makeRequest({
        headers: { authorization: 'Bearer bad-token', host: 'api.example.com' },
      });
      const res = makeResponse();

      await expect(guard.canActivate(makeContext(req, res))).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(res.setHeader).toHaveBeenCalledWith(
        'WWW-Authenticate',
        expect.stringContaining('error="invalid_token"'),
      );
    });

    it('prefers x-forwarded-proto and x-forwarded-host when behind a proxy', async () => {
      const guard = new JwtAuthGuard(
        makeReflector(false),
        makeValidation() as unknown as JwtValidationService,
        makeProvisioning() as unknown as UserProvisioningService,
      );
      const req = makeRequest({
        headers: {
          host: 'internal.local',
          'x-forwarded-proto': 'https',
          'x-forwarded-host': 'api.public.example.com',
        },
        protocol: 'http',
      });
      const res = makeResponse();

      await expect(guard.canActivate(makeContext(req, res))).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(res.setHeader).toHaveBeenCalledWith(
        'WWW-Authenticate',
        expect.stringContaining('https://api.public.example.com/.well-known/'),
      );
    });
  });
});
