import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { PrismaService } from '../../common/prisma.service';
import type { LogtoManagementService } from '../../auth/logto-management.service';
import { AccountService, DELETE_CONFIRMATION } from '../account.service';

const makePrisma = () => ({
  user: { findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]), delete: jest.fn() },
  userGoals: { findUnique: jest.fn().mockResolvedValue(null) },
  nutrientTarget: { findMany: jest.fn().mockResolvedValue([]) },
  goal: { findMany: jest.fn().mockResolvedValue([]) },
  meal: { findMany: jest.fn().mockResolvedValue([]) },
  food: { findMany: jest.fn().mockResolvedValue([]) },
  exercise: { findMany: jest.fn().mockResolvedValue([]) },
  workoutPlan: { findMany: jest.fn().mockResolvedValue([]) },
  workoutSession: { findMany: jest.fn().mockResolvedValue([]) },
  weightLog: { findMany: jest.fn().mockResolvedValue([]) },
  stepLog: { findMany: jest.fn().mockResolvedValue([]) },
  waterLog: { findMany: jest.fn().mockResolvedValue([]) },
  userAchievement: { findMany: jest.fn().mockResolvedValue([]) },
  trainingBlock: { findMany: jest.fn().mockResolvedValue([]) },
  professionalLink: { findMany: jest.fn().mockResolvedValue([]) },
  professionalAccessLog: { findMany: jest.fn().mockResolvedValue([]) },
});

const SCHEMA = resolve(__dirname, '../../../../../packages/db/prisma/schema.prisma');

/**
 * Relação do `User` no schema → chave no payload `fatia-export-v1`.
 *
 * O mapa é conferido CONTRA o schema logo abaixo, e é isso que o separa da lista à mão que
 * existia aqui antes: aquela enumerava os modelos que o export já buscava, então uma tabela
 * nova que ficasse de fora do export ficava de fora do teste junto e nada acusava. Foi assim
 * que `UserAchievement` — inclusive o `context` de `first_pr`, com exercício e carga — passou
 * despercebida pela portabilidade que o README promete como "devolve tudo".
 */
const CHAVE_NO_EXPORT: Record<string, string> = {
  goals: 'nutritionGoals',
  personalGoals: 'personalGoals',
  meals: 'meals',
  workoutPlans: 'workoutPlans',
  workoutSessions: 'workoutSessions',
  weightLogs: 'weightLogs',
  stepLogs: 'stepLogs',
  waterLogs: 'waterLogs',
  customFoods: 'customFoods',
  customExercises: 'customExercises',
  nutrientTargets: 'nutrientTargets',
  achievements: 'achievements',
  trainingBlocks: 'trainingBlocks',
  // B2B (#155): o consentimento é um ato do titular e a trilha é a resposta a "quem olhou meu
  // dado". Os dois entram no export por LGPD art. 18 V — ficaram de fora na #153 com o argumento
  // de que seriam consultados na tela de compartilhamento, e "está na tela" não é portabilidade.
  linksAsSubject: 'professionalLinks',
  accessLogs: 'accessLogs',
};

/**
 * Relações que NÃO entram no export, cada uma com o motivo. Ficar de fora é uma decisão
 * legítima; ficar de fora em silêncio não é.
 */
const FORA_DO_EXPORT: Record<string, string> = {
  ownedGroups: 'B2B (ADR 014): o grupo é do profissional, não dado pessoal de saúde do titular.',
  memberships: 'B2B: vínculo administrativo, e exportá-lo revelaria a composição do grupo.',
  linksAsProfessional: 'B2B: lista os PACIENTES do profissional — dado de terceiro.',
};

/** Nomes de model do schema, para separar campo de relação de campo escalar. */
function modelosDoSchema(schema: string): Set<string> {
  return new Set(Array.from(schema.matchAll(/^model\s+(\w+)\s*\{/gm), (m) => m[1]));
}

/** Campos do `User` cujo tipo é outro model — ou seja, dado pendurado no titular. */
function relacoesDoUser(schema: string): string[] {
  const bloco = /^model\s+User\s*\{([\s\S]*?)^\}/m.exec(schema);
  if (!bloco) throw new Error('model User não encontrado no schema.prisma');
  const modelos = modelosDoSchema(schema);

  return bloco[1]
    .split('\n')
    .map((linha) => /^\s*(\w+)\s+(\w+)(\[\])?\??/.exec(linha))
    .filter((m): m is RegExpExecArray => m !== null)
    .filter((m) => modelos.has(m[2]))
    .map((m) => m[1]);
}

const makeLogto = () => ({
  isConfigured: jest.fn().mockReturnValue(true),
  deleteUser: jest.fn().mockResolvedValue(true),
});

const USER = {
  id: 'user-A',
  email: 'a@test.local',
  name: 'A',
  logtoSub: 'logto|abc',
  role: 'USER',
  timezone: 'America/Sao_Paulo',
  heightCm: 180,
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-02'),
};

describe('AccountService', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let logto: ReturnType<typeof makeLogto>;
  let service: AccountService;

  beforeEach(() => {
    prisma = makePrisma();
    logto = makeLogto();
    service = new AccountService(
      prisma as unknown as PrismaService,
      logto as unknown as LogtoManagementService,
    );
  });

  describe('exportData', () => {
    it('escopa toda consulta ao usuário do contexto', async () => {
      prisma.user.findUnique.mockResolvedValue(USER);

      await service.exportData('user-A');

      // A garantia que importa: nenhuma das 11 consultas pode escapar do userId.
      expect(prisma.user.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'user-A' } }),
      );
      for (const model of [
        'nutrientTarget',
        'goal',
        'meal',
        'workoutPlan',
        'workoutSession',
        'weightLog',
        'stepLog',
        'waterLog',
      ] as const) {
        expect(prisma[model].findMany).toHaveBeenCalledWith(
          expect.objectContaining({ where: expect.objectContaining({ userId: 'user-A' }) }),
        );
      }
      // Catálogo custom é escopado por createdByUserId, não userId.
      for (const model of ['food', 'exercise'] as const) {
        expect(prisma[model].findMany).toHaveBeenCalledWith(
          expect.objectContaining({ where: { createdByUserId: 'user-A' } }),
        );
      }
    });

    it('devolve toda relação do User que não esteja declarada como fora', async () => {
      // A guarda é derivada do `schema.prisma`, não de uma lista escrita aqui: tabela nova
      // pendurada no `User` quebra este caso até alguém decidir, por escrito, se ela é dado do
      // titular. "Devolve tudo" é o que o README promete e o que a LGPD cobra.
      prisma.user.findUnique.mockResolvedValue(USER);
      const schema = readFileSync(SCHEMA, 'utf8');
      const relacoes = relacoesDoUser(schema);

      // Sanidade: se o parse do schema quebrar, os `expect` abaixo passariam vazios.
      expect(relacoes.length).toBeGreaterThan(10);

      const naoDecididas = relacoes.filter((r) => !CHAVE_NO_EXPORT[r] && !FORA_DO_EXPORT[r]);
      expect(naoDecididas).toEqual([]);

      const result = (await service.exportData('user-A')) as unknown as Record<string, unknown>;

      const ausentes = relacoes
        .filter((r) => CHAVE_NO_EXPORT[r])
        .filter((r) => !(CHAVE_NO_EXPORT[r] in result));
      expect(ausentes).toEqual([]);

      // Decisão que sumiu do schema vira permissão silenciosa para a próxima relação homônima.
      const orfas = [...Object.keys(CHAVE_NO_EXPORT), ...Object.keys(FORA_DO_EXPORT)]
        .filter((r) => !relacoes.includes(r))
        .sort();
      expect(orfas).toEqual([]);
    });

    it('exporta as conquistas com o contexto do desbloqueio', async () => {
      // O `context` de `first_pr` carrega exercício e carga — dado de saúde, e o único lugar
      // onde a conquista guarda algo que não dá para reconstruir a partir das outras tabelas.
      prisma.user.findUnique.mockResolvedValue(USER);
      prisma.userAchievement.findMany.mockResolvedValue([
        {
          key: 'first_pr',
          unlockedAt: new Date('2026-01-10'),
          context: { exerciseId: 7, exerciseName: 'Supino reto', weightKg: 80 },
        },
      ]);

      const result = await service.exportData('user-A');

      expect(prisma.userAchievement.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ userId: 'user-A' }) }),
      );
      expect(result.achievements).toEqual([
        expect.objectContaining({
          key: 'first_pr',
          context: { exerciseId: 7, exerciseName: 'Supino reto', weightKg: 80 },
        }),
      ]);
      expect(result.counts.achievements).toBe(1);
    });

    it('não seleciona logtoSub no export', async () => {
      prisma.user.findUnique.mockResolvedValue(USER);

      await service.exportData('user-A');

      // A garantia está no `select`, não no shape do retorno: logtoSub é
      // identificador de infraestrutura de auth, não dado do usuário. Asseverar
      // sobre o select testa o código; asseverar sobre o retorno testaria o mock,
      // que ignora `select`.
      const { select } = prisma.user.findUnique.mock.calls[0][0];
      expect(select).not.toHaveProperty('logtoSub');
      expect(select).toMatchObject({ id: true, email: true, name: true });
    });

    it('exporta consentimento e trilha do titular, com nome em vez de id do profissional', async () => {
      prisma.user.findUnique.mockResolvedValue(USER);
      prisma.professionalLink.findMany.mockResolvedValue([
        { id: 'link-1', scopes: ['WORKOUT'], professional: { name: 'Personal' } },
      ]);
      prisma.professionalAccessLog.findMany.mockResolvedValue([
        {
          at: new Date('2026-03-01'),
          action: 'probe',
          scope: 'WORKOUT',
          denied: true,
          professionalId: 'pro-1',
        },
      ]);
      prisma.user.findMany.mockResolvedValue([{ id: 'pro-1', name: 'Personal' }]);

      const result = await service.exportData('user-A');

      // As duas consultas são escopadas pelo TITULAR, não por `userId` — a
      // coluna se chama `subjectUserId`, e um `where: { userId }` copiado das
      // vizinhas nem compilaria, mas um `where: {}` esquecido devolveria a
      // trilha do produto inteiro dentro do export de uma pessoa.
      for (const model of ['professionalLink', 'professionalAccessLog'] as const) {
        expect(prisma[model].findMany).toHaveBeenCalledWith(
          expect.objectContaining({ where: { subjectUserId: 'user-A' } }),
        );
      }

      // O `professionalId` some do payload: o export é do titular, e o id interno
      // de outra pessoa não acrescenta nada a ele. O nome, sim — sem ele "quem
      // olhou meu dado" fica sem resposta, que é o motivo de a trilha existir.
      expect(result.accessLogs).toEqual([
        expect.objectContaining({ action: 'probe', denied: true, professionalName: 'Personal' }),
      ]);
      expect(result.accessLogs[0]).not.toHaveProperty('professionalId');
      expect(result.counts.professionalLinks).toBe(1);
      expect(result.counts.accessLogs).toBe(1);
    });

    it('inclui contagens para o cliente resumir sem varrer o payload', async () => {
      prisma.user.findUnique.mockResolvedValue(USER);
      prisma.meal.findMany.mockResolvedValue([{ id: 'm1' }, { id: 'm2' }]);
      prisma.weightLog.findMany.mockResolvedValue([{ id: 'w1' }]);

      const result = await service.exportData('user-A');

      expect(result.counts.meals).toBe(2);
      expect(result.counts.weightLogs).toBe(1);
      expect(result.format).toBe('fatia-export-v1');
      expect(result.exportedAt).toBeTruthy();
    });

    it('falha quando o usuário não existe', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.exportData('fantasma')).rejects.toThrow(NotFoundException);
    });
  });

  describe('deleteAccount', () => {
    it('recusa sem a confirmação exata e não toca no banco', async () => {
      await expect(service.deleteAccount('user-A', 'sim')).rejects.toThrow(BadRequestException);
      await expect(service.deleteAccount('user-A', '')).rejects.toThrow(BadRequestException);
      // Caixa e espaços importam — a trava não deve ser frouxa.
      await expect(service.deleteAccount('user-A', 'deletar minha conta')).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.deleteAccount('user-A', ` ${DELETE_CONFIRMATION} `)).rejects.toThrow(
        BadRequestException,
      );

      expect(prisma.user.delete).not.toHaveBeenCalled();
      expect(logto.deleteUser).not.toHaveBeenCalled();
    });

    it('apaga o usuário local e a identidade no Logto', async () => {
      prisma.user.findUnique.mockResolvedValue(USER);

      const result = await service.deleteAccount('user-A', DELETE_CONFIRMATION);

      expect(logto.deleteUser).toHaveBeenCalledWith('logto|abc');
      expect(prisma.user.delete).toHaveBeenCalledWith({ where: { id: 'user-A' } });
      expect(result).toMatchObject({ deleted: true, logtoIdentityDeleted: true });
    });

    it('apaga o Logto ANTES do banco — identidade órfã reprovisionaria conta vazia', async () => {
      prisma.user.findUnique.mockResolvedValue(USER);
      const order: string[] = [];
      logto.deleteUser.mockImplementation(async () => {
        order.push('logto');
        return true;
      });
      prisma.user.delete.mockImplementation(async () => {
        order.push('prisma');
        return USER;
      });

      await service.deleteAccount('user-A', DELETE_CONFIRMATION);

      expect(order).toEqual(['logto', 'prisma']);
    });

    it('não desfaz nada se o Logto falhar — apaga local e avisa', async () => {
      prisma.user.findUnique.mockResolvedValue(USER);
      logto.deleteUser.mockResolvedValue(false);

      const result = await service.deleteAccount('user-A', DELETE_CONFIRMATION);

      // O dado pessoal tem de ir embora mesmo sem a Management API configurada.
      expect(prisma.user.delete).toHaveBeenCalled();
      expect(result.logtoIdentityDeleted).toBe(false);
      expect(result.message).toContain('não pôde ser removida');
    });

    it('falha quando o usuário não existe', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.deleteAccount('fantasma', DELETE_CONFIRMATION)).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.user.delete).not.toHaveBeenCalled();
    });
  });
});
