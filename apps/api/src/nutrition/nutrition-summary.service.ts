import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { sumMacros, type ItemMacros } from './helpers/calc-macros';

export interface DayTotals extends ItemMacros {
  date: string;
  meals: number;
}

@Injectable()
export class NutritionSummaryService {
  constructor(private readonly prisma: PrismaService) {}

  /** Resumo do dia (UTC). `date` em formato YYYY-MM-DD. */
  async getDay(userId: string, date: string) {
    const { start, end } = dayRange(date);
    const meals = await this.prisma.meal.findMany({
      where: { userId, eatenAt: { gte: start, lt: end } },
      include: { items: true },
      orderBy: { eatenAt: 'asc' },
    });
    const allItems = meals.flatMap((m) => m.items);
    const totals = sumMacros(allItems);
    return { date, totals, mealsCount: meals.length, meals };
  }

  /** Histórico dos últimos N dias (UTC), com totais por dia + médias. */
  async getHistory(userId: string, days: number) {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const start = new Date(today);
    start.setUTCDate(start.getUTCDate() - days + 1);

    const meals = await this.prisma.meal.findMany({
      where: { userId, eatenAt: { gte: start, lt: addDays(today, 1) } },
      include: { items: true },
    });

    const byDay = new Map<string, DayTotals>();
    for (let i = 0; i < days; i++) {
      const d = isoDate(addDays(start, i));
      byDay.set(d, { date: d, meals: 0, kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 });
    }
    for (const meal of meals) {
      const d = isoDate(meal.eatenAt);
      const slot = byDay.get(d);
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

function dayRange(date: string) {
  const start = new Date(`${date}T00:00:00.000Z`);
  return { start, end: addDays(start, 1) };
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setUTCDate(r.getUTCDate() + n);
  return r;
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}
