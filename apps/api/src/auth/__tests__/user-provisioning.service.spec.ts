import { Role } from '@prisma/client';
import { UserProvisioningService } from '../user-provisioning.service';
import type { PrismaService } from '../../common/prisma.service';
import type { LogtoJwtPayload } from '../jwt-validation.service';

type MockPrisma = {
  user: { findUnique: jest.Mock; create: jest.Mock };
};

const makePrisma = (): MockPrisma => ({
  user: { findUnique: jest.fn(), create: jest.fn() },
});

const makePayload = (overrides: Partial<LogtoJwtPayload> = {}): LogtoJwtPayload => ({
  sub: 'logto|abc123',
  email: 'user@example.com',
  name: 'Jane Doe',
  ...overrides,
});

describe('UserProvisioningService', () => {
  let prisma: MockPrisma;
  let service: UserProvisioningService;

  beforeEach(() => {
    prisma = makePrisma();
    service = new UserProvisioningService(prisma as unknown as PrismaService);
  });

  describe('provision', () => {
    it('returns the existing user without creating a new one when logtoSub matches', async () => {
      const existing = {
        id: 'user-1',
        email: 'user@example.com',
        role: Role.USER,
        timezone: 'America/Sao_Paulo',
      };
      prisma.user.findUnique.mockResolvedValue(existing);

      const result = await service.provision(makePayload());

      expect(result).toEqual(existing);
      expect(prisma.user.create).not.toHaveBeenCalled();
    });

    it('looks up users by logtoSub (not by id) so external SSO is the source of truth', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        email: 'x@y.z',
        role: Role.USER,
        timezone: 'UTC',
      });

      await service.provision(makePayload({ sub: 'logto|xyz' }));

      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { logtoSub: 'logto|xyz' },
        select: { id: true, email: true, role: true, timezone: true },
      });
    });

    it('creates a new user when no row matches the logtoSub', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      const created = {
        id: 'user-2',
        email: 'new@example.com',
        role: Role.USER,
        timezone: 'UTC',
      };
      prisma.user.create.mockResolvedValue(created);

      const result = await service.provision(
        makePayload({ sub: 'logto|new', email: 'new@example.com', name: 'New' }),
      );

      expect(prisma.user.create).toHaveBeenCalledWith({
        data: { logtoSub: 'logto|new', email: 'new@example.com', name: 'New', role: Role.USER },
        select: { id: true, email: true, role: true, timezone: true },
      });
      expect(result).toEqual(created);
    });

    it('falls back to <sub>@logto.local when the payload has no email', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockImplementation(({ data }) =>
        Promise.resolve({ id: 'user-2', email: data.email, role: data.role, timezone: 'UTC' }),
      );

      await service.provision(makePayload({ sub: 'logto|noemail', email: undefined }));

      expect(prisma.user.create.mock.calls[0][0].data.email).toBe('logto|noemail@logto.local');
    });

    it('falls back to email local-part when name is missing', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockResolvedValue({
        id: 'user-2',
        email: 'jane@example.com',
        role: Role.USER,
        timezone: 'UTC',
      });

      await service.provision(makePayload({ email: 'jane@example.com', name: undefined }));

      expect(prisma.user.create.mock.calls[0][0].data.name).toBe('jane');
    });

    it('assigns ADMIN role when the admin role is present in the JWT (case-insensitive)', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockImplementation(({ data }) =>
        Promise.resolve({ id: 'user-2', email: 'a@b.c', role: data.role, timezone: 'UTC' }),
      );

      await service.provision(makePayload({ roles: ['Admin'] }));

      expect(prisma.user.create.mock.calls[0][0].data.role).toBe(Role.ADMIN);
    });

    it('defaults to USER role when roles array is empty or undefined', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockImplementation(({ data }) =>
        Promise.resolve({ id: 'user-2', email: 'a@b.c', role: data.role, timezone: 'UTC' }),
      );

      await service.provision(makePayload({ roles: [] }));

      expect(prisma.user.create.mock.calls[0][0].data.role).toBe(Role.USER);
    });

    it('assigns USER role when the roles array has other roles but not admin', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockImplementation(({ data }) =>
        Promise.resolve({ id: 'user-2', email: 'a@b.c', role: data.role, timezone: 'UTC' }),
      );

      await service.provision(makePayload({ roles: ['Editor', 'Viewer'] }));

      expect(prisma.user.create.mock.calls[0][0].data.role).toBe(Role.USER);
    });
  });
});
