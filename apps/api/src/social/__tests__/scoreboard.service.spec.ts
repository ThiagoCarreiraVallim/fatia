import { CHALLENGE_METRICS, type ChallengeMetric } from '../challenge-metric';
import {
  ScoreboardService,
  buildScoreboard,
  type ChallengeParticipant,
  type ChallengeWindow,
} from '../scoreboard.service';
import type { PrismaService } from '../../common/prisma.service';

/**
 * Este spec **não** mocka `date-tz`: usa os fusos de verdade. Sob mock, o dia
 * local e o dia UTC coincidem, e o código certo fica indistinguível do que
 * agrupa pelo instante bruto — que é exatamente o bug que um placar de passos
 * esconde bem (a pontuação fica *quase* certa).
 *
 * O Prisma aqui é um **fake que filtra de verdade**, não um mock que devolve
 * lista pronta. Com lista pronta, asserção de fronteira de janela é vacuosa: o
 * `gte/lt` poderia ser `gte/lte` — ou não existir — e o teste passaria igual.
 */

const SP = 'America/Sao_Paulo'; // UTC-3
const KIRITIMATI = 'Pacific/Kiritimati'; // UTC+14

/** Segunda 00h e segunda 00h em São Paulo, sete dias depois. */
const JANELA = {
  startsAt: new Date('2026-03-02T03:00:00.000Z'),
  endsAt: new Date('2026-03-09T03:00:00.000Z'),
};

const ANA: ChallengeParticipant = { membershipId: 'm-ana', userId: 'u-ana', timezone: SP };
const BRUNO: ChallengeParticipant = { membershipId: 'm-bruno', userId: 'u-bruno', timezone: SP };
const QUIRINO: ChallengeParticipant = {
  membershipId: 'm-quirino',
  userId: 'u-quirino',
  timezone: KIRITIMATI,
};

interface FakeDb {
  workoutSession: Array<{ userId: string; completedAt: Date | null }>;
  stepLog: Array<{ userId: string; date: string; steps: number }>;
  waterLog: Array<{ userId: string; date: string; ml: number }>;
}

/**
 * O fake entende os quatro operadores de faixa do Prisma, e não só os que o
 * service usa hoje. Um fake que só lê `lt` transformaria a troca de `lt` por
 * `lte` em "nada é encontrado" — o teste ficaria vermelho pelo motivo errado, e
 * quem lesse a falha concluiria que a consulta quebrou, não que a fronteira
 * mudou de significado.
 */
interface Faixa<T> {
  gte?: T;
  gt?: T;
  lt?: T;
  lte?: T;
}

function dentro<T extends Date | string>(valor: T, faixa: Faixa<T>): boolean {
  if (faixa.gte !== undefined && valor < faixa.gte) return false;
  if (faixa.gt !== undefined && valor <= faixa.gt) return false;
  if (faixa.lte !== undefined && valor > faixa.lte) return false;
  if (faixa.lt !== undefined && valor >= faixa.lt) return false;
  return true;
}

type WhereDia = { userId: { in: string[] }; date: Faixa<string> };
type WhereInstante = { userId: { in: string[] }; completedAt: Faixa<Date> };

function build(db: Partial<FakeDb>) {
  const dados: FakeDb = {
    workoutSession: db.workoutSession ?? [],
    stepLog: db.stepLog ?? [],
    waterLog: db.waterLog ?? [],
  };

  const prisma = {
    workoutSession: {
      findMany: jest.fn(({ where }: { where: WhereInstante }) =>
        Promise.resolve(
          dados.workoutSession.filter(
            (s) =>
              where.userId.in.includes(s.userId) &&
              s.completedAt !== null &&
              dentro(s.completedAt, where.completedAt),
          ),
        ),
      ),
    },
    stepLog: {
      findMany: jest.fn(({ where }: { where: WhereDia }) =>
        Promise.resolve(
          dados.stepLog.filter(
            (l) => where.userId.in.includes(l.userId) && dentro(l.date, where.date),
          ),
        ),
      ),
    },
    waterLog: {
      findMany: jest.fn(({ where }: { where: WhereDia }) =>
        Promise.resolve(
          dados.waterLog.filter(
            (l) => where.userId.in.includes(l.userId) && dentro(l.date, where.date),
          ),
        ),
      ),
    },
  };

  return { dados, prisma, service: new ScoreboardService(prisma as unknown as PrismaService) };
}

const desafio = (metric: ChallengeMetric): ChallengeWindow => ({ metric, ...JANELA });

/** Pontuação por `membershipId`, para asserções curtas. */
const porMembro = (linhas: Array<{ membershipId: string; score: number }>) =>
  Object.fromEntries(linhas.map((l) => [l.membershipId, l.score]));

describe('ScoreboardService.recompute', () => {
  it('conta só o que caiu dentro da janela — o instante do fim fica de fora', async () => {
    const { service } = build({
      workoutSession: [
        { userId: 'u-ana', completedAt: JANELA.startsAt },
        { userId: 'u-ana', completedAt: new Date(JANELA.endsAt.getTime() - 1) },
        // O instante exato do fim pertence ao desafio seguinte, não a este: com
        // `lte`, uma sessão na virada contaria nos dois.
        { userId: 'u-ana', completedAt: JANELA.endsAt },
        { userId: 'u-ana', completedAt: new Date(JANELA.startsAt.getTime() - 1) },
        // Sessão aberta não é sessão feita.
        { userId: 'u-ana', completedAt: null },
      ],
    });

    const placar = await service.recompute(desafio('WORKOUT_SESSIONS'), [ANA]);

    expect(porMembro(placar)).toEqual({ 'm-ana': 2 });
  });

  it('o dia de passos vale o MAIOR log, não a soma (ADR 007)', async () => {
    const { service } = build({
      stepLog: [
        // Relógio e celular sincronizando o mesmo dia. Somar dobraria a
        // pontuação de quem tem duas integrações — não de quem andou mais.
        { userId: 'u-ana', date: '2026-03-03', steps: 8000 },
        { userId: 'u-ana', date: '2026-03-03', steps: 9500 },
        { userId: 'u-ana', date: '2026-03-04', steps: 5000 },
      ],
    });

    const placar = await service.recompute(desafio('STEPS'), [ANA]);

    expect(porMembro(placar)).toEqual({ 'm-ana': 14_500 });
  });

  it('a janela de dias é a de cada participante, não a de quem abriu o desafio', async () => {
    // Em Kiritimati (UTC+14) a janela ainda cobre 09/03; em São Paulo, não.
    // Uma janela única para todos daria a Ana um dia que o desafio dela não tem
    // — ou tiraria de Quirino um dia que ele viveu dentro do desafio.
    const { service } = build({
      stepLog: [
        { userId: 'u-ana', date: '2026-03-02', steps: 1000 },
        { userId: 'u-ana', date: '2026-03-09', steps: 10_000 },
        { userId: 'u-quirino', date: '2026-03-02', steps: 1000 },
        { userId: 'u-quirino', date: '2026-03-09', steps: 10_000 },
      ],
    });

    const placar = await service.recompute(desafio('STEPS'), [ANA, QUIRINO]);

    expect(porMembro(placar)).toEqual({ 'm-ana': 1000, 'm-quirino': 11_000 });
  });

  it('dia ativo é o dia local, e o mesmo dia não conta duas vezes', async () => {
    const { service } = build({
      // 23h30 de 02/03 em São Paulo = 02h30 de 03/03 em UTC. Agrupar pelo
      // instante bruto inventaria um terceiro dia ativo.
      workoutSession: [{ userId: 'u-ana', completedAt: new Date('2026-03-03T02:30:00.000Z') }],
      stepLog: [{ userId: 'u-ana', date: '2026-03-02', steps: 7000 }],
      waterLog: [{ userId: 'u-ana', date: '2026-03-05', ml: 500 }],
    });

    const placar = await service.recompute(desafio('ACTIVE_DAYS'), [ANA]);

    expect(porMembro(placar)).toEqual({ 'm-ana': 2 });
  });

  it('água soma os copos do dia', async () => {
    const { service } = build({
      waterLog: [
        { userId: 'u-ana', date: '2026-03-03', ml: 250 },
        { userId: 'u-ana', date: '2026-03-03', ml: 250 },
        { userId: 'u-ana', date: '2026-03-04', ml: 500 },
        // Fora da janela local de São Paulo.
        { userId: 'u-ana', date: '2026-03-09', ml: 9000 },
      ],
    });

    const placar = await service.recompute(desafio('WATER_ML'), [ANA]);

    expect(porMembro(placar)).toEqual({ 'm-ana': 1000 });
  });

  it('quem não entrou no desafio não é pontuado nem consultado, por mais ativo que seja', async () => {
    const { prisma, service } = build({
      workoutSession: [
        { userId: 'u-ana', completedAt: new Date('2026-03-03T12:00:00.000Z') },
        // Bruno é do grupo e treina todo dia. Não entrou no desafio: entrar é o
        // consentimento, e ele não deu.
        ...Array.from({ length: 20 }, () => ({
          userId: 'u-bruno',
          completedAt: new Date('2026-03-04T12:00:00.000Z'),
        })),
      ],
    });

    const placar = await service.recompute(desafio('WORKOUT_SESSIONS'), [ANA]);

    expect(porMembro(placar)).toEqual({ 'm-ana': 1 });
    // Não basta sumir do resultado: o registro dele não pode nem ser lido.
    const where = prisma.workoutSession.findMany.mock.calls[0][0].where;
    expect(where.userId.in).toEqual(['u-ana']);
  });

  it('registro apagado depois de pontuar some do próximo recálculo', async () => {
    const { dados, service } = build({
      workoutSession: [
        { userId: 'u-ana', completedAt: new Date('2026-03-03T12:00:00.000Z') },
        { userId: 'u-ana', completedAt: new Date('2026-03-04T12:00:00.000Z') },
      ],
    });

    expect(porMembro(await service.recompute(desafio('WORKOUT_SESSIONS'), [ANA]))).toEqual({
      'm-ana': 2,
    });

    // O dono apaga o próprio treino. Pontuação derivada não guarda crédito
    // fantasma: quem materializasse o incremento na escrita ficaria com 2.
    dados.workoutSession.pop();

    expect(porMembro(await service.recompute(desafio('WORKOUT_SESSIONS'), [ANA]))).toEqual({
      'm-ana': 1,
    });
  });

  it('participante sem nenhum registro pontua zero, e não some do placar', async () => {
    const { service } = build({});

    const placar = await service.recompute(desafio('STEPS'), [ANA, BRUNO]);

    expect(porMembro(placar)).toEqual({ 'm-ana': 0, 'm-bruno': 0 });
  });

  it('devolve só membershipId e pontuação — nenhum registro atravessa a fronteira', async () => {
    const { service } = build({
      stepLog: [{ userId: 'u-ana', date: '2026-03-03', steps: 9000 }],
    });

    const placar = await service.recompute(desafio('STEPS'), [ANA]);

    expect(Object.keys(placar[0]).sort()).toEqual(['membershipId', 'score']);
  });

  it('sem participante, não vai ao banco', async () => {
    const { prisma, service } = build({
      stepLog: [{ userId: 'u-ana', date: '2026-03-03', steps: 9000 }],
    });

    expect(await service.recompute(desafio('STEPS'), [])).toEqual([]);
    expect(prisma.stepLog.findMany).not.toHaveBeenCalled();
  });

  it.each(CHALLENGE_METRICS)('a métrica %s tem cálculo próprio', async (metric) => {
    const { service } = build({
      workoutSession: [{ userId: 'u-ana', completedAt: new Date('2026-03-03T12:00:00.000Z') }],
      stepLog: [{ userId: 'u-ana', date: '2026-03-03', steps: 9000 }],
      waterLog: [{ userId: 'u-ana', date: '2026-03-03', ml: 2000 }],
    });

    // Métrica sem ramo pontuaria zero para todo mundo, e um placar todo
    // empatado em zero parece "ninguém participou", não "está quebrado".
    const placar = await service.recompute(desafio(metric), [ANA]);

    expect(placar[0].score).toBeGreaterThan(0);
  });
});

describe('buildScoreboard', () => {
  it('empate divide a mesma posição, e a seguinte pula', () => {
    const placar = buildScoreboard([
      { displayName: 'Bruno', score: 10 },
      { displayName: 'Ana', score: 30 },
      { displayName: 'Carla', score: 10 },
    ]);

    expect(placar).toEqual([
      { displayName: 'Ana', score: 30, rank: 1 },
      { displayName: 'Bruno', score: 10, rank: 2 },
      { displayName: 'Carla', score: 10, rank: 2 },
    ]);
  });

  it('a linha que vai para a tela tem exatamente três chaves', () => {
    const placar = buildScoreboard([{ displayName: 'Ana', score: 30 }]);

    // Não é preciosismo de DTO: é a fronteira em que um `include` distraído
    // transformaria um placar de atividade num vazamento de registro.
    expect(Object.keys(placar[0]).sort()).toEqual(['displayName', 'rank', 'score']);
  });
});
