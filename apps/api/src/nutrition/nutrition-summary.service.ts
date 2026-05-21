import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { dayBoundsInTz, todayInTz, addDaysIso } from '../progress/helpers/date-tz';
import { sumMacros, type ItemMacros } from './helpers/calc-macros';

export interface DayTotals extends ItemMacros {
  date: string;
  meals: number;
}

@Injectable()
export class NutritionSummaryService {
  constructor(private readonly prisma: PrismaService) {}

  /** Resumo do dia no fuso do usuário. `date` em formato YYYY-MM-DD. */
  async getDay(userId: string, date: string, timezone: string) {
    const { start, end } = dayBoundsInTz(date, timezone);
    const meals = await this.prisma.meal.findMany({
      where: { userId, eatenAt: { gte: start, lt: end } },
      include: { items: true },
      orderBy: { eatenAt: 'asc' },
    });
    const allItems = meals.flatMap((m) => m.items);
    const totals = sumMacros(allItems);
    return { date, totals, mealsCount: meals.length, meals };
  }

  /** Histórico dos últimos N dias no fuso do usuário, com totais por dia + médias. */
  async getHistory(userId: string, days: number, timezone: string) {
    const today = todayInTz(timezone);
    const startDate = addDaysIso(today, -(days - 1));
    const { start } = dayBoundsInTz(startDate, timezone);
    const { end } = dayBoundsInTz(today, timezone);

    const meals = await this.prisma.meal.findMany({
      where: { userId, eatenAt: { gte: start, lt: end } },
      include: { items: true },
    });

    const byDay = new Map<string, DayTotals>();
    for (let i = 0; i < days; i++) {
      const d = addDaysIso(startDate, i);
      byDay.set(d, { date: d, meals: 0, kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 });
    }

    for (const meal of meals) {
      // Converte eatenAt UTC para a data local do usuário
      const localDate = new Intl.DateTimeFormat('en-CA', {
        timeZone: timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(meal.eatenAt);

      const slot = byDay.get(localDate);
      if (!slot) continue;
      const macros = sumMacros(meal.items);
      slot.meals += 1;
      slot.kcal = round2(slot.kcal + macros.kcal);
      slot.proteinG = round2(slot.proteinG + macros.proteinG);
      slot.carbsG = round2(slot.carbsG + macros.carbsG);
      slot.fatG = round2(slot.fatG + macros.fatG);
    }

    const series = Array.from(byDay.values());
    const avg = sumMacros(series);
    return {
      days,
      series,
      averages: {
        kcal: round2(avg.kcal / days),
        proteinG: round2(avg.proteinG / days),
        carbsG: round2(avg.carbsG / days),
        fatG: round2(avg.fatG / days),
      },
    };
  }
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}
