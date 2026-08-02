import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { addDaysIso, dateInTz, dayBoundsInTz, todayInTz, weekStartInTz } from './helpers/date-tz';
import {
  JANELA_DIAS,
  JANELA_SEMANAS,
  TOLERANCIA_DIARIA,
  TOLERANCIA_SEMANAL,
  computeStreak,
  type StreakResult,
} from './helpers/compute-streak';

interface UserCtx {
  userId: string;
  timezone: string;
}

export interface StreakSummary {
  /**
   * O número grande da tela: dias em que o usuário fez **alguma** coisa.
   *
   * Um dia conta como ativo se teve pelo menos uma refeição registrada, OU uma sessão de treino
   * concluída, OU o alvo de passos batido. O OR é o antídoto direto para o risco que a própria
   * issue levanta — "registrar qualquer coisa só para manter a sequência". Se treinar já salva o
   * dia, não há incentivo a inventar refeição.
   */
  activeDays: StreakResult;
  nutritionDays: StreakResult;
  /** Em SEMANAS, não em dias. A tela precisa dizer "semanas" ao lado deste número. */
  workoutWeeks: StreakResult;
  /** Zerado quando o usuário não tem linha de `UserGoals` — sem meta não há o que bater. */
  stepsDays: StreakResult;
  /** `false` quando não há `UserGoals`: passos ficam de fora do OR de dia ativo. */
  stepsTargetSet: boolean;
}

/**
 * Sequências do usuário, derivadas de `Meal`/`WorkoutSession`/`StepLog`.
 *
 * **Nada é materializado.** Uma tabela `UserStreak` criaria um segundo lugar onde a verdade mora:
 * apagar uma refeição teria de decrementar o contador, e errar isso é invisível — o número fica
 * errado e ninguém tem como saber. Derivar mantém uma fonte só.
 *
 * O custo de derivar era o problema real: a versão anterior fazia um `count` por dia dentro de um
 * laço, ~120 idas ao banco a cada abertura do app. Aqui são **três** consultas agregadas e o
 * resto é memória — a mesma escolha que `SessionSetService.listPersonalRecords` já faz e
 * justifica: escala pessoal torna agregação em memória suficiente.
 */
@Injectable()
export class StreakService {
  constructor(private readonly prisma: PrismaService) {}

  async compute(ctx: UserCtx): Promise<StreakSummary> {
    const hoje = todayInTz(ctx.timezone);
    const primeiroDia = addDaysIso(hoje, -(JANELA_DIAS - 1));

    // A segunda-feira da semana corrente. O instante de referência é a meia-noite local de hoje,
    // e não `${hoje}T12:00:00Z`: montar meio-dia UTC a partir de um YMD que já está no fuso do
    // usuário é um round-trip que desloca um dia em UTC+13/+14 (`Pacific/Kiritimati`).
    const semanaCorrente = weekStartInTz(dayBoundsInTz(hoje, ctx.timezone).start, ctx.timezone);
    const primeiraSemana = addDaysIso(semanaCorrente, -7 * (JANELA_SEMANAS - 1));

    // `lt` no fim, nunca `lte`: `dayBoundsInTz` devolve a meia-noite do dia SEGUINTE, e com `lte`
    // o instante exato da virada pertenceria aos dois dias — um registro na virada inventaria um
    // dia ativo. Num streak com tolerância isso é pior que antes: devolve ou consome falta com
    // base num artefato de fronteira.
    const fimDeHoje = dayBoundsInTz(hoje, ctx.timezone).end;

    const [refeicoes, sessoes, passos, metas] = await Promise.all([
      this.prisma.meal.findMany({
        where: {
          userId: ctx.userId,
          eatenAt: { gte: dayBoundsInTz(primeiroDia, ctx.timezone).start, lt: fimDeHoje },
        },
        select: { eatenAt: true },
      }),
      this.prisma.workoutSession.findMany({
        where: {
          userId: ctx.userId,
          completedAt: { gte: dayBoundsInTz(primeiraSemana, ctx.timezone).start, lt: fimDeHoje },
        },
        select: { completedAt: true },
      }),
      this.prisma.stepLog.findMany({
        where: { userId: ctx.userId, date: { gte: primeiroDia, lte: hoje } },
        select: { date: true, steps: true },
      }),
      this.prisma.userGoals.findUnique({
        where: { userId: ctx.userId },
        select: { dailyStepsTarget: true },
      }),
    ]);

    // O dia é sempre o dia **local**: jantar às 23h30 em São Paulo é 02h30 UTC do dia seguinte,
    // e agrupar pelo instante bruto furaria a sequência de quem come tarde.
    const diasComRefeicao = new Set(refeicoes.map((r) => dateInTz(r.eatenAt, ctx.timezone)));

    const diasComTreino = new Set<string>();
    const semanasComTreino = new Set<string>();
    for (const s of sessoes) {
      if (!s.completedAt) continue;
      diasComTreino.add(dateInTz(s.completedAt, ctx.timezone));
      semanasComTreino.add(weekStartInTz(s.completedAt, ctx.timezone));
    }

    // ADR 007: o valor do dia é o MAIOR entre os logs daquele dia, não a soma.
    const passosPorDia = new Map<string, number>();
    for (const p of passos) {
      const atual = passosPorDia.get(p.date) ?? 0;
      if (p.steps > atual) passosPorDia.set(p.date, p.steps);
    }

    const alvoPassos = metas?.dailyStepsTarget ?? null;
    const diasComMetaDePassos = new Set<string>();
    if (alvoPassos !== null) {
      for (const [dia, valor] of passosPorDia) {
        if (valor >= alvoPassos) diasComMetaDePassos.add(dia);
      }
    }

    const diasAtivos = new Set([...diasComRefeicao, ...diasComTreino, ...diasComMetaDePassos]);

    const diario = (ativos: ReadonlySet<string>): StreakResult =>
      computeStreak({
        ativos,
        corrente: hoje,
        anterior: (d) => addDaysIso(d, -1),
        janela: JANELA_DIAS,
        tolerancia: TOLERANCIA_DIARIA,
      });

    return {
      activeDays: diario(diasAtivos),
      nutritionDays: diario(diasComRefeicao),
      workoutWeeks: computeStreak({
        ativos: semanasComTreino,
        corrente: semanaCorrente,
        anterior: (s) => addDaysIso(s, -7),
        janela: JANELA_SEMANAS,
        tolerancia: TOLERANCIA_SEMANAL,
      }),
      stepsDays: diario(diasComMetaDePassos),
      stepsTargetSet: alvoPassos !== null,
    };
  }
}
