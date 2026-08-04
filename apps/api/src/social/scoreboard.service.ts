import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { dateInTz } from '../progress/helpers/date-tz';
import type { ChallengeMetric } from './challenge-metric';

/** Janela e métrica do desafio. `startsAt` é inclusivo; `endsAt`, exclusivo. */
export interface ChallengeWindow {
  metric: ChallengeMetric;
  startsAt: Date;
  endsAt: Date;
}

/**
 * Quem **entrou** no desafio. A lista é o opt-in: quem não entrou não está aqui,
 * e por isso não é consultado nem pontuado. Não existe filtro "esconder da
 * comparação" a ser esquecido — a ausência é estrutural.
 */
export interface ChallengeParticipant {
  membershipId: string;
  userId: string;
  /** Fuso do titular. Passos e água são registrados por dia LOCAL, não por instante. */
  timezone: string;
}

/** Uma linha do placar como ela sai para os outros membros. Nada além disto. */
export interface ScoreboardEntry {
  displayName: string;
  score: number;
  /** Posição com empate na mesma colocação: 1, 1, 3. */
  rank: number;
}

/** YYYY-MM-DD local do primeiro e do último dia que a janela toca. */
function localWindow(
  { startsAt, endsAt }: ChallengeWindow,
  timezone: string,
): { first: string; last: string } {
  // `endsAt` é exclusivo: o último dia local é o do instante ANTERIOR à virada.
  // Usar `endsAt` direto daria um dia a mais em todo desafio que termina à
  // meia-noite — que é como todo desafio termina.
  return {
    first: dateInTz(startsAt, timezone),
    last: dateInTz(new Date(endsAt.getTime() - 1), timezone),
  };
}

/**
 * Placar de desafio de grupo (#161).
 *
 * **Isto NÃO é leitura entre contas e por isso NÃO passa por
 * `ProfessionalAccessService`.** O que atravessa a fronteira é uma contagem:
 * ninguém lê o registro de ninguém, e nenhuma data, valor bruto ou id de
 * registro sai daqui. A única porta de leitura cruzada do produto continua
 * sendo `sharing/professional-access.service.ts` (ADR 014) — o social não abriu
 * uma segunda.
 *
 * O método roda sob autoridade da plataforma, como a medição de cobrança: a
 * autorização que importa aconteceu antes, quando a pessoa **entrou** no
 * desafio.
 */
@Injectable()
export class ScoreboardService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Recalcula a pontuação de cada participante.
   *
   * Devolve só `{ membershipId, score }` — a projeção para a tela é outro
   * passo, de propósito: um `include` distraído aqui vazaria a sessão inteira
   * para dentro de um placar.
   */
  async recompute(
    challenge: ChallengeWindow,
    participants: readonly ChallengeParticipant[],
  ): Promise<Array<{ membershipId: string; score: number }>> {
    if (participants.length === 0) return [];

    const scores = await this.pontuar(challenge, participants);

    return participants.map((p) => ({
      membershipId: p.membershipId,
      score: scores.get(p.userId) ?? 0,
    }));
  }

  /**
   * `switch` com ramo `never`, e não uma cadeia de `if`: métrica nova sem
   * cálculo é erro de compilação. Com o `else` genérico, ela pontuaria zero para
   * todo mundo e o placar ficaria empatado em silêncio.
   */
  private pontuar(
    challenge: ChallengeWindow,
    participants: readonly ChallengeParticipant[],
  ): Promise<Map<string, number>> {
    switch (challenge.metric) {
      case 'WORKOUT_SESSIONS':
        return this.workoutSessions(challenge, participants);
      case 'STEPS':
        return this.steps(challenge, participants);
      case 'WATER_ML':
        return this.waterMl(challenge, participants);
      case 'ACTIVE_DAYS':
        return this.activeDays(challenge, participants);
      default: {
        const naoTratada: never = challenge.metric;
        throw new Error(`Métrica de desafio sem cálculo: ${String(naoTratada)}`);
      }
    }
  }

  /** Sessões concluídas na janela. `completedAt: { gte, lt }` já exclui as em aberto. */
  private async workoutSessions(
    challenge: ChallengeWindow,
    participants: readonly ChallengeParticipant[],
  ): Promise<Map<string, number>> {
    const sessoes = await this.prisma.workoutSession.findMany({
      where: {
        userId: { in: participants.map((p) => p.userId) },
        completedAt: { gte: challenge.startsAt, lt: challenge.endsAt },
      },
      select: { userId: true },
    });

    const porUsuario = new Map<string, number>();
    for (const s of sessoes) porUsuario.set(s.userId, (porUsuario.get(s.userId) ?? 0) + 1);
    return porUsuario;
  }

  private async steps(
    challenge: ChallengeWindow,
    participants: readonly ChallengeParticipant[],
  ): Promise<Map<string, number>> {
    const logs = await this.prisma.stepLog.findMany({
      where: this.whereDiaLocal(challenge, participants),
      select: { userId: true, date: true, steps: true },
    });

    const porUsuario = new Map<string, number>();
    for (const p of participants) {
      const { first, last } = localWindow(challenge, p.timezone);

      // ADR 007: o valor do dia é o MAIOR entre os logs daquele dia, não a soma.
      // Somar tudo daria o dobro para quem tem relógio e celular sincronizando o
      // mesmo dia — pontuação inflada por integração, não por caminhada.
      const maiorDoDia = new Map<string, number>();
      for (const log of logs) {
        if (log.userId !== p.userId || log.date < first || log.date > last) continue;
        maiorDoDia.set(log.date, Math.max(maiorDoDia.get(log.date) ?? 0, log.steps));
      }

      let total = 0;
      for (const valor of maiorDoDia.values()) total += valor;
      porUsuario.set(p.userId, total);
    }
    return porUsuario;
  }

  private async waterMl(
    challenge: ChallengeWindow,
    participants: readonly ChallengeParticipant[],
  ): Promise<Map<string, number>> {
    const logs = await this.prisma.waterLog.findMany({
      where: this.whereDiaLocal(challenge, participants),
      select: { userId: true, date: true, ml: true },
    });

    const porUsuario = new Map<string, number>();
    for (const p of participants) {
      const { first, last } = localWindow(challenge, p.timezone);
      let total = 0;
      for (const log of logs) {
        if (log.userId !== p.userId || log.date < first || log.date > last) continue;
        // Água é SOMA por dia (ao contrário de passos): cada copo é um log.
        total += log.ml;
      }
      porUsuario.set(p.userId, total);
    }
    return porUsuario;
  }

  /**
   * Dias locais com treino concluído, passos ou água — o OR é o mesmo do streak
   * (#147) e pelo mesmo motivo: se treinar já salva o dia, ninguém precisa
   * inventar registro para não ficar em último.
   */
  private async activeDays(
    challenge: ChallengeWindow,
    participants: readonly ChallengeParticipant[],
  ): Promise<Map<string, number>> {
    const where = this.whereDiaLocal(challenge, participants);
    const [sessoes, passos, agua] = await Promise.all([
      this.prisma.workoutSession.findMany({
        where: {
          userId: { in: participants.map((p) => p.userId) },
          completedAt: { gte: challenge.startsAt, lt: challenge.endsAt },
        },
        select: { userId: true, completedAt: true },
      }),
      this.prisma.stepLog.findMany({ where, select: { userId: true, date: true, steps: true } }),
      this.prisma.waterLog.findMany({ where, select: { userId: true, date: true, ml: true } }),
    ]);

    const porUsuario = new Map<string, number>();
    for (const p of participants) {
      const { first, last } = localWindow(challenge, p.timezone);
      const dias = new Set<string>();

      for (const s of sessoes) {
        if (s.userId !== p.userId || !s.completedAt) continue;
        // O dia é o do usuário: treino às 23h30 em São Paulo é 02h30 UTC do dia
        // seguinte, e agrupar pelo instante bruto mudaria o dia de quem treina tarde.
        dias.add(dateInTz(s.completedAt, p.timezone));
      }
      for (const log of passos) {
        if (log.userId !== p.userId || log.steps <= 0 || log.date < first || log.date > last)
          continue;
        dias.add(log.date);
      }
      for (const log of agua) {
        if (log.userId !== p.userId || log.ml <= 0 || log.date < first || log.date > last) continue;
        dias.add(log.date);
      }

      porUsuario.set(p.userId, dias.size);
    }
    return porUsuario;
  }

  /**
   * Uma consulta só para todo mundo, com a janela mais larga entre os fusos, e o
   * recorte fino de cada participante feito em memória.
   *
   * Uma consulta por fuso seria N idas ao banco por abertura de placar; uma
   * janela única sem o recorte contaria, para quem está em UTC+13, um dia que o
   * desafio não cobre no fuso dele.
   */
  private whereDiaLocal(
    challenge: ChallengeWindow,
    participants: readonly ChallengeParticipant[],
  ): { userId: { in: string[] }; date: { gte: string; lte: string } } {
    const janelas = participants.map((p) => localWindow(challenge, p.timezone));
    return {
      userId: { in: participants.map((p) => p.userId) },
      date: {
        gte: janelas.reduce((min, j) => (j.first < min ? j.first : min), janelas[0].first),
        lte: janelas.reduce((max, j) => (j.last > max ? j.last : max), janelas[0].last),
      },
    };
  }
}

/**
 * Monta o placar que vai para a tela.
 *
 * A assinatura **não recebe** `membershipId` nem `userId` de propósito: o que
 * não entra não pode vazar. Ligar pontuação a pessoa é trabalho de quem chama,
 * dentro do grupo, e o que sai daqui é `{ displayName, score, rank }` e nada
 * mais.
 */
export function buildScoreboard(
  linhas: ReadonlyArray<{ displayName: string; score: number }>,
): ScoreboardEntry[] {
  // Desempate por nome só para a ordem ser determinística entre duas leituras
  // iguais — a posição de empatados é a mesma, o que muda é quem aparece antes.
  const ordenado = [...linhas].sort(
    (a, b) => b.score - a.score || a.displayName.localeCompare(b.displayName, 'pt-BR'),
  );

  let posicao = 0;
  let pontuacaoAnterior: number | null = null;
  return ordenado.map((linha, indice) => {
    if (pontuacaoAnterior === null || linha.score !== pontuacaoAnterior) {
      posicao = indice + 1;
      pontuacaoAnterior = linha.score;
    }
    return { displayName: linha.displayName, score: linha.score, rank: posicao };
  });
}
