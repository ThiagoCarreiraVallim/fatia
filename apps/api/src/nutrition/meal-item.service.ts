import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import type { MealItemInputDto, UpdateMealItemDto } from './dto/meal.dto';
import { MealService } from './meal.service';
import { calcMacrosFromFood } from './helpers/calc-macros';

@Injectable()
export class MealItemService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mealService: MealService,
  ) {}

  async add(userId: string, mealId: string, dto: MealItemInputDto) {
    await this.assertOwner(userId, mealId);
    const [resolved] = await this.mealService.resolveItems(userId, [dto]);
    return this.prisma.mealItem.create({
      data: { mealId, ...resolved },
    });
  }

  async update(userId: string, itemId: string, dto: UpdateMealItemDto) {
    const item = await this.prisma.mealItem.findUnique({
      where: { id: itemId },
      include: { meal: { select: { userId: true } }, food: true },
    });
    if (!item) throw new NotFoundException('MealItem not found');
    if (item.meal.userId !== userId) throw new ForbiddenException();

    let kcal = item.kcal;
    let proteinG = item.proteinG;
    let carbsG = item.carbsG;
    let fatG = item.fatG;
    const grams = dto.grams ?? item.grams;

    if (dto.grams !== undefined && item.food) {
      const m = calcMacrosFromFood(item.food, dto.grams);
      kcal = m.kcal;
      proteinG = m.proteinG;
      carbsG = m.carbsG;
      fatG = m.fatG;
    }
    // Macros explícitos sobrescrevem (item livre ou ajuste manual)
    if (dto.kcal !== undefined) kcal = dto.kcal;
    if (dto.proteinG !== undefined) proteinG = dto.proteinG;
    if (dto.carbsG !== undefined) carbsG = dto.carbsG;
    if (dto.fatG !== undefined) fatG = dto.fatG;

    return this.prisma.mealItem.update({
      where: { id: itemId },
      data: { grams, kcal, proteinG, carbsG, fatG },
    });
  }

  async delete(userId: string, itemId: string): Promise<void> {
    const item = await this.prisma.mealItem.findUnique({
      where: { id: itemId },
      include: { meal: { select: { userId: true } } },
    });
    if (!item) throw new NotFoundException('MealItem not found');
    if (item.meal.userId !== userId) throw new ForbiddenException();
    await this.prisma.mealItem.delete({ where: { id: itemId } });
  }

  private async assertOwner(userId: string, mealId: string) {
    const meal = await this.prisma.meal.findUnique({
      where: { id: mealId },
      select: { userId: true },
    });
    if (!meal) throw new NotFoundException('Meal not found');
    if (meal.userId !== userId) throw new ForbiddenException();
  }
}
