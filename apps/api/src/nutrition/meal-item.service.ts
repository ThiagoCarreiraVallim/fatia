import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
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
    // Mesma resposta para "não existe" e "não é seu" (§IDs de docs/MCP.md).
    if (!item || item.meal.userId !== userId) throw new NotFoundException('MealItem not found');

    let kcal = item.kcal;
    let proteinG = item.proteinG;
    let carbsG = item.carbsG;
    let fatG = item.fatG;
    let grams = item.grams;
    let amountChanged = false;
    const data: Prisma.MealItemUpdateInput = {};

    if (dto.portionId !== undefined || dto.quantity !== undefined) {
      if (item.foodId === null) {
        throw new BadRequestException('Medida caseira só vale para item com alimento');
      }
      const amount = await this.mealService.resolveAmount(userId, item.foodId, dto);
      grams = amount.grams;
      amountChanged = true;
      data.portionLabel = amount.portionLabel ?? null;
      data.portionQuantity = amount.portionQuantity ?? null;
    } else if (dto.grams !== undefined) {
      grams = dto.grams;
      amountChanged = true;
      // Gramas digitadas à mão: "2 × colher de sopa" deixou de descrever o item.
      data.portionLabel = null;
      data.portionQuantity = null;
    }

    if (amountChanged && item.food) {
      const m = calcMacrosFromFood(item.food, grams);
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

    Object.assign(data, { grams, kcal, proteinG, carbsG, fatG });
    if (dto.nutrients !== undefined) {
      const clean: Record<string, number> = {};
      for (const [k, v] of Object.entries(dto.nutrients)) {
        if (typeof v === 'number' && Number.isFinite(v)) clean[k] = v;
      }
      data.nutrients = Object.keys(clean).length > 0 ? clean : Prisma.JsonNull;
    }

    return this.prisma.mealItem.update({ where: { id: itemId }, data });
  }

  async delete(userId: string, itemId: string): Promise<void> {
    const item = await this.prisma.mealItem.findUnique({
      where: { id: itemId },
      include: { meal: { select: { userId: true } } },
    });
    // Mesma resposta para "não existe" e "não é seu" (§IDs de docs/MCP.md).
    if (!item || item.meal.userId !== userId) throw new NotFoundException('MealItem not found');
    await this.prisma.mealItem.delete({ where: { id: itemId } });
  }

  private async assertOwner(userId: string, mealId: string) {
    const meal = await this.prisma.meal.findUnique({
      where: { id: mealId },
      select: { userId: true },
    });
    // Mesma resposta para "não existe" e "não é sua" (§IDs de docs/MCP.md).
    if (!meal || meal.userId !== userId) throw new NotFoundException('Meal not found');
  }
}
