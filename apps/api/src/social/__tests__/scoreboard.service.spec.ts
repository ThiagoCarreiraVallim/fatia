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

/**
 * Segunda 00h e segunda 00h em São Paulo, sete dias depois — os dias de
 * calendário 02/03 a 08/03. O desafio tem fuso próprio: é o calendário em que
 * ele foi anunciado, e vale igual para Ana e para Quirino.
 */
const JANELA = {
  startsAt: new Date('2026-03-02T03:00:00.000Z'),
  endsAt: new Date('2026-03-09T03:00:00.000Z'),
  timezone: SP,
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

  it('os mesmos passos nos mesmos dias pontuam igual em qualquer fuso', async () => {
    // Ana (UTC-3) e Quirino (UTC+14) registram EXATAMENTE os mesmos passos nos
    // mesmos dias de calendário. Placar é ranking: fuso não é desempenho, e a
    // única resposta comparável é o empate.
    //
    // Com a janela derivada do fuso de cada participante, Quirino ficava com
    // 02/03 a 09/03 (OITO dias) contra os sete de Ana, levava 09/03 sozinho e
    // ainda pontuava com o 02/03 dele, que começou às 10h UTC de 01/03 — 17
    // horas antes de o desafio existir. Ana não tinha como fazer nem um nem outro.
    const dias = ['2026-03-01', '2026-03-02', '2026-03-05', '2026-03-08', '2026-03-09'];
    const { service } = build({
      stepLog: dias.flatMap((date) => [
        { userId: 'u-ana', date, steps: 1000 },
        { userId: 'u-quirino', date, steps: 1000 },
      ]),
    });

    const placar = await service.recompute(desafio('STEPS'), [ANA, QUIRINO]);

    // Só 02, 05 e 08 estão no desafio — para os dois.
    expect(porMembro(placar)).toEqual({ 'm-ana': 3000, 'm-quirino': 3000 });
  });

  it('a água usa a mesma janela do desafio, e não a do fuso de cada um', async () => {
    // O gêmeo do teste acima para `WATER_ML`: sem ele, a janela por participante
    // podia voltar só nesta métrica e nenhum teste acusaria.
    const { service } = build({
      waterLog: [
        { userId: 'u-ana', date: '2026-03-03', ml: 500 },
        { userId: 'u-quirino', date: '2026-03-03', ml: 500 },
        // 09/03 está fora do desafio. Era o dia que Quirino ganhava de graça.
        { userId: 'u-ana', date: '2026-03-09', ml: 9000 },
        { userId: 'u-quirino', date: '2026-03-09', ml: 9000 },
      ],
    });

    const placar = await service.recompute(desafio('WATER_ML'), [ANA, QUIRINO]);

    expect(porMembro(placar)).toEqual({ 'm-ana': 500, 'm-quirino': 500 });
  });

  it('a consulta pede exatamente os dias do desafio, nem um a mais', async () => {
    // A janela agora é o próprio `where`: não há segundo recorte em memória para
    // consertar uma consulta larga demais. Se este `where` abrir, o placar conta
    // dia que o desafio não cobre — e é esta asserção que segura isso.
    const { prisma, service } = build({});

    await service.recompute(desafio('STEPS'), [ANA, QUIRINO]);

    expect(prisma.stepLog.findMany.mock.calls[0][0].where.date).toEqual({
      gte: '2026-03-02',
      lte: '2026-03-08',
    });
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

  it('o dia do treino é o do participante, mesmo com a janela sendo a do desafio', async () => {
    // O mesmo instante cai em dias diferentes para os dois: 03/03 02h30 UTC é
    // 02/03 23h30 em São Paulo e 03/03 16h30 em Kiritimati.
    //
    // Os dois têm passos em 02/03. Para Ana, treino e passos são o MESMO dia:
    // um dia ativo. Para Quirino são dois. Datar a sessão pelo fuso do desafio
    // colapsaria Quirino em um também — e o conjunto de dias dele passaria a
    // misturar dois calendários, contando a mesma atividade duas vezes quando
    // não colapsasse.
    const { service } = build({
      workoutSession: [
        { userId: 'u-ana', completedAt: new Date('2026-03-03T02:30:00.000Z') },
        { userId: 'u-quirino', completedAt: new Date('2026-03-03T02:30:00.000Z') },
      ],
      stepLog: [
        { userId: 'u-ana', date: '2026-03-02', steps: 7000 },
        { userId: 'u-quirino', date: '2026-03-02', steps: 7000 },
      ],
    });

    const placar = await service.recompute(desafio('ACTIVE_DAYS'), [ANA, QUIRINO]);

    expect(porMembro(placar)).toEqual({ 'm-ana': 1, 'm-quirino': 2 });
  });

  it('treino cujo dia local cai fora do desafio não vira dia ativo', async () => {
    // 08/03 23h UTC ainda está dentro da janela de instantes, mas em Kiritimati
    // já é 09/03 — dia que o desafio não cobre para ninguém. Sem o recorte, quem
    // está a leste ganharia um oitavo dia que Ana não tem como ter.
    const { service } = build({
      workoutSession: [
        { userId: 'u-ana', completedAt: new Date('2026-03-08T23:00:00.000Z') },
        { userId: 'u-quirino', completedAt: new Date('2026-03-08T23:00:00.000Z') },
      ],
    });

    const placar = await service.recompute(desafio('ACTIVE_DAYS'), [ANA, QUIRINO]);

    expect(porMembro(placar)).toEqual({ 'm-ana': 1, 'm-quirino': 0 });
  });

  it('treino na madrugada do primeiro dia salva o dia também para quem está a leste', async () => {
    // A outra ponta do teste acima, e a que sobrou depois de a janela de dias
    // virar única. Os dois treinam às 2h da manhã de 02/03 — mesma hora, mesmo
    // dia de calendário do desafio. Em São Paulo isso é 02/03 05h UTC; em
    // Kiritimati, 01/03 12h UTC, quinze horas ANTES de `startsAt`.
    //
    // Enquanto a consulta de sessões usava `{ gte: startsAt, lt: endsAt }`, o
    // treino de Quirino nem era lido: ele perdia um dia ativo que Ana ganhava
    // pela mesma atividade. Recortar por dia local só resolve se a consulta
    // trouxer o dia local inteiro — daí `instantesDosDias`.
    const { service } = build({
      workoutSession: [
        { userId: 'u-ana', completedAt: new Date('2026-03-02T05:00:00.000Z') },
        { userId: 'u-quirino', completedAt: new Date('2026-03-01T12:00:00.000Z') },
      ],
    });

    const placar = await service.recompute(desafio('ACTIVE_DAYS'), [ANA, QUIRINO]);

    expect(porMembro(placar)).toEqual({ 'm-ana': 1, 'm-quirino': 1 });
  });

  it('a faixa de instantes de ACTIVE_DAYS cobre o dia local de leste a oeste', async () => {
    // A faixa é larga de propósito, mas não pode ser larga a esmo: se ela virar
    // "a tabela inteira", a consulta lê registro de dia que o desafio não cobre
    // — e o recorte em memória vira a única defesa contra um `select` distraído.
    const { prisma, service } = build({});

    await service.recompute(desafio('ACTIVE_DAYS'), [ANA, QUIRINO]);

    // Meia-noite de 02/03 em Kiritimati (o mais a leste) até a virada de 08/03
    // em São Paulo (o mais a oeste).
    expect(prisma.workoutSession.findMany.mock.calls[0][0].where.completedAt).toEqual({
      gte: new Date('2026-03-01T10:00:00.000Z'),
      lt: new Date('2026-03-09T03:00:00.000Z'),
    });
  });

  it('registro de valor zero não salva o dia', async () => {
    // `steps: 0` é sync parcial que reportou zero, e o schema permite. Sem as
    // guardas, um dia em que a pessoa não andou nem bebeu nada entraria como
    // ativo só por existir uma linha na tabela.
    const { service } = build({
      stepLog: [
        { userId: 'u-ana', date: '2026-03-03', steps: 0 },
        { userId: 'u-ana', date: '2026-03-04', steps: 6000 },
      ],
      waterLog: [{ userId: 'u-ana', date: '2026-03-05', ml: 0 }],
    });

    const placar = await service.recompute(desafio('ACTIVE_DAYS'), [ANA]);

    expect(porMembro(placar)).toEqual({ 'm-ana': 1 });
  });

  it('água soma os copos do dia', async () => {
    const { service } = build({
      waterLog: [
        { userId: 'u-ana', date: '2026-03-03', ml: 250 },
        { userId: 'u-ana', date: '2026-03-03', ml: 250 },
        { userId: 'u-ana', date: '2026-03-04', ml: 500 },
        // Fora dos dias do desafio.
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
      // Sem esta quarta linha o fixture acabava no empate: "a seguinte" nunca
      // existia, e o ranking denso (que daria 3 aqui, não 4) passava verde
      // apesar do nome do teste.
      { displayName: 'Dedé', score: 5 },
    ]);

    expect(placar).toEqual([
      { displayName: 'Ana', score: 30, rank: 1 },
      { displayName: 'Bruno', score: 10, rank: 2 },
      { displayName: 'Carla', score: 10, rank: 2 },
      { displayName: 'Dedé', score: 5, rank: 4 },
    ]);
  });

  it('empate ordena por nome, e não pela ordem em que os participantes entraram', () => {
    // A entrada já vem na ordem contrária à esperada de propósito: com a
    // ordenação estável do JS, um desempate ausente devolveria 'Zoe' primeiro e
    // a posição dos empatados oscilaria entre duas leituras iguais do placar.
    const placar = buildScoreboard([
      { displayName: 'Zoe', score: 10 },
      { displayName: 'Ana', score: 10 },
    ]);

    expect(placar.map((l) => l.displayName)).toEqual(['Ana', 'Zoe']);
  });

  it('a linha que vai para a tela tem exatamente três chaves', () => {
    const placar = buildScoreboard([{ displayName: 'Ana', score: 30 }]);

    // Não é preciosismo de DTO: é a fronteira em que um `include` distraído
    // transformaria um placar de atividade num vazamento de registro.
    expect(Object.keys(placar[0]).sort()).toEqual(['displayName', 'rank', 'score']);
  });
});
