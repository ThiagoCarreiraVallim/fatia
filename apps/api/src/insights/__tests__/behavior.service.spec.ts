import { BehaviorService, MODALITY_AXIS } from '../behavior.service';
import { suppress } from '../aggregation.service';
import { CANONICAL_MUSCLE_GROUPS } from '../../workout/helpers/muscle-group';
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
    const porChave = new Map(cells.map((cell) => [cell.key, cell]));
    expect(porChave.get('peito')).toEqual({ key: 'peito', n: 1, value: 1 });
    expect(porChave.get('costas')).toEqual({ key: 'costas', n: 1, value: 1 });

    // O eixo é a lista fechada inteira, na ordem dela: modalidade sem sessão
    // aparece como zero, não como lacuna.
    expect(cells.map((cell) => cell.key)).toEqual([...MODALITY_AXIS]);
    expect(porChave.get('cardio')).toEqual({ key: 'cardio', n: 0, value: 0 });
  });

  it('grupo muscular fora da lista canônica vira `outros` — a chave não é do aluno', async () => {
    // O bloqueio da revisão. `Exercise.muscleGroup` aceita 50 caracteres de
    // texto livre e exercício custom é criado pelo próprio aluno; `suppress()`
    // zera `value` e `n` mas **mantém a chave**. A célula saía com
    // `suppressed: true` e a frase de uma pessoa intacta — na resposta e no CSV.
    // O limiar não alcança isso: a existência da célula é a divulgação.
    const prisma = makePrisma();
    const CONFIDENCIAL = 'reabilitacao ombro pos cirurgia';
    prisma.sessionSet.findMany.mockResolvedValue([
      ...sessoesDe('peito', 11, 0),
      {
        sessionId: 's99',
        session: { userId: 'aluno-99' },
        exercise: { muscleGroup: CONFIDENCIAL },
      },
    ]);

    const cells = await new BehaviorService(prisma as unknown as PrismaService).modalityMix(
      Array.from({ length: 12 }, (_, i) => participante(i)),
      INICIO,
    );
    const aggregate = suppress(cells);

    expect(JSON.stringify(cells)).not.toContain(CONFIDENCIAL);
    expect(JSON.stringify(aggregate)).not.toContain(CONFIDENCIAL);
    expect(JSON.stringify(aggregate)).not.toContain('cirurgia');

    // Ele não some do agregado: entra no balde `outros`, e lá o limiar volta a
    // valer sobre uma célula cuja chave o produto controla.
    const outros = cells.find((cell) => cell.key === 'outros');
    expect(outros).toEqual({ key: 'outros', n: 1, value: 1 });
  });

  it('toda chave publicada vem da lista fechada, e a lista é a canônica + `outros`', async () => {
    const prisma = makePrisma();
    prisma.sessionSet.findMany.mockResolvedValue([
      { sessionId: 'a', session: { userId: 'aluno-1' }, exercise: { muscleGroup: 'PEITO' } },
      { sessionId: 'b', session: { userId: 'aluno-2' }, exercise: { muscleGroup: '=HYPERLINK()' } },
      { sessionId: 'c', session: { userId: 'aluno-3' }, exercise: { muscleGroup: 'crossfit' } },
    ]);

    const cells = await new BehaviorService(prisma as unknown as PrismaService).modalityMix(
      [1, 2, 3].map((i) => participante(i)),
      INICIO,
    );

    expect(MODALITY_AXIS).toEqual([...CANONICAL_MUSCLE_GROUPS, 'outros']);
    for (const cell of cells) expect(MODALITY_AXIS).toContain(cell.key);
    // `PEITO` normaliza para `peito`; os outros dois caem em `outros` e somam.
    const porChave = new Map(cells.map((cell) => [cell.key, cell]));
    expect(porChave.get('peito')?.n).toBe(1);
    expect(porChave.get('outros')).toEqual({ key: 'outros', n: 2, value: 2 });
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
      INICIO,
      AGORA,
    );

    // `n` é o tamanho da coorte, não o número de retidos: um percentual sobre
    // duas pessoas é o treino dessas duas com casas decimais.
    const porChave = new Map(cells.map((cell) => [cell.key, cell]));
    expect(porChave.get('2026-01')).toEqual({ key: '2026-01', n: 9, value: 78 });
    expect(porChave.get('2026-02')).toEqual({ key: '2026-02', n: 2, value: 50 });

    // Eixo sem buraco, da coorte mais antiga até hoje. Mês em que ninguém entrou
    // é zero — omiti-lo convidaria o leitor a preencher a lacuna.
    expect(cells.map((cell) => cell.key)).toEqual([
      '2026-01',
      '2026-02',
      '2026-03',
      '2026-04',
      '2026-05',
      '2026-06',
      '2026-07',
      '2026-08',
    ]);
    expect(porChave.get('2026-05')).toEqual({ key: '2026-05', n: 0, value: 0 });

    const { cells: publicadas } = suppress(cells);
    // Nenhuma coorte **com gente** sobra visível; os meses vazios continuam
    // publicados como zero, que não é segredo de ninguém.
    const comGente = publicadas.filter((cell) => ['2026-01', '2026-02'].includes(cell.key));
    expect(comGente.every((cell) => cell.suppressed)).toBe(true);
  });

  it('a janela é a de retenção: `retido` é ter treinado dentro do período', async () => {
    // O período era carimbado na resposta e ignorado na conta — 30 dias fixos
    // para qualquer janela pedida.
    const prisma = makePrisma();
    await new BehaviorService(prisma as unknown as PrismaService).retentionByCohort(
      [participante(1)],
      INICIO,
      AGORA,
    );

    expect(prisma.workoutSession.groupBy.mock.calls[0][0].where.startedAt).toEqual({ gte: INICIO });
  });

  it('não inventa balde para quem não tem data de entrada', async () => {
    const prisma = makePrisma();
    const cells = await new BehaviorService(prisma as unknown as PrismaService).retentionByCohort(
      [{ userId: 'aluno-x', timezone: 'America/Sao_Paulo', joinedAt: null }],
      INICIO,
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
      AGORA,
    );

    const porChave = new Map(cells.map((cell) => [cell.key, cell]));
    expect(porChave.get('2026-07')).toEqual({ key: '2026-07', n: 3, value: 75 });
    // Mês da janela sem sessão nenhuma vira zero, e não lacuna — a mesma regra
    // que `contar()` já aplicava nos recortes gratuitos.
    expect(cells.map((cell) => cell.key)).toEqual(['2026-05', '2026-06', '2026-07', '2026-08']);
    expect(porChave.get('2026-06')).toEqual({ key: '2026-06', n: 0, value: 0 });

    const serializado = JSON.stringify(cells);
    expect(serializado).not.toContain('plano-');
    expect(serializado).not.toContain('aluno-');
  });

  it('lê quantidade, nunca conteúdo do plano', async () => {
    const prisma = makePrisma();
    await new BehaviorService(prisma as unknown as PrismaService).planAdherenceByMonth(
      [participante(1)],
      INICIO,
      AGORA,
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
