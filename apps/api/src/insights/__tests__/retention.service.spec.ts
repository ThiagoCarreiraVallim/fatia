import { RetentionService, riskBand } from '../retention.service';
import { EngagementService } from '../engagement.service';
import { hourBandInTz, monthInTz } from '../helpers/time-buckets';
import type { Participant } from '../stats-participation.port';
import type { PrismaService } from '../../common/prisma.service';

const AGORA = new Date('2026-08-03T15:00:00Z');

describe('riskBand — o sinal é engajamento, e só', () => {
  it('classifica ausência longa como risco alto', () => {
    expect(riskBand({ diasSemTreinar: 40, recentes: 0, anteriores: 12 })).toBe('alto');
  });

  it('pega a queda de frequência antes da ausência virar longa', () => {
    // Quem treinava 3x por semana e passou a treinar 1x ainda "veio esta
    // semana": o critério de ausência sozinho o chamaria de tranquilo, e é
    // justamente ele que ainda dá para reter.
    expect(riskBand({ diasSemTreinar: 12, recentes: 2, anteriores: 12 })).toBe('alto');
    expect(riskBand({ diasSemTreinar: 3, recentes: 2, anteriores: 12 })).toBe('médio');
  });

  it('não chama de queda quem acabou de chegar', () => {
    // Sem base anterior, frequência baixa é começo, não fuga. Sem esta trava o
    // painel marcaria como "em risco" todo aluno novo do mês.
    expect(riskBand({ diasSemTreinar: 2, recentes: 1, anteriores: 1 })).toBe('baixo');
    expect(riskBand({ diasSemTreinar: 2, recentes: 0, anteriores: 0 })).toBe('baixo');
  });

  it('quem nunca treinou não escapa por não ter data', () => {
    expect(riskBand({ diasSemTreinar: Infinity, recentes: 0, anteriores: 0 })).toBe('alto');
  });

  it('os cortes acompanham a janela — "sumido" em 30 dias não é "sumido" em um ano', () => {
    // A versão anterior tinha 21, 10 e 7 dias escritos à mão e 28 dias de janela
    // de comparação, para **qualquer** período pedido. `last_30_days` e
    // `last_12_months` devolviam a mesma célula com carimbos diferentes.
    //
    // 40 dias sem treinar é ausência longa numa janela de 30 dias e é
    // comportamento normal numa de um ano.
    expect(riskBand({ diasSemTreinar: 40, recentes: 0, anteriores: 12, janelaDias: 30 })).toBe(
      'alto',
    );
    expect(riskBand({ diasSemTreinar: 40, recentes: 0, anteriores: 12, janelaDias: 365 })).toBe(
      'baixo',
    );
  });

  it('a janela de 30 dias reproduz exatamente os números antigos', () => {
    // A generalização não podia mudar o sinal — só admitir as outras janelas.
    // 21 (ausência longa), 10 (ausência com queda) e 7 (ausência média).
    expect(riskBand({ diasSemTreinar: 22, recentes: 0, anteriores: 0 })).toBe('alto');
    expect(riskBand({ diasSemTreinar: 21, recentes: 0, anteriores: 0 })).toBe('médio');
    expect(riskBand({ diasSemTreinar: 11, recentes: 1, anteriores: 12 })).toBe('alto');
    expect(riskBand({ diasSemTreinar: 10, recentes: 1, anteriores: 12 })).toBe('médio');
    expect(riskBand({ diasSemTreinar: 8, recentes: 0, anteriores: 0 })).toBe('médio');
    expect(riskBand({ diasSemTreinar: 7, recentes: 0, anteriores: 0 })).toBe('baixo');
    // Base mínima de 4 sessões na metade anterior.
    expect(riskBand({ diasSemTreinar: 1, recentes: 1, anteriores: 4 })).toBe('médio');
    expect(riskBand({ diasSemTreinar: 1, recentes: 1, anteriores: 3 })).toBe('baixo');
  });
});

describe('RetentionService.membersByChurnRisk', () => {
  const participantes: Participant[] = Array.from({ length: 20 }, (_, i) => ({
    userId: `aluno-${i}`,
    timezone: 'America/Sao_Paulo',
    joinedAt: new Date('2026-02-10T12:00:00Z'),
  }));

  it('devolve contagem por faixa — nunca uma linha por pessoa', async () => {
    const prisma = {
      workoutSession: {
        groupBy: jest.fn().mockImplementation((args: { _max?: unknown }) =>
          Promise.resolve(
            participantes.map((p, i) => ({
              userId: p.userId,
              _max: { startedAt: new Date(AGORA.getTime() - (i < 15 ? 2 : 45) * 86_400_000) },
              _count: { _all: args._max ? 0 : 6 },
            })),
          ),
        ),
      },
    };

    const engagement = new EngagementService(prisma as unknown as PrismaService);
    const cells = await new RetentionService(engagement).membersByChurnRisk(
      participantes,
      30,
      AGORA,
    );

    expect(cells).toEqual([
      { key: 'baixo', n: 15, value: 15 },
      { key: 'médio', n: 0, value: 0 },
      { key: 'alto', n: 5, value: 5 },
    ]);

    // O que o dono recebe é "5 em risco alto". A lista de quem são os cinco não
    // existe nesta estrutura — não é escondida, não é omitida: não existe.
    expect(JSON.stringify(cells)).not.toContain('aluno-');
  });
});

describe('baldes de tempo — fuso de quem treinou, não do servidor', () => {
  it('23h em São Paulo é noite, e não madrugada do dia seguinte', () => {
    // 2026-08-03T23:30 em São Paulo = 2026-08-04T02:30Z. Agrupar em UTC moveria
    // a sessão de dia, de semana e de faixa — e produziria "pico da academia às
    // 2 da manhã" com todo teste verde, desde que o teste também usasse UTC.
    const sessao = new Date('2026-08-04T02:30:00Z');

    expect(hourBandInTz(sessao, 'America/Sao_Paulo')).toBe('noite');
    expect(hourBandInTz(sessao, 'UTC')).toBe('madrugada');
  });

  it('vira o mês no fuso certo', () => {
    // 2026-07-31T22:00 em São Paulo já é 1º de agosto em UTC.
    const virada = new Date('2026-08-01T01:00:00Z');

    expect(monthInTz(virada, 'America/Sao_Paulo')).toBe('2026-07');
    expect(monthInTz(virada, 'UTC')).toBe('2026-08');
  });

  it('meia-noite local cai em madrugada', () => {
    expect(hourBandInTz(new Date('2026-08-03T03:00:00Z'), 'America/Sao_Paulo')).toBe('madrugada');
  });
});
