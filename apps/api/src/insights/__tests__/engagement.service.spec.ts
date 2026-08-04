import { EngagementService, SEM_TREINO, recencyBands } from '../engagement.service';
import type { Participant } from '../stats-participation.port';
import type { PrismaService } from '../../common/prisma.service';

/**
 * O service que conta — e que não tinha spec nenhum.
 *
 * A revisão trocou `set.add(evento.userId)` por `set.add(evento.userId + Math.random())`
 * dentro de `contar()`, ou seja, `n` passou a contar **eventos** em vez de
 * pessoas, e as 94 suítes continuaram verdes. É o único invariante que a
 * `AGGREGATION_POLICY.md` §1 escreve com todas as letras ("dez sessões da mesma
 * pessoa numa semana são `n = 1`") e é o número sobre o qual o limiar decide:
 * com ele errado, uma pessoa que treina seis vezes de madrugada vira `n = 6` e a
 * faixa é **publicada**.
 *
 * Nada aqui mocka o helper de fuso: quem mocka o helper de fuso não pega bug de
 * fuso.
 */

const AGORA = new Date('2026-08-03T15:00:00Z');
const INICIO = new Date('2026-07-06T15:00:00Z');

const participante = (i: number, timezone = 'America/Sao_Paulo'): Participant => ({
  userId: `aluno-${i}`,
  timezone,
  joinedAt: new Date('2026-01-10T12:00:00Z'),
});

type MockPrisma = {
  workoutSession: { findMany: jest.Mock; groupBy: jest.Mock };
};

const makePrisma = (): MockPrisma => ({
  workoutSession: {
    findMany: jest.fn().mockResolvedValue([]),
    groupBy: jest.fn().mockResolvedValue([]),
  },
});

const montar = (prisma: MockPrisma) => new EngagementService(prisma as unknown as PrismaService);

describe('contar — `n` é gente, não evento', () => {
  it('seis sessões da mesma pessoa na mesma faixa são n = 1', async () => {
    const prisma = makePrisma();
    // Uma pessoa só, treinando de madrugada seis vezes. Se `n` contasse eventos,
    // esta faixa passaria no limiar de 5 e o painel publicaria a rotina de uma
    // pessoa identificável.
    prisma.workoutSession.findMany.mockResolvedValue(
      Array.from({ length: 6 }, (_, i) => ({
        userId: 'aluno-1',
        startedAt: new Date(`2026-07-${10 + i}T07:00:00Z`), // 04h em São Paulo
        planId: null,
      })),
    );

    const cells = await montar(prisma).sessionsByHourBand([participante(1)], INICIO);
    const madrugada = cells.find((cell) => cell.key === 'madrugada');

    expect(madrugada).toEqual({ key: 'madrugada', n: 1, value: 6 });
    expect(madrugada?.n).toBeLessThan(5);
  });

  it('pessoas distintas na mesma faixa somam em n', async () => {
    const prisma = makePrisma();
    prisma.workoutSession.findMany.mockResolvedValue(
      [1, 2, 3].map((i) => ({
        userId: `aluno-${i}`,
        startedAt: new Date('2026-07-10T07:00:00Z'),
        planId: null,
      })),
    );

    const cells = await montar(prisma).sessionsByHourBand(
      [1, 2, 3].map((i) => participante(i)),
      INICIO,
    );

    // Sanidade do teste acima: sem isto, um `n` que sempre valesse 1 passaria.
    expect(cells.find((cell) => cell.key === 'madrugada')).toEqual({
      key: 'madrugada',
      n: 3,
      value: 3,
    });
  });

  it('dias ativos contam o par (pessoa, dia) uma vez', async () => {
    const prisma = makePrisma();
    prisma.workoutSession.findMany.mockResolvedValue([
      { userId: 'aluno-1', startedAt: new Date('2026-07-10T13:00:00Z'), planId: null },
      { userId: 'aluno-1', startedAt: new Date('2026-07-10T22:00:00Z'), planId: null },
      { userId: 'aluno-2', startedAt: new Date('2026-07-10T13:00:00Z'), planId: null },
    ]);

    const cells = await montar(prisma).activeDaysByMonth(
      [1, 2].map((i) => participante(i)),
      INICIO,
      AGORA,
    );

    // Duas sessões da mesma pessoa no mesmo dia são **um** dia ativo.
    expect(cells.find((cell) => cell.key === '2026-07')).toEqual({
      key: '2026-07',
      n: 2,
      value: 2,
    });
  });
});

describe('o balde é o do relógio de quem treinou', () => {
  it('23h em São Paulo cai na noite, e a mesma sessão em UTC cai na madrugada', async () => {
    const prisma = makePrisma();
    // 2026-07-10T02:30Z = 2026-07-09T23:30 em São Paulo.
    const sessao = { startedAt: new Date('2026-07-10T02:30:00Z'), planId: null };
    prisma.workoutSession.findMany.mockResolvedValue([
      { userId: 'aluno-1', ...sessao },
      { userId: 'aluno-2', ...sessao },
    ]);

    const cells = await montar(prisma).sessionsByHourBand(
      [participante(1, 'America/Sao_Paulo'), participante(2, 'UTC')],
      INICIO,
    );

    const porChave = new Map(cells.map((cell) => [cell.key, cell]));
    expect(porChave.get('noite')?.n).toBe(1);
    expect(porChave.get('madrugada')?.n).toBe(1);
  });

  it('a semana da sessão é a do fuso do participante, e o balde existe', async () => {
    const prisma = makePrisma();
    // 2026-07-13T02:00Z é segunda em UTC e ainda domingo 23h em São Paulo — duas
    // semanas diferentes. Com a lista de baldes vinda de um fuso só, a sessão de
    // um dos dois cairia num balde inexistente e sumiria em silêncio.
    const sessao = { startedAt: new Date('2026-07-13T02:00:00Z'), planId: null };
    prisma.workoutSession.findMany.mockResolvedValue([
      { userId: 'aluno-1', ...sessao },
      { userId: 'aluno-2', ...sessao },
    ]);

    const cells = await montar(prisma).sessionsByWeek(
      [participante(1, 'America/Sao_Paulo'), participante(2, 'UTC')],
      INICIO,
      AGORA,
    );

    // Nenhuma sessão descartada: as duas aparecem, em semanas diferentes.
    expect(cells.reduce((soma, cell) => soma + cell.value, 0)).toBe(2);
    expect(cells.filter((cell) => cell.value === 1)).toHaveLength(2);
  });
});

describe('a ordem do eixo é a do eixo, não a alfabética', () => {
  it('as faixas do dia saem em ordem de relógio', async () => {
    const cells = await montar(makePrisma()).sessionsByHourBand([participante(1)], INICIO);

    // Ordenadas por string seriam "madrugada, manhã, noite, tarde". A supressão
    // complementar escolhe o complemento pela **vizinhança no eixo**: com a
    // ordem alfabética, a faixa que cai junto com a madrugada seria a noite.
    expect(cells.map((cell) => cell.key)).toEqual(['madrugada', 'manhã', 'tarde', 'noite']);
  });

  it('a série semanal sai em ordem cronológica e sem buraco', async () => {
    const prisma = makePrisma();
    prisma.workoutSession.findMany.mockResolvedValue([
      { userId: 'aluno-1', startedAt: new Date('2026-07-08T13:00:00Z'), planId: null },
    ]);

    const cells = await montar(prisma).sessionsByWeek([participante(1)], INICIO, AGORA);
    const chaves = cells.map((cell) => cell.key);

    expect(chaves).toEqual([...chaves].sort());
    // Semana sem treino é zero, não lacuna: série com buraco convida o leitor a
    // preencher, e a célula ausente é informação sobre a célula ausente.
    expect(cells.length).toBeGreaterThan(3);
    expect(cells.filter((cell) => cell.value === 0).length).toBeGreaterThan(0);
  });
});

describe('members_by_recency honra a janela', () => {
  it('não olha treino de fora do período', async () => {
    const prisma = makePrisma();
    await montar(prisma).membersByRecency([participante(1)], INICIO, AGORA);

    // A versão anterior consultava o último treino **sem limite nenhum**, e
    // então `last_30_days` e `last_12_months` devolviam células idênticas com o
    // carimbo de períodos diferentes na resposta e na coluna `periodo` do CSV.
    expect(prisma.workoutSession.groupBy.mock.calls[0][0].where.startedAt).toEqual({ gte: INICIO });
  });

  it('as faixas que não cabem na janela não são publicadas como zero', () => {
    // "31+ dias: 0 pessoas" numa janela de 30 dias seria dizer que ninguém está
    // sumido há mais de um mês — quando essa gente está em "sem treino na
    // janela". Zero é uma afirmação sobre as pessoas, e essa seria falsa.
    expect(recencyBands(30)).toEqual(['0-7 dias', '8-14 dias', '15-30 dias', SEM_TREINO]);
    expect(recencyBands(90)).toEqual([
      '0-7 dias',
      '8-14 dias',
      '15-30 dias',
      '31+ dias',
      SEM_TREINO,
    ]);
  });

  it('quem não treinou na janela cai em "sem treino na janela"', async () => {
    const prisma = makePrisma();
    prisma.workoutSession.groupBy.mockResolvedValue([
      { userId: 'aluno-1', _max: { startedAt: new Date('2026-08-02T10:00:00Z') } },
    ]);

    const cells = await montar(prisma).membersByRecency(
      [1, 2, 3].map((i) => participante(i)),
      INICIO,
      AGORA,
    );
    const porChave = new Map(cells.map((cell) => [cell.key, cell]));

    expect(porChave.get('0-7 dias')?.n).toBe(1);
    expect(porChave.get(SEM_TREINO)?.n).toBe(2);
    // Métrica é contagem de pessoas: `value === n`, e por isso `suppress()` zera
    // os dois juntos — suprimir um sem o outro não esconderia nada.
    for (const cell of cells) expect(cell.value).toBe(cell.n);
  });
});

describe('nenhum id de pessoa sai do service', () => {
  it('as células são rótulo, contagem e valor — e nada mais', async () => {
    const prisma = makePrisma();
    prisma.workoutSession.findMany.mockResolvedValue([
      { userId: 'aluno-1', startedAt: new Date('2026-07-10T13:00:00Z'), planId: 'plano-a' },
    ]);

    const cells = await montar(prisma).sessionsByWeek([participante(1)], INICIO, AGORA);

    const serializado = JSON.stringify(cells);
    expect(serializado).not.toContain('aluno-');
    expect(serializado).not.toContain('plano-');
    expect(Object.keys(cells[0]).sort()).toEqual(['key', 'n', 'value']);
  });
});
