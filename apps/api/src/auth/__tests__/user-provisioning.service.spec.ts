import { Prisma, Role } from '@prisma/client';
import { UserProvisioningService } from '../user-provisioning.service';
import type { PrismaService } from '../../common/prisma.service';
import type { LogtoJwtPayload } from '../jwt-validation.service';
import type { LogtoManagementService } from '../logto-management.service';

type MockPrisma = {
  user: { findUnique: jest.Mock; create: jest.Mock; update: jest.Mock };
};

const makePrisma = (): MockPrisma => ({
  user: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
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

    it('primeiro acesso com requisições paralelas: quem perde a corrida devolve o usuário criado', async () => {
      const criado = {
        id: 'user-3',
        email: 'user@example.com',
        role: Role.USER,
        timezone: 'America/Sao_Paulo',
      };
      prisma.user.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce(criado);
      prisma.user.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError(
          'Unique constraint failed on the fields: (`email`)',
          {
            code: 'P2002',
            clientVersion: 'test',
          },
        ),
      );

      await expect(service.provision(makePayload())).resolves.toEqual(criado);
    });

    it('conflito de unique sem usuário pelo sub é de outra conta, e sobe', async () => {
      const conflito = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: 'test',
      });
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockRejectedValue(conflito);

      await expect(service.provision(makePayload())).rejects.toBe(conflito);
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

  /**
   * O access token do Logto não traz `email` nem `name`. Sem a Management API, todo
   * usuário real nascia `<sub>@logto.local` com o `sub` no lugar do nome — e a tela
   * do perfil e a saudação do dashboard mostravam isso.
   */
  describe('perfil a partir da Management API do Logto', () => {
    let logto: { getUserProfile: jest.Mock };

    beforeEach(() => {
      logto = { getUserProfile: jest.fn() };
      service = new UserProvisioningService(
        prisma as unknown as PrismaService,
        logto as unknown as LogtoManagementService,
      );
    });

    it('cria o usuário com o e-mail e o nome do Logto quando o token não os traz', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockImplementation(({ data }) =>
        Promise.resolve({ id: 'u', email: data.email, role: data.role, timezone: 'UTC' }),
      );
      logto.getUserProfile.mockResolvedValue({ email: 'ana@example.com', name: 'Ana' });

      await service.provision(makePayload({ email: undefined, name: undefined }));

      expect(logto.getUserProfile).toHaveBeenCalledWith('logto|abc123');
      expect(prisma.user.create.mock.calls[0][0].data).toMatchObject({
        email: 'ana@example.com',
        name: 'Ana',
      });
    });

    it('primeiro acesso em paralelo: quem chega durante a consulta espera o perfil, e não nasce provisório', async () => {
      // O primeiro acesso dispara várias requisições juntas. Antes, a segunda via o
      // `sub` já marcado como consultado, criava `<sub>@logto.local` sem esperar a
      // primeira, e a conta ficava provisória até a API reiniciar.
      let linha: { id: string; email: string; role: Role; timezone: string } | null = null;
      prisma.user.findUnique.mockImplementation(() => Promise.resolve(linha));
      prisma.user.create.mockImplementation(({ data }) => {
        if (linha) {
          return Promise.reject(
            new Prisma.PrismaClientKnownRequestError('unique', {
              code: 'P2002',
              clientVersion: 'x',
            }),
          );
        }
        linha = { id: 'u', email: data.email, role: data.role, timezone: 'UTC' };
        return Promise.resolve(linha);
      });
      let responder: (perfil: { email: string; name: string }) => void = () => undefined;
      logto.getUserProfile.mockReturnValue(new Promise((resolve) => (responder = resolve)));

      const payload = makePayload({ email: undefined, name: undefined });
      const primeira = service.provision(payload);
      const segunda = service.provision(payload);
      await new Promise((resolve) => setImmediate(resolve));
      responder({ email: 'ana@example.com', name: 'Ana' });

      const [a, b] = await Promise.all([primeira, segunda]);
      expect(a.email).toBe('ana@example.com');
      expect(b.email).toBe('ana@example.com');
      expect(logto.getUserProfile).toHaveBeenCalledTimes(1);
    });

    it('não consulta o Logto quando o token já traz o e-mail', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockResolvedValue({
        id: 'u',
        email: 'x',
        role: Role.USER,
        timezone: 'UTC',
      });

      await service.provision(makePayload());

      expect(logto.getUserProfile).not.toHaveBeenCalled();
    });

    it('corrige o e-mail provisório de quem já existe, uma vez por processo', async () => {
      const placeholder = {
        id: 'u',
        email: 'logto|abc123@logto.local',
        role: Role.USER,
        timezone: 'UTC',
      };
      prisma.user.findUnique.mockResolvedValue(placeholder);
      logto.getUserProfile.mockResolvedValue({ email: 'ana@example.com', name: 'Ana' });
      prisma.user.update.mockResolvedValue({ ...placeholder, email: 'ana@example.com' });

      const first = await service.provision(makePayload({ email: undefined }));
      await service.provision(makePayload({ email: undefined }));

      expect(first.email).toBe('ana@example.com');
      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { email: 'ana@example.com', name: 'Ana' } }),
      );
      expect(logto.getUserProfile).toHaveBeenCalledTimes(1);
    });

    it('mantém o provisório quando o e-mail do Logto já pertence a outra conta', async () => {
      const placeholder = {
        id: 'u',
        email: 'logto|abc123@logto.local',
        role: Role.USER,
        timezone: 'UTC',
      };
      prisma.user.findUnique.mockResolvedValue(placeholder);
      logto.getUserProfile.mockResolvedValue({ email: 'dup@example.com', name: null });
      prisma.user.update.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('unique', { code: 'P2002', clientVersion: 'x' }),
      );

      await expect(service.provision(makePayload({ email: undefined }))).resolves.toEqual(
        placeholder,
      );
    });

    it('segue com o provisório quando a Management API não está configurada', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockImplementation(({ data }) =>
        Promise.resolve({ id: 'u', email: data.email, role: data.role, timezone: 'UTC' }),
      );
      logto.getUserProfile.mockResolvedValue(null);

      await service.provision(makePayload({ sub: 'logto|s', email: undefined }));

      expect(prisma.user.create.mock.calls[0][0].data.email).toBe('logto|s@logto.local');
    });
  });
});
