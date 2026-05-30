import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, type NutrientTarget } from '@prisma/client';
import { PrismaService } from '../common/prisma.service';
import { dayBoundsInTz } from '../progress/helpers/date-tz';
import type { UpsertNutrientTargetDto } from './dto/nutrient-target.dto';

export type NutrientStatus = 'under' | 'ok' | 'over' | 'none';

export interface NutrientProgress {
  nutrientKey: string;
  label: string;
  unit: string;
  min: number | null;
  max: number | null;
  total: number;
  status: NutrientStatus;
}

@Injectable()
export class NutrientTargetService {
  constructor(private readonly prisma: PrismaService) {}

  list(userId: string): Promise<NutrientTarget[]> {
    return this.prisma.nutrientTarget.findMany({
      where: { userId },
      orderBy: { label: 'asc' },
    });
  }

  upsert(userId: string, dto: UpsertNutrientTargetDto): Promise<NutrientTarget> {
    const data = {
      label: dto.label,
      unit: dto.unit,
      min: dto.min ?? null,
      max: dto.max ?? null,
      period: dto.period ?? 'daily',
    };
    return this.prisma.nutrientTarget.upsert({
      where: { userId_nutrientKey: { userId, nutrientKey: dto.nutrientKey } },
      create: { userId, nutrientKey: dto.nutrientKey, ...data },
      update: data,
    });
  }

  async delete(userId: string, nutrientKey: string): Promise<{ deleted: true }> {
    const existing = await this.prisma.nutrientTarget.findUnique({
      where: { userId_nutrientKey: { userId, nutrientKey } },
    });
    if (!existing) throw new NotFoundException('Nutrient target not found');
    await this.prisma.nutrientTarget.delete({
      where: { userId_nutrientKey: { userId, nutrientKey } },
    });
    return { deleted: true };
  }

  /**
   * Soma os nutrientes consumidos no dia (de MealItem.nutrients) e compara com as
   * metas do usuário. Retorna uma linha por meta, com o total e o status.
   */
  async getNutrientSummary(
    userId: string,
    date: string,
    timezone: string,
  ): Promise<{ date: string; nutrients: NutrientProgress[] }> {
    const [targets, totals] = await Promise.all([
      this.list(userId),
      this.sumDayNutrients(userId, date, timezone),
    ]);

    const nutrients = targets.map<NutrientProgress>((t) => {
      const total = round2(totals[t.nutrientKey] ?? 0);
      return {
        nutrientKey: t.nutrientKey,
        label: t.label,
        unit: t.unit,
        min: t.min,
        max: t.max,
        total,
        status: classify(total, t.min, t.max),
      };
    });

    return { date, nutrients };
  }

  /** Mapa nutrientKey -> total do dia, somando os MealItem.nutrients das refeições. */
  private async sumDayNutrients(
    userId: string,
    date: string,
    timezone: string,
  ): Promise<Record<string, number>> {
    const { start, end } = dayBoundsInTz(date, timezone);
    const items = await this.prisma.mealItem.findMany({
      where: { meal: { userId, eatenAt: { gte: start, lt: end } } },
      select: { nutrients: true },
    });
    const totals: Record<string, number> = {};
    for (const item of items) {
      const map = item.nutrients;
      if (!map || typeof map !== 'object' || Array.isArray(map)) continue;
      for (const [key, value] of Object.entries(map as Prisma.JsonObject)) {
        if (typeof value === 'number' && Number.isFinite(value)) {
          totals[key] = (totals[key] ?? 0) + value;
        }
      }
    }
    return totals;
  }
}

function classify(total: number, min: number | null, max: number | null): NutrientStatus {
  if (min == null && max == null) return 'none';
  if (max != null && total > max) return 'over';
  if (min != null && total < min) return 'under';
  return 'ok';
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
