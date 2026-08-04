import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { dateInTz, dayBoundsInTz } from '../progress/helpers/date-tz';
import type { ChallengeMetric } from './challenge-metric';

/**
 * Janela e métrica do desafio. `startsAt` é inclusivo; `endsAt`, exclusivo.
 */
export interface ChallengeWindow {
  metric: ChallengeMetric;
  startsAt: Date;
  endsAt: Date;
  /**
   * Fuso **do desafio** — o calendário em que ele foi anunciado ("de 02 a 08 de
   * março") —, e não o de cada participante.
   *
   * É ele que decide QUAIS dias valem, e vale igual para todo mundo. Placar é
   * ranking: janela que muda de tamanho conforme o fuso de quem participa não é
   * comparável, e a comparação é a função deste arquivo.
   */
  timezone: string;
}

/**
 * Quem **entrou** no desafio. A lista é o opt-in: quem não entrou não está aqui,
 * e por isso não é consultado nem pontuado. Não existe filtro "esconder da
 * comparação" a ser esquecido — a ausência é estrutural.
 */
export interface ChallengeParticipant {
  membershipId: string;
  userId: string;
  /**
   * Fuso do titular. Serve para saber a que **dia local** pertence um instante
   * (a sessão de treino), no mesmo calendário em que passos e água já vêm
   * gravados. NÃO define quais dias o desafio cobre — isso é
   * `ChallengeWindow.timezone`, igual para todos.
   */
  timezone: string;
}

/** Uma linha do placar como ela sai para os outros membros. Nada além disto. */
export interface ScoreboardEntry {
  displayName: string;
  score: number;
  /** Posição com empate na mesma colocação: 1, 1, 3. */
  rank: number;
}

/**
 * Os dias de calendário que o desafio cobre, no fuso DO DESAFIO — uma janela
 * só, idêntica para todo participante.
 *
 * A versão anterior derivava a janela do fuso de cada um, e isso quebrava a
 * comparação de duas formas na mesma `startsAt/endsAt` (02/03 03:00Z a 09/03
 * 03:00Z): quem estava em UTC+14 ganhava **8** dias contra os **7** de quem
 * estava em UTC-3, e o primeiro dia dele começava às 10h UTC de 01/03 — **17
 * horas** antes de o desafio existir —, então passos dados na véspera da largada
 * pontuavam para um e eram impossíveis para o outro.
 *
 * Recortar só os dias inteiramente contidos na janela não resolve: com esses
 * mesmos instantes daria 7 dias para UTC-3 e 6 para UTC+14. O único recorte que
 * dá a mesma quantidade de dias para todos é um calendário único — e o dia de
 * cada pessoa continua sendo o dia local dela, porque é assim que passos e água
 * estão gravados; o que passa a ser comum é *quais* datas contam.
 */
function localWindow({ startsAt, endsAt, timezone }: ChallengeWindow): {
  first: string;
  last: string;
} {
  // `endsAt` é exclusivo: o último dia é o do instante ANTERIOR à virada. Usar
  // `endsAt` direto daria um dia a mais em todo desafio que termina à
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
   *
   * ## Pré-condição de quem chama (ADR 010: o isolamento é só da aplicação)
   *
   * `participants` roda sob **autoridade da plataforma**: este método lê
   * `WorkoutSession`, `StepLog` e `WaterLog` de qualquer `userId` que receber,
   * sem conferir posse. Isso é deliberado — ele não tem como conferir, porque
   * `GroupChallengeParticipant` e `GroupMembership` ainda não existem nesta
   * fatia —, mas transfere uma obrigação inteira para o chamador:
   *
   * > cada `participants[i]` tem de vir de uma consulta que **parta do desafio
   * > da URL**, com `membershipId` amarrado ao `GroupMembership` daquele grupo e
   * > `userId` lido de lá — nunca de id vindo do corpo da requisição (#204).
   *
   * A defesa "o que atravessa é só uma contagem" não cobre este método: com
   * `WATER_ML` e uma janela de um dia, o `score` **é** o valor exato de água
   * daquele dia do usuário passado. Enquanto não há rota nem módulo, nada disto
   * é alcançável; o amarrado nasce junto com o controller da segunda fatia.
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

  /**
   * Sessões concluídas na janela. `completedAt: { gte, lt }` já exclui as em aberto.
   *
   * Esta é a única métrica que conta **instantes**, e não dias, e é uma decisão,
   * não um resto: ela conta *sessões*, e sessão tem instante
   * (`WorkoutSession.completedAt` é um `DateTime`). O intervalo `startsAt`→
   * `endsAt` tem exatamente a mesma duração para todo mundo, então "quantas
   * sessões você fez depois do tiro de largada" já é comparável — e um treino
   * feito antes da largada não conta para ninguém, esteja a pessoa onde estiver.
   *
   * `ACTIVE_DAYS` não pode usar esta faixa (ver `instantesDosDias`) porque lá a
   * pergunta é outra: não "quantas sessões", mas "este DIA teve atividade?" — e
   * o dia tem de ser o mesmo para a sessão, os passos e a água, sob pena de o
   * conjunto misturar dois calendários.
   */
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
      // ADR 007: o valor do dia é o MAIOR entre os logs daquele dia, não a soma.
      // Somar tudo daria o dobro para quem tem relógio e celular sincronizando o
      // mesmo dia — pontuação inflada por integração, não por caminhada.
      const maiorDoDia = new Map<string, number>();
      for (const log of logs) {
        if (log.userId !== p.userId) continue;
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
      let total = 0;
      for (const log of logs) {
        if (log.userId !== p.userId) continue;
        // Água é SOMA por dia (ao contrário de passos): cada copo é um log.
        total += log.ml;
      }
      porUsuario.set(p.userId, total);
    }
    return porUsuario;
  }

  /**
   * Dias locais com treino concluído, passos ou água: qualquer um dos três
   * salva o dia, para que ninguém precise inventar registro só para não ficar em
   * último.
   *
   * **Não é o mesmo "dia ativo" do streak (#147)**, e a diferença é de
   * propósito. Lá a regra é `refeição OR treino OR passos >= meta`. Aqui
   * refeição fica de fora — comparar o que cada um come é a mesma classe de
   * gatilho que comparar peso (`challenge-metric.ts`) — e passos valem a partir
   * de qualquer registro, porque a meta de passos é pessoal: usá-la faria os
   * mesmos 6.000 passos salvarem o dia de um participante e não o do outro,
   * dentro do mesmo placar.
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
          // NÃO é `{ gte: startsAt, lt: endsAt }`: aqui a pergunta é "este DIA
          // teve atividade?", e o dia é o local de cada um. O intervalo de
          // instantes do desafio corta o dia local de quem está a leste pela
          // metade — o dia 02/03 de quem está em UTC+14 abre 17h antes de
          // `startsAt` —, e um treino às 2h da manhã de 02/03 sumia da consulta
          // para ele e contava para quem está em UTC-3. Quem recorta de verdade
          // é o `dia < first || dia > last` abaixo; esta faixa só garante que
          // nenhuma sessão de um dia do desafio deixe de ser lida.
          completedAt: this.instantesDosDias(challenge, participants),
        },
        select: { userId: true, completedAt: true },
      }),
      this.prisma.stepLog.findMany({ where, select: { userId: true, date: true, steps: true } }),
      this.prisma.waterLog.findMany({ where, select: { userId: true, date: true, ml: true } }),
    ]);

    const { first, last } = localWindow(challenge);

    const porUsuario = new Map<string, number>();
    for (const p of participants) {
      const dias = new Set<string>();

      for (const s of sessoes) {
        if (s.userId !== p.userId || !s.completedAt) continue;
        // O dia é o do usuário: treino às 23h30 em São Paulo é 02h30 UTC do dia
        // seguinte, e agrupar pelo instante bruto mudaria o dia de quem treina
        // tarde. É o fuso do participante, e não o do desafio, porque este
        // conjunto mistura o dia do treino com o dia de passos e água — que vêm
        // gravados no calendário do titular. Usar dois calendários faria a mesma
        // atividade virar dois dias distintos.
        const dia = dateInTz(s.completedAt, p.timezone);
        // ...e o dia tem de ser um dos dias do desafio: sem este recorte, quem
        // treina perto da virada a leste ganha um dia que a janela não cobre.
        if (dia < first || dia > last) continue;
        dias.add(dia);
      }
      // Passos e água já vieram recortados pela janela na consulta. O que sobra
      // aqui é a guarda de valor: `steps: 0` é sync parcial que reportou zero, e
      // dia sem passo nenhum não é dia ativo.
      for (const log of passos) {
        if (log.userId !== p.userId || log.steps <= 0) continue;
        dias.add(log.date);
      }
      for (const log of agua) {
        if (log.userId !== p.userId || log.ml <= 0) continue;
        dias.add(log.date);
      }

      porUsuario.set(p.userId, dias.size);
    }
    return porUsuario;
  }

  /**
   * Uma consulta só, com os dias do desafio — os mesmos para todo participante.
   *
   * Como a janela é única, ela é também o recorte final: não há segunda filtragem
   * por data em memória. Antes havia, porque a consulta precisava abrir para a
   * união dos fusos e cada um estreitava de novo depois; um recorte em memória
   * que só repete o `where` é código que nenhum teste consegue matar.
   */
  private whereDiaLocal(
    challenge: ChallengeWindow,
    participants: readonly ChallengeParticipant[],
  ): { userId: { in: string[] }; date: { gte: string; lte: string } } {
    const { first, last } = localWindow(challenge);
    return {
      userId: { in: participants.map((p) => p.userId) },
      date: { gte: first, lte: last },
    };
  }

  /**
   * Faixa de instantes que cobre os dias do desafio no fuso de **todo**
   * participante: da meia-noite do primeiro dia para quem está mais a leste até
   * a virada do último dia para quem está mais a oeste.
   *
   * É uma faixa larga de propósito — o recorte que vale é o do dia local, feito
   * em memória. Serve só para a consulta não deixar de fora uma sessão que
   * pertence a um dia do desafio, e para não varrer a tabela inteira.
   */
  private instantesDosDias(
    challenge: ChallengeWindow,
    participants: readonly ChallengeParticipant[],
  ): { gte: Date; lt: Date } {
    const { first, last } = localWindow(challenge);
    const aberturas = participants.map((p) => dayBoundsInTz(first, p.timezone).start.getTime());
    const viradas = participants.map((p) => dayBoundsInTz(last, p.timezone).end.getTime());
    return { gte: new Date(Math.min(...aberturas)), lt: new Date(Math.max(...viradas)) };
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
