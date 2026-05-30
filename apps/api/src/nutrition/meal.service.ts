import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma.service';
import { dayBoundsInTz } from '../progress/helpers/date-tz';
import type { CreateMealDto, ListMealsDto, MealItemInputDto, UpdateMealDto } from './dto/meal.dto';
import { calcMacrosFromFood, calcNutrientsFromFood, type ItemMacros } from './helpers/calc-macros';

interface ResolvedItem extends ItemMacros {
  foodId: number | null;
  foodName: string;
  groupId: number | null;
  grams: number;
  nutrients?: Prisma.InputJsonValue;
}

/** Mantém só pares chave→número finito (ignora lixo) ou undefined se vazio. */
function sanitizeNutrients(
  raw: Record<string, number> | undefined,
): Prisma.InputJsonValue | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const clean: Record<string, number> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === 'number' && Number.isFinite(value)) clean[key] = value;
  }
  return Object.keys(clean).length > 0 ? clean : undefined;
}

@Injectable()
export class MealService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, dto: CreateMealDto) {
    const items = await this.resolveItems(userId, dto.items);
    return this.prisma.meal.create({
      data: {
        userId,
        mealType: dto.mealType,
        eatenAt: new Date(dto.eatenAt),
        notes: dto.notes,
        items: { create: items },
      },
      include: { items: true },
    });
  }

  async findById(userId: string, id: string) {
    const meal = await this.prisma.meal.findFirst({
      where: { id, userId },
      include: { items: true },
    });
    if (!meal) throw new NotFoundException('Meal not found');
    return meal;
  }

  /**
   * Lista refeições do usuário. Cursor pagination: cursor é o id da última.
   * Se `date` for fornecido, filtra ao dia no fuso do usuário (baseado em eatenAt).
   */
  async list(userId: string, params: ListMealsDto, timezone: string) {
    const limit = Math.min(params.limit ?? 20, 50);
    const where: Prisma.MealWhereInput = { userId };
    if (params.date) {
      const { start, end } = dayBoundsInTz(params.date, timezone);
      where.eatenAt = { gte: start, lt: end };
    }
    return this.prisma.meal.findMany({
      where,
      include: { items: true },
      orderBy: [{ eatenAt: 'desc' }, { id: 'desc' }],
      take: limit,
      ...(params.cursor ? { cursor: { id: params.cursor }, skip: 1 } : {}),
    });
  }

  async update(userId: string, id: string, dto: UpdateMealDto) {
    await this.assertOwner(userId, id);
    return this.prisma.meal.update({
      where: { id },
      data: {
        mealType: dto.mealType,
        eatenAt: dto.eatenAt ? new Date(dto.eatenAt) : undefined,
        notes: dto.notes,
      },
      include: { items: true },
    });
  }

  async delete(userId: string, id: string): Promise<void> {
    await this.assertOwner(userId, id);
    await this.prisma.meal.delete({ where: { id } });
  }

  private async assertOwner(userId: string, id: string) {
    const meal = await this.prisma.meal.findUnique({ where: { id }, select: { userId: true } });
    if (!meal) throw new NotFoundException('Meal not found');
    if (meal.userId !== userId) throw new ForbiddenException();
  }

  /**
   * Resolve cada item: se tiver foodId, busca Food (validando ownership) e calcula
   * macros via regra de 3. Se for item livre (sem foodId), exige foodName + macros explícitos.
   */
  async resolveItems(userId: string, items: MealItemInputDto[]): Promise<ResolvedItem[]> {
    const result: ResolvedItem[] = [];
    for (const item of items) {
      if (item.foodId !== undefined) {
        const food = await this.prisma.food.findFirst({
          where: {
            id: item.foodId,
            OR: [{ createdByUserId: null }, { createdByUserId: userId }],
          },
        });
        if (!food) throw new NotFoundException(`Food ${item.foodId} not found`);
        const macros = calcMacrosFromFood(food, item.grams);
        // Micros explícitos (estimativa do Claude/correção) vencem; senão deriva do
        // catálogo por regra de 3 — assim logar um alimento da TACO já preenche sódio
        // & cia. sem digitação (ADR 009).
        const nutrients =
          sanitizeNutrients(item.nutrients) ?? calcNutrientsFromFood(food.nutrients, item.grams);
        result.push({
          foodId: food.id,
          foodName: item.foodName ?? food.name,
          groupId: item.groupId ?? food.groupId,
          grams: item.grams,
          ...macros,
          nutrients,
        });
      } else {
        if (!item.foodName) {
          throw new ForbiddenException('Item livre requer foodName');
        }
        result.push({
          foodId: null,
          foodName: item.foodName,
          groupId: item.groupId ?? null,
          grams: item.grams,
          kcal: item.kcal ?? 0,
          proteinG: item.proteinG ?? 0,
          carbsG: item.carbsG ?? 0,
          fatG: item.fatG ?? 0,
          nutrients: sanitizeNutrients(item.nutrients),
        });
      }
    }
    return result;
  }
}
