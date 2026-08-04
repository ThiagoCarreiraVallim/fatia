import { GroupRole, GroupType, MembershipStatus } from '@fatia/db';
import { GrupoNaoFaturavelError, fecharCiclo, type CicloDb } from '../close-cycle';

const GRUPO = 'grupo-1';
const AGORA = new Date('2026-08-03T12:00:00Z'); // fecha o ciclo de julho/2026

const DOMINIOS = ['meal', 'workoutSession', 'weightLog', 'stepLog', 'waterLog', 'goal'] as const;

type MockDb = {
  group: { findUnique: jest.Mock };
  groupMembership: { findMany: jest.Mock };
} & Record<(typeof DOMINIOS)[number], { findMany: jest.Mock }>;

const makeDb = (): MockDb =>
  ({
    group: { findUnique: jest.fn() },
    groupMembership: { findMany: jest.fn(async () => []) },
    ...Object.fromEntries(DOMINIOS.map((d) => [d, { findMany: jest.fn(async () => []) }])),
  }) as MockDb;

const como = (db: MockDb) => db as unknown as CicloDb;

const patrocinado = (timezone = 'America/Sao_Paulo') => ({
  id: GRUPO,
  type: GroupType.SPONSORED,
  owner: { timezone },
});

const membresia = (id: string, userId: string, joined: string, left: string | null = null) => ({
  id,
  userId,
  joinedAt: new Date(joined),
  leftAt: left ? new Date(left) : null,
  user: { name: `Aluno ${id}` },
});

/** Marca todos como ativos por atividade — o recorte em teste é outro. */
const todosAtivos = (db: MockDb, ...userIds: string[]) => {
  db.meal.findMany.mockResolvedValue(userIds.map((userId) => ({ userId })));
};

const PARAMS = { groupId: GRUPO, tier: 'basico', pricePerStudentCents: 1500, cycleDay: 1 };

describe('fecharCiclo', () => {
  let db: MockDb;

  beforeEach(() => {
    db = makeDb();
  });

  describe('a regra que não pode ser violada', () => {
    it('recusa grupo social, sem contar cabeça nenhuma', async () => {
      db.group.findUnique.mockResolvedValue({
        id: GRUPO,
        type: GroupType.SOCIAL,
        owner: { timezone: 'America/Sao_Paulo' },
      });

      await expect(fecharCiclo(como(db), PARAMS, AGORA)).rejects.toThrow(GrupoNaoFaturavelError);

      // A recusa é anterior a qualquer leitura: o grupo do influenciador não é
      // "faturado em zero", ele não é faturado. E ninguém contou os fãs dele.
      expect(db.groupMembership.findMany).not.toHaveBeenCalled();
      for (const dominio of DOMINIOS) {
        expect(db[dominio].findMany).not.toHaveBeenCalled();
      }
    });

    it('recusa grupo inexistente com a mesma resposta', async () => {
      db.group.findUnique.mockResolvedValue(null);

      await expect(fecharCiclo(como(db), PARAMS, AGORA)).rejects.toThrow(GrupoNaoFaturavelError);
    });
  });

  describe('quem entra na conta', () => {
    it('cobra só quem é MEMBER, e só quem registrou atividade', async () => {
      db.group.findUnique.mockResolvedValue(patrocinado());
      db.groupMembership.findMany.mockResolvedValue([
        membresia('m1', 'u1', '2026-01-01T12:00:00Z'),
        membresia('m2', 'u2', '2026-01-01T12:00:00Z'),
      ]);
      todosAtivos(db, 'u1');

      const fatura = await fecharCiclo(como(db), PARAMS, AGORA);

      expect(fatura.activeCount).toBe(1);
      expect(fatura.lines.map((l) => l.membershipId)).toEqual(['m1']);

      // O papel entra na consulta, não num `filter` depois: o dono e o personal
      // da academia não são alunos, e cobrar o próprio dono como aluno é o erro
      // que aparece na primeira fatura.
      const where = db.groupMembership.findMany.mock.calls[0][0].where;
      expect(where.role).toBe(GroupRole.MEMBER);
      expect(where.groupId).toBe(GRUPO);
    });

    it('inclui quem saiu no meio do ciclo e exclui quem nunca entrou', async () => {
      db.group.findUnique.mockResolvedValue(patrocinado());
      db.groupMembership.findMany.mockResolvedValue([]);

      await fecharCiclo(como(db), PARAMS, AGORA);

      const where = db.groupMembership.findMany.mock.calls[0][0].where;
      // `joinedAt` nulo é convite não aceito: não há o que cobrar.
      expect(where.joinedAt.not).toBeNull();
      expect(where.OR).toEqual([
        { status: MembershipStatus.ACTIVE },
        {
          status: { in: [MembershipStatus.LEFT, MembershipStatus.REMOVED] },
          leftAt: { gt: new Date('2026-07-01T03:00:00Z') },
        },
      ]);
    });

    it('procura atividade só entre os membros do grupo', async () => {
      db.group.findUnique.mockResolvedValue(patrocinado());
      db.groupMembership.findMany.mockResolvedValue([
        membresia('m1', 'u1', '2026-01-01T12:00:00Z'),
        membresia('m2', 'u2', '2026-01-01T12:00:00Z'),
      ]);

      await fecharCiclo(como(db), PARAMS, AGORA);

      expect(db.meal.findMany.mock.calls[0][0].where.userId).toEqual({ in: ['u1', 'u2'] });
    });

    it('conta a atividade na janela cortada no fuso do dono do grupo', async () => {
      db.group.findUnique.mockResolvedValue(patrocinado());
      db.groupMembership.findMany.mockResolvedValue([
        membresia('m1', 'u1', '2026-01-01T12:00:00Z'),
      ]);

      await fecharCiclo(como(db), PARAMS, AGORA);

      // 02/07 e 01/08, meia-noite em São Paulo = 03:00 UTC. Em UTC a janela
      // fecharia três horas antes e perderia quem registrou depois das 21h.
      expect(db.meal.findMany.mock.calls[0][0].where.createdAt).toEqual({
        gte: new Date('2026-07-02T03:00:00Z'),
        lt: new Date('2026-08-01T03:00:00Z'),
      });
    });
  });

  describe('a fatura', () => {
    it('soma as linhas exatamente, sem resíduo de arredondamento', async () => {
      db.group.findUnique.mockResolvedValue(patrocinado());
      db.groupMembership.findMany.mockResolvedValue([
        membresia('m1', 'u1', '2026-01-01T12:00:00Z'),
        membresia('m2', 'u2', '2026-07-11T13:00:00Z'), // 21 de 31 dias
        membresia('m3', 'u3', '2026-01-01T12:00:00Z', '2026-07-11T13:00:00Z'), // 11 de 31
      ]);
      todosAtivos(db, 'u1', 'u2', 'u3');

      const fatura = await fecharCiclo(como(db), PARAMS, AGORA);

      expect(fatura.lines.map((l) => l.proRataMilli)).toEqual([1000, 677, 355]);
      expect(fatura.lines.map((l) => l.amountCents)).toEqual([1500, 1016, 533]);
      expect(fatura.subtotalCents).toBe(3049);
      expect(fatura.totalCents).toBe(fatura.subtotalCents);
      expect(fatura.lines.reduce((s, l) => s + l.amountCents, 0)).toBe(fatura.totalCents);
      expect(fatura.activeCount).toBe(fatura.lines.length);
    });

    it('carrega o período, o denominador e a faixa contratada', async () => {
      db.group.findUnique.mockResolvedValue(patrocinado());
      db.groupMembership.findMany.mockResolvedValue([]);

      const fatura = await fecharCiclo(como(db), PARAMS, AGORA);

      expect(fatura.periodStart.toISOString()).toBe('2026-07-01T03:00:00.000Z');
      expect(fatura.periodEnd.toISOString()).toBe('2026-08-01T03:00:00.000Z');
      expect(fatura.periodDays).toBe(31);
      expect(fatura.tier).toBe('basico');
      expect(fatura.currency).toBe('BRL');
      expect(fatura.activeCount).toBe(0);
      expect(fatura.totalCents).toBe(0);
    });

    it('produz a mesma fatura, linha por linha, em duas execuções', async () => {
      db.group.findUnique.mockResolvedValue(patrocinado());
      const membros = [
        { ...membresia('m2', 'u2', '2026-01-01T12:00:00Z'), user: { name: 'Zuleica' } },
        { ...membresia('m1', 'u1', '2026-01-01T12:00:00Z'), user: { name: 'Ana' } },
      ];
      todosAtivos(db, 'u1', 'u2');

      db.groupMembership.findMany.mockResolvedValue(membros);
      const primeira = await fecharCiclo(como(db), PARAMS, AGORA);
      db.groupMembership.findMany.mockResolvedValue([...membros].reverse());
      const segunda = await fecharCiclo(como(db), PARAMS, AGORA);

      expect(primeira.lines.map((l) => l.displayName)).toEqual(['Ana', 'Zuleica']);
      expect(segunda.lines).toEqual(primeira.lines);
    });

    it('recusa preço que não é centavo inteiro', async () => {
      db.group.findUnique.mockResolvedValue(patrocinado());

      await expect(
        fecharCiclo(como(db), { ...PARAMS, pricePerStudentCents: 15.9 }, AGORA),
      ).rejects.toThrow(RangeError);
      await expect(
        fecharCiclo(como(db), { ...PARAMS, pricePerStudentCents: -1 }, AGORA),
      ).rejects.toThrow(RangeError);
    });
  });
});
