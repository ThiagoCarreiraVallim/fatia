import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { dateInTz, weekStartInTz } from '../progress/helpers/date-tz';
import { HOUR_BANDS, daysBetween, hourBandInTz, monthInTz } from './helpers/time-buckets';
import type { Cell } from './aggregation.service';
import type { Participant } from './stats-participation.port';

/**
 * De onde saem os números — **só engajamento**.
 *
 * Frequência, dias ativos, faixa de horário e tempo desde o último treino. Nada
 * de peso, medida, alimentação ou meta corporal: não como métrica, não como
 * eixo, não como filtro, nem como derivada de qualquer um deles. A regra está
 * em `docs/AGGREGATION_POLICY.md` e é conferida por `no-body-data.spec.ts`, que
 * lê este arquivo e falha se um modelo de dado corporal aparecer nele.
 *
 * Este service **não sabe agregar**: ele conta e devolve células cruas. Quem
 * aplica limiar e supressão é `suppress()`, chamado num ponto só
 * (`insights.service.ts`). Contar e suprimir no mesmo lugar é como nasce o
 * segundo caminho que não suprime.
 */
@Injectable()
export class EngagementService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Sessões dos participantes na janela. Uma leitura só, reusada pelos recortes
   * de tempo — e sem `notes`, sem `sets`, sem nada que descreva o treino.
   */
  private async sessions(
    participants: readonly Participant[],
    start: Date,
  ): Promise<Array<{ userId: string; startedAt: Date; planId: string | null }>> {
    return this.prisma.workoutSession.findMany({
      where: { userId: { in: participants.map((p) => p.userId) }, startedAt: { gte: start } },
      select: { userId: true, startedAt: true, planId: true },
    });
  }

  /** Fuso de cada participante, para o balde ser o do relógio de quem treinou. */
  private timezones(participants: readonly Participant[]): Map<string, string> {
    return new Map(participants.map((p) => [p.userId, p.timezone]));
  }

  async sessionsByWeek(participants: readonly Participant[], start: Date, now: Date) {
    const tz = this.timezones(participants);
    const rows = await this.sessions(participants, start);

    return contar(
      rows.map((row) => ({
        key: weekStartInTz(row.startedAt, tz.get(row.userId) ?? 'UTC'),
        userId: row.userId,
      })),
      semanasDaJanela(start, now, participants),
    );
  }

  async sessionsByHourBand(participants: readonly Participant[], start: Date) {
    const tz = this.timezones(participants);
    const rows = await this.sessions(participants, start);

    return contar(
      rows.map((row) => ({
        key: hourBandInTz(row.startedAt, tz.get(row.userId) ?? 'UTC'),
        userId: row.userId,
      })),
      [...HOUR_BANDS],
    );
  }

  /**
   * Dias ativos por mês, somados sobre os participantes.
   *
   * Somados, e não "média por aluno": a média com denominador pequeno é uma
   * divisão que reconstrói o numerador quando se conhece o denominador. A soma é
   * aditiva e é o que a supressão complementar protege.
   */
  async activeDaysByMonth(participants: readonly Participant[], start: Date, now: Date) {
    const tz = this.timezones(participants);
    const rows = await this.sessions(participants, start);

    // Um par (usuário, dia) conta uma vez, por mais sessões que tenha no dia.
    const diasDistintos = new Set(
      rows.map((row) => {
        const fuso = tz.get(row.userId) ?? 'UTC';
        return `${row.userId}|${dateInTz(row.startedAt, fuso)}`;
      }),
    );

    return contar(
      [...diasDistintos].map((chave) => {
        const [userId, dia] = chave.split('|');
        return { key: dia.slice(0, 7), userId };
      }),
      mesesDaJanela(start, now, participants),
    );
  }

  /**
   * Participantes por faixa de "dias desde o último treino".
   *
   * Aqui a métrica **é** a contagem de pessoas: `value === n`. Vale notar por
   * quê — num recorte assim, suprimir o valor sem suprimir o `n` não esconderia
   * nada, e é por isso que `suppress()` zera os dois juntos.
   */
  async membersByRecency(participants: readonly Participant[], now: Date): Promise<Cell[]> {
    const ultimo = await this.lastSessionByUser(participants);

    const porFaixa = new Map<string, number>(RECENCY_BANDS.map((faixa) => [faixa, 0]));
    for (const participante of participants) {
      const sessao = ultimo.get(participante.userId);
      const faixa = sessao === undefined ? 'sem treino' : recencyBand(daysBetween(sessao, now));
      porFaixa.set(faixa, (porFaixa.get(faixa) ?? 0) + 1);
    }

    return RECENCY_BANDS.map((faixa) => {
      const total = porFaixa.get(faixa) ?? 0;
      return { key: faixa, n: total, value: total };
    });
  }

  /** Último treino de cada participante, sem limite de janela. */
  async lastSessionByUser(participants: readonly Participant[]): Promise<Map<string, Date>> {
    const rows = await this.prisma.workoutSession.groupBy({
      by: ['userId'],
      where: { userId: { in: participants.map((p) => p.userId) } },
      _max: { startedAt: true },
    });

    const mapa = new Map<string, Date>();
    for (const row of rows) {
      if (row._max.startedAt) mapa.set(row.userId, row._max.startedAt);
    }
    return mapa;
  }

  /** Sessões por usuário entre dois instantes — insumo do sinal de evasão. */
  async sessionCountsBetween(
    participants: readonly Participant[],
    from: Date,
    to: Date,
  ): Promise<Map<string, number>> {
    const rows = await this.prisma.workoutSession.groupBy({
      by: ['userId'],
      where: {
        userId: { in: participants.map((p) => p.userId) },
        startedAt: { gte: from, lt: to },
      },
      _count: { _all: true },
    });

    return new Map(rows.map((row) => [row.userId, row._count._all]));
  }
}

/** Faixas de recência, fechadas e nomeadas. */
export const RECENCY_BANDS = ['0-7 dias', '8-14 dias', '15-30 dias', '31+ dias', 'sem treino'];

function recencyBand(dias: number): string {
  if (dias <= 7) return '0-7 dias';
  if (dias <= 14) return '8-14 dias';
  if (dias <= 30) return '15-30 dias';
  return '31+ dias';
}

/**
 * Conta eventos por chave, guardando **indivíduos distintos** em `n`.
 *
 * `n` não é o número de eventos: dez sessões da mesma pessoa numa semana são
 * `value = 10, n = 1`, e é o `n = 1` que o limiar tem de ver. Confundir os dois
 * publicaria a semana em que uma pessoa só treinou muito.
 *
 * `baldes` entra para que período sem evento apareça como zero em vez de sumir:
 * uma série temporal com buracos convida o leitor a preencher, e a célula ausente
 * é informação sobre a célula ausente.
 */
function contar(eventos: Array<{ key: string; userId: string }>, baldes: string[]): Cell[] {
  const valores = new Map<string, number>(baldes.map((balde) => [balde, 0]));
  const pessoas = new Map<string, Set<string>>(baldes.map((balde) => [balde, new Set()]));

  for (const evento of eventos) {
    valores.set(evento.key, (valores.get(evento.key) ?? 0) + 1);
    const set = pessoas.get(evento.key) ?? new Set<string>();
    set.add(evento.userId);
    pessoas.set(evento.key, set);
  }

  return [...valores.keys()]
    .sort()
    .map((key) => ({ key, n: pessoas.get(key)?.size ?? 0, value: valores.get(key) ?? 0 }));
}

/** Semanas da janela, no fuso do primeiro participante — só para nomear baldes. */
function semanasDaJanela(start: Date, now: Date, participants: readonly Participant[]): string[] {
  const fuso = participants[0]?.timezone ?? 'UTC';
  const baldes: string[] = [];
  for (let t = start.getTime(); t <= now.getTime(); t += 86_400_000) {
    const semana = weekStartInTz(new Date(t), fuso);
    if (!baldes.includes(semana)) baldes.push(semana);
  }
  return baldes;
}

function mesesDaJanela(start: Date, now: Date, participants: readonly Participant[]): string[] {
  const fuso = participants[0]?.timezone ?? 'UTC';
  const baldes: string[] = [];
  for (let t = start.getTime(); t <= now.getTime(); t += 86_400_000) {
    const mes = monthInTz(new Date(t), fuso);
    if (!baldes.includes(mes)) baldes.push(mes);
  }
  return baldes;
}
