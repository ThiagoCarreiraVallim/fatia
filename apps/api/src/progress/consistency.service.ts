import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { addDaysIso, dateInTz, dayBoundsInTz, todayInTz } from './helpers/date-tz';
import { JANELA_DIAS, type StreakResult } from './helpers/compute-streak';
import {
  activeDates,
  areaSummary,
  buildDayAreas,
  consistencyWindow,
  currentStreak,
  longestStreak,
  type AreaCount,
  type ConsistencyArea,
  type ConsistencyRange,
  type DayAreas,
} from './helpers/consistency';

interface UserCtx {
  userId: string;
  timezone: string;
}

export interface StreakSummary {
  /**
   * O número grande da tela: dias ativos seguidos. Um dia é ativo com ao menos uma área
   * cumprida — refeição registrada, treino concluído, água na meta ou passos na meta (#382).
   *
   * O OR é o antídoto do risco da #147, "registrar qualquer coisa só para manter a sequência":
   * se treinar já salva o dia, não há incentivo a inventar refeição. Já traz a tolerância de
   * faltas, então um dia perdido não zera a sequência.
   */
  activeDays: StreakResult;
}

export interface ConsistencyReport {
  range: ConsistencyRange;
  /** Primeiro e último dia do período (`YYYY-MM-DD`, fuso da pessoa). O último é hoje. */
  from: string;
  to: string;
  /** Um item por dia do período, com as áreas cumpridas (0 a 4). */
  days: DayAreas[];
  /** Dias com ao menos uma área: o "16/30" da prancha. */
  activeDays: number;
  totalDays: number;
  /** A sequência de hoje, a mesma do Hoje e do `GET /streak`. */
  streak: StreakResult;
  /** A maior sequência que termina dentro do período, com a mesma regra. */
  record: number;
  /** "Por área: dias na meta". */
  byArea: Record<ConsistencyArea, AreaCount>;
}

/**
 * Sequência e constância, derivadas de `Meal`, `WorkoutSession`, `WaterLog` e `StepLog` (#382).
 *
 * **Um cálculo só.** O dia ativo, a sequência e a grade da Constância saem de `load()`, e todo
 * leitor (Hoje, `GET /streak`, `get_streak`, `get_consistency`, conquistas de sequência) passa
 * por aqui. Duas versões do "dia ativo" já existiram (a do streak sem água e a da grade) e é
 * exatamente isso que o dono pediu para não repetir.
 *
 * **Nada é materializado.** Uma tabela criaria um segundo lugar onde a verdade mora: apagar uma
 * refeição teria de decrementar o contador, e errar isso é invisível. O custo de derivar é uma
 * consulta por fonte e o resto em memória — escala pessoal.
 */
@Injectable()
export class ConsistencyService {
  constructor(private readonly prisma: PrismaService) {}

  async streak(ctx: UserCtx): Promise<StreakSummary> {
    const today = todayInTz(ctx.timezone);
    const { active } = await this.load(ctx, addDaysIso(today, -(JANELA_DIAS - 1)), today);
    return { activeDays: currentStreak(active, today) };
  }

  async report(ctx: UserCtx, range: ConsistencyRange): Promise<ConsistencyReport> {
    const today = todayInTz(ctx.timezone);
    const { from, to } = consistencyWindow(range, today);
    // Um ano antes do período: o recorde conta a sequência inteira, e a que termina no primeiro
    // dia do período pode ter começado muito antes dele.
    const { days, active, goals } = await this.load(ctx, addDaysIso(from, -JANELA_DIAS), to);
    const inRange = days.filter((d) => d.date >= from);
    const streak = currentStreak(active, today);
    return {
      range,
      from,
      to,
      days: inRange,
      activeDays: inRange.filter((d) => d.count > 0).length,
      totalDays: inRange.length,
      streak,
      record: Math.max(streak.periodos, longestStreak(active, from, to)),
      byArea: areaSummary(inRange, {
        weeklyWorkouts: goals?.weeklyWorkouts ?? null,
        waterTargetMl: goals?.dailyWaterTargetMl ?? null,
        stepsTarget: goals?.dailyStepsTarget ?? null,
      }),
    };
  }

  private async load(ctx: UserCtx, from: string, to: string) {
    // `lt` no fim, nunca `lte`: `dayBoundsInTz` devolve a meia-noite do dia SEGUINTE, e com `lte`
    // o instante exato da virada pertenceria aos dois dias — um registro na virada inventaria um
    // dia ativo e, com tolerância, devolveria uma falta que não existiu.
    const start = dayBoundsInTz(from, ctx.timezone).start;
    const end = dayBoundsInTz(to, ctx.timezone).end;

    const [meals, sessions, steps, water, goals] = await Promise.all([
      this.prisma.meal.findMany({
        where: { userId: ctx.userId, eatenAt: { gte: start, lt: end } },
        select: { eatenAt: true },
      }),
      this.prisma.workoutSession.findMany({
        where: { userId: ctx.userId, completedAt: { gte: start, lt: end } },
        select: { completedAt: true },
      }),
      this.prisma.stepLog.findMany({
        where: { userId: ctx.userId, date: { gte: from, lte: to } },
        select: { date: true, steps: true },
      }),
      this.prisma.waterLog.findMany({
        where: { userId: ctx.userId, date: { gte: from, lte: to } },
        select: { date: true, ml: true },
      }),
      this.prisma.userGoals.findUnique({
        where: { userId: ctx.userId },
        select: { dailyStepsTarget: true, dailyWaterTargetMl: true, weeklyWorkouts: true },
      }),
    ]);

    // O dia é sempre o dia **local**: jantar às 23h30 em São Paulo é 02h30 UTC do dia seguinte.
    const mealDays = new Set(meals.map((m) => dateInTz(m.eatenAt, ctx.timezone)));
    const workoutDays = new Set<string>();
    for (const s of sessions) {
      if (s.completedAt) workoutDays.add(dateInTz(s.completedAt, ctx.timezone));
    }

    // Passos: o MAIOR log do dia (ADR 007). Água: a SOMA (cada copo é um log).
    const stepsByDay = new Map<string, number>();
    for (const s of steps) stepsByDay.set(s.date, Math.max(stepsByDay.get(s.date) ?? 0, s.steps));
    const waterMlByDay = new Map<string, number>();
    for (const w of water) waterMlByDay.set(w.date, (waterMlByDay.get(w.date) ?? 0) + w.ml);

    const days = buildDayAreas(from, to, {
      mealDays,
      workoutDays,
      stepsByDay,
      waterMlByDay,
      waterTargetMl: goals?.dailyWaterTargetMl ?? null,
      stepsTarget: goals?.dailyStepsTarget ?? null,
    });
    return { days, active: activeDates(days), goals };
  }
}
