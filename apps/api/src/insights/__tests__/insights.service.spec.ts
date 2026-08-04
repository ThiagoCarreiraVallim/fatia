import { NotFoundException } from '@nestjs/common';
import { InsightsService } from '../insights.service';
import { EngagementService } from '../engagement.service';
import { RetentionService } from '../retention.service';
import { BehaviorService } from '../behavior.service';
import {
  NoStatsParticipation,
  type Participant,
  StatsParticipation,
} from '../stats-participation.port';
import type { PrismaService } from '../../common/prisma.service';

/**
 * A fachada — onde consentimento, amostra e supressão se encontram.
 *
 * Os casos aqui são os da promessa, não os do caminho feliz: quem **não**
 * consentiu não pode aparecer nem no denominador, grupo pequeno não recebe
 * número nenhum, e nada que saia daqui pode conter identificador de pessoa.
 */

const AGORA = new Date('2026-08-03T15:00:00Z');

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

const participante = (i: number): Participant => ({
  userId: `aluno-${i}`,
  timezone: 'America/Sao_Paulo',
  joinedAt: new Date('2026-01-15T12:00:00Z'),
});

class FakeParticipation extends StatsParticipation {
  constructor(private readonly lista: Participant[]) {
    super();
  }
  async participants(): Promise<Participant[]> {
    return this.lista;
  }
}

function montar(prisma: MockPrisma, lista: Participant[]): InsightsService {
  const engagement = new EngagementService(prisma as unknown as PrismaService);
  return new InsightsService(
    new FakeParticipation(lista),
    engagement,
    new RetentionService(engagement),
    new BehaviorService(prisma as unknown as PrismaService),
  );
}

describe('InsightsService — consentimento', () => {
  it('só consulta os userIds de quem deu opt-in — nem o denominador tem os outros', async () => {
    const prisma = makePrisma();
    const consentidos = [1, 2, 3, 4, 5, 6].map(participante);
    // Estes dois são membros do grupo e **recusaram**. Eles existem na fixture:
    // a asserção anterior procurava `aluno-99`, que não existia em lugar nenhum
    // do teste, e portanto não podia falhar nunca.
    const recusaram = [7, 8].map(participante);
    const service = montar(prisma, consentidos);

    await service.aggregate('grupo-1', 'retention', 'sessions_by_hour_band', 'last_30_days', AGORA);

    const where = prisma.workoutSession.findMany.mock.calls[0][0].where;
    expect(where.userId.in).toEqual(consentidos.map((p) => p.userId));

    const consultado = JSON.stringify(prisma.workoutSession.findMany.mock.calls);
    for (const quemRecusou of recusaram) {
      expect([quemRecusou.userId, consultado.includes(quemRecusou.userId)]).toEqual([
        quemRecusou.userId,
        false,
      ]);
    }
  });

  it('quem recusou não entra nem no denominador do recorte', async () => {
    // O caso que a asserção vazia deixava sem cobertura de verdade: não basta o
    // id não aparecer na consulta, a **contagem** não pode contá-lo. Numerador
    // consentido sobre denominador cheio informa sobre quem recusou — quantos
    // são e como se comportam, por diferença.
    const prisma = makePrisma();
    const consentidos = [1, 2, 3, 4, 5, 6].map(participante);
    prisma.workoutSession.groupBy.mockResolvedValue(
      // O banco devolve gente demais de propósito: dois que recusaram vêm junto.
      [...consentidos, ...[7, 8].map(participante)].map((p) => ({
        userId: p.userId,
        _max: { startedAt: new Date('2026-08-02T10:00:00Z') },
        _count: { _all: 4 },
      })),
    );

    const resposta = await montar(prisma, consentidos).aggregate(
      'grupo-1',
      'retention',
      'members_by_recency',
      'last_30_days',
      AGORA,
    );

    // `members_by_recency` conta pessoas: a soma dos `n` é o denominador inteiro.
    const denominador = resposta.cells.reduce((soma, cell) => soma + (cell.n ?? 0), 0);
    expect(denominador).toBe(consentidos.length);
  });

  it('grupo com menos participantes que o limiar não chega a consultar o banco', async () => {
    const prisma = makePrisma();
    const service = montar(prisma, [1, 2, 3, 4].map(participante));

    const resposta = await service.aggregate(
      'grupo-1',
      'retention',
      'members_by_recency',
      'last_30_days',
      AGORA,
    );

    expect(resposta.insufficientSample).toBe(true);
    expect(resposta.cells).toEqual([]);
    // Números que seriam jogados fora ainda assim passeariam por log, trace e
    // métrica no caminho. Não perguntar é mais barato e mais seguro.
    expect(prisma.workoutSession.findMany).not.toHaveBeenCalled();
    expect(prisma.workoutSession.groupBy).not.toHaveBeenCalled();
  });

  it('a implementação de hoje (sem a coluna statsOptIn) não conta ninguém', async () => {
    const prisma = makePrisma();
    const engagement = new EngagementService(prisma as unknown as PrismaService);
    const service = new InsightsService(
      new NoStatsParticipation(),
      engagement,
      new RetentionService(engagement),
      new BehaviorService(prisma as unknown as PrismaService),
    );

    const resposta = await service.aggregate(
      'grupo-1',
      'retention',
      'sessions_by_week',
      'last_30_days',
      AGORA,
    );

    // Sem coluna de opt-in não há como saber quem consentiu, e a única resposta
    // defensável para "não sei quem consentiu" é ninguém.
    expect(resposta.insufficientSample).toBe(true);
    expect(prisma.workoutSession.findMany).not.toHaveBeenCalled();
  });
});

describe('InsightsService — o que a resposta não pode conter', () => {
  it('nenhum identificador de pessoa sai na resposta', async () => {
    const prisma = makePrisma();
    const participantes = [1, 2, 3, 4, 5, 6, 7, 8].map(participante);
    prisma.workoutSession.groupBy.mockResolvedValue(
      participantes.map((p) => ({
        userId: p.userId,
        _max: { startedAt: new Date('2026-08-01T10:00:00Z') },
        _count: { _all: 6 },
      })),
    );

    const resposta = await montar(prisma, participantes).aggregate(
      'grupo-1',
      'retention',
      'members_by_recency',
      'last_30_days',
      AGORA,
    );

    const serializada = JSON.stringify(resposta);
    expect(serializada).not.toContain('aluno-');
    expect(serializada).not.toContain('userId');
    expect(serializada).not.toContain('membershipId');
    // As chaves são exatamente as da política — nada de campo extra que um dia
    // carregue um id "só para depurar".
    expect(Object.keys(resposta).sort()).toEqual(['cells', 'cut', 'insufficientSample', 'period']);
    expect(Object.keys(resposta.cells[0]).sort()).toEqual(['key', 'n', 'suppressed', 'value']);
  });

  it('a faixa de risco com pouca gente é suprimida como qualquer célula', async () => {
    const prisma = makePrisma();
    const participantes = Array.from({ length: 12 }, (_, i) => participante(i));

    // 10 treinaram ontem (risco baixo), 2 sumiram há dois meses (risco alto).
    const recente = new Date('2026-08-02T10:00:00Z');
    const antigo = new Date('2026-06-01T10:00:00Z');
    prisma.workoutSession.groupBy.mockImplementation((args: { _max?: unknown }) => {
      const linhas = participantes.map((p, i) => ({
        userId: p.userId,
        _max: { startedAt: i < 10 ? recente : antigo },
        _count: { _all: i < 10 ? 8 : 0 },
      }));
      return Promise.resolve(args._max ? linhas : linhas.filter((_, i) => i < 10));
    });

    const resposta = await montar(prisma, participantes).aggregate(
      'grupo-1',
      'retention',
      'members_by_churn_risk',
      'last_30_days',
      AGORA,
    );

    const porChave = new Map(resposta.cells.map((cell) => [cell.key, cell]));
    // "2 alunos em risco alto" numa academia pequena é um nome que o dono
    // adivinha. E a supressão complementar leva junto a faixa vizinha.
    expect(porChave.get('alto')?.suppressed).toBe(true);
    expect(resposta.cells.filter((cell) => cell.suppressed).length).toBeGreaterThanOrEqual(2);
  });
});

describe('InsightsService — recorte e painel', () => {
  it('recusa recorte do painel pago pedido pelo painel gratuito', async () => {
    const service = montar(makePrisma(), [1, 2, 3, 4, 5, 6].map(participante));

    await expect(
      service.aggregate('grupo-1', 'retention', 'modality_mix', 'last_30_days', AGORA),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('recusa antes de olhar o consentimento — a rota não confirma que o recorte existe', async () => {
    const prisma = makePrisma();
    const participation = new FakeParticipation([1, 2, 3, 4, 5, 6].map(participante));
    const espiao = jest.spyOn(participation, 'participants');
    const engagement = new EngagementService(prisma as unknown as PrismaService);
    const service = new InsightsService(
      participation,
      engagement,
      new RetentionService(engagement),
      new BehaviorService(prisma as unknown as PrismaService),
    );

    await expect(
      service.aggregate('grupo-1', 'retention', 'retention_by_cohort', 'last_30_days', AGORA),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(espiao).not.toHaveBeenCalled();
  });

  it('aceita no painel pago o recorte que os dois painéis compartilham', async () => {
    const prisma = makePrisma();
    const service = montar(prisma, [1, 2, 3, 4, 5, 6].map(participante));

    await expect(
      service.aggregate('grupo-1', 'behavior', 'sessions_by_hour_band', 'last_30_days', AGORA),
    ).resolves.toMatchObject({ cut: 'sessions_by_hour_band' });
  });
});
