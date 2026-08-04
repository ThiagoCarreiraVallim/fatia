import { BehaviorService } from '../behavior.service';
import { suppress } from '../aggregation.service';
import type { Participant } from '../stats-participation.port';
import type { PrismaService } from '../../common/prisma.service';

/**
 * Os recortes do painel pago (#160), e a exigência que a issue faz deles:
 * **as mesmas regras, sem exceção por ser pago.**
 */

const AGORA = new Date('2026-08-03T15:00:00Z');
const INICIO = new Date('2026-05-05T15:00:00Z');

const participante = (i: number, joinedAt = '2026-01-10T12:00:00Z'): Participant => ({
  userId: `aluno-${i}`,
  timezone: 'America/Sao_Paulo',
  joinedAt: new Date(joinedAt),
});

type MockPrisma = {
  workoutSession: { findMany: jest.Mock; groupBy: jest.Mock };
  sessionSet: { findMany: jest.Mock };
};

const makePrisma = (): MockPrisma => ({
  workoutSession: {
    findMany: jest.fn().mockResolvedValue([]),
    groupBy: jest.fn().mockResolvedValue([]),
  },
  sessionSet: { findMany: jest.fn().mockResolvedValue([]) },
});

describe('modality_mix', () => {
  it('conta a sessão uma vez por grupo muscular, não uma vez por série', async () => {
    const prisma = makePrisma();
    // Uma sessão com 4 séries de peito e 1 de costas conta 1 para cada grupo.
    prisma.sessionSet.findMany.mockResolvedValue([
      ...Array.from({ length: 4 }, () => ({
        sessionId: 's1',
        session: { userId: 'aluno-1' },
        exercise: { muscleGroup: 'peito' },
      })),
      { sessionId: 's1', session: { userId: 'aluno-1' }, exercise: { muscleGroup: 'costas' } },
    ]);

    const cells = await new BehaviorService(prisma as unknown as PrismaService).modalityMix(
      [participante(1)],
      INICIO,
    );

    // Contar séries deixaria um aluno meticuloso definir sozinho o "mix da
    // academia" — e um recorte que uma pessoa move sozinha é sobre ela.
    expect(cells).toEqual([
      { key: 'costas', n: 1, value: 1 },
      { key: 'peito', n: 1, value: 1 },
    ]);
  });

  it('modalidade com 3 pessoas é suprimida, e a complementar leva mais uma', async () => {
    const prisma = makePrisma();
    const sets = [
      ...sessoesDe('peito', 30, 0),
      ...sessoesDe('pernas', 20, 100),
      ...sessoesDe('cardio', 3, 200),
    ];
    prisma.sessionSet.findMany.mockResolvedValue(sets);

    const cells = await new BehaviorService(prisma as unknown as PrismaService).modalityMix(
      Array.from({ length: 53 }, (_, i) => participante(i)),
      INICIO,
    );
    const { cells: publicadas } = suppress(cells);

    const porChave = new Map(publicadas.map((cell) => [cell.key, cell]));
    expect(porChave.get('cardio')?.suppressed).toBe(true);
    // 20 < 30: `pernas` é o complemento. Sem ele, `cardio` sairia do total.
    expect(porChave.get('pernas')?.suppressed).toBe(true);
    expect(porChave.get('peito')?.suppressed).toBe(false);
  });
});

describe('retention_by_cohort', () => {
  it('o limiar vale para o tamanho da coorte — o denominador é o que protege', async () => {
    const prisma = makePrisma();
    // Coorte de fevereiro: 2 pessoas, 1 retida = 100%... de duas pessoas.
    const participantes = [
      ...Array.from({ length: 9 }, (_, i) => participante(i, '2026-01-10T12:00:00Z')),
      participante(90, '2026-02-10T12:00:00Z'),
      participante(91, '2026-02-11T12:00:00Z'),
    ];
    prisma.workoutSession.groupBy.mockResolvedValue([
      { userId: 'aluno-90', _count: { _all: 4 } },
      ...Array.from({ length: 7 }, (_, i) => ({ userId: `aluno-${i}`, _count: { _all: 5 } })),
    ]);

    const cells = await new BehaviorService(prisma as unknown as PrismaService).retentionByCohort(
      participantes,
      AGORA,
    );

    // `n` é o tamanho da coorte, não o número de retidos: um percentual sobre
    // duas pessoas é o treino dessas duas com casas decimais.
    expect(cells).toEqual([
      { key: '2026-01', n: 9, value: 78 },
      { key: '2026-02', n: 2, value: 50 },
    ]);

    const { cells: publicadas } = suppress(cells);
    expect(publicadas.every((cell) => cell.suppressed)).toBe(true);
  });

  it('não inventa balde para quem não tem data de entrada', async () => {
    const prisma = makePrisma();
    const cells = await new BehaviorService(prisma as unknown as PrismaService).retentionByCohort(
      [{ userId: 'aluno-x', timezone: 'America/Sao_Paulo', joinedAt: null }],
      AGORA,
    );

    // Um balde "sem coorte" juntaria os casos estranhos num recorte com nome de
    // vazio — e caso estranho é exatamente quem é fácil de reconhecer.
    expect(cells).toEqual([]);
  });
});

describe('plan_adherence_by_month', () => {
  it('devolve só percentual e n — nenhum id de plano, nenhum exercício', async () => {
    const prisma = makePrisma();
    prisma.workoutSession.findMany.mockResolvedValue([
      { userId: 'aluno-1', startedAt: new Date('2026-07-05T13:00:00Z'), planId: 'plano-a' },
      { userId: 'aluno-1', startedAt: new Date('2026-07-06T13:00:00Z'), planId: 'plano-a' },
      { userId: 'aluno-2', startedAt: new Date('2026-07-07T13:00:00Z'), planId: null },
      { userId: 'aluno-3', startedAt: new Date('2026-07-08T13:00:00Z'), planId: 'plano-b' },
    ]);

    const cells = await new BehaviorService(
      prisma as unknown as PrismaService,
    ).planAdherenceByMonth(
      [1, 2, 3].map((i) => participante(i)),
      INICIO,
    );

    expect(cells).toEqual([{ key: '2026-07', n: 3, value: 75 }]);
    const serializado = JSON.stringify(cells);
    expect(serializado).not.toContain('plano-');
    expect(serializado).not.toContain('aluno-');
  });

  it('lê quantidade, nunca conteúdo do plano', async () => {
    const prisma = makePrisma();
    await new BehaviorService(prisma as unknown as PrismaService).planAdherenceByMonth(
      [participante(1)],
      INICIO,
    );

    // O `select` é a fronteira: sem `plan`, sem `sets`, sem `notes`, o conteúdo
    // do treino não chega nem a sair do banco.
    const select = prisma.workoutSession.findMany.mock.calls[0][0].select;
    expect(Object.keys(select).sort()).toEqual(['planId', 'startedAt', 'userId']);
  });
});

/** `quantos` sessões de um grupo muscular, cada uma de um aluno diferente. */
function sessoesDe(muscleGroup: string, quantos: number, offset: number) {
  return Array.from({ length: quantos }, (_, i) => ({
    sessionId: `s${offset + i}`,
    session: { userId: `aluno-${offset + i}` },
    exercise: { muscleGroup },
  }));
}
