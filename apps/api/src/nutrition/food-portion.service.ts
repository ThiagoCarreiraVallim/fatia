import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma.service';
import { FoodService } from './food.service';
import type { CreateFoodPortionDto } from './dto/food.dto';
import {
  PORTION_ORDER,
  PORTION_SELECT,
  toPortionView,
  visiblePortions,
  type FoodPortionView,
} from './helpers/portion';

/**
 * Medidas caseiras de um alimento: as do catálogo (sem dono) e as que a pessoa
 * criou. Só se lê ou cria medida em alimento que a pessoa enxerga — o custom
 * alheio responde 404 como na busca.
 */
@Injectable()
export class FoodPortionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly foods: FoodService,
  ) {}

  async list(userId: string, foodId: number): Promise<FoodPortionView[]> {
    await this.foods.get(userId, foodId);
    const rows = await this.prisma.foodPortion.findMany({
      where: { foodId, ...visiblePortions(userId) },
      select: PORTION_SELECT,
      orderBy: PORTION_ORDER,
    });
    return rows.map((row) => toPortionView(row, userId));
  }

  async create(
    userId: string,
    foodId: number,
    dto: CreateFoodPortionDto,
  ): Promise<FoodPortionView> {
    await this.foods.get(userId, foodId);
    try {
      const row = await this.prisma.foodPortion.create({
        data: { foodId, label: dto.label.trim(), grams: dto.grams, createdByUserId: userId },
        select: PORTION_SELECT,
      });
      return toPortionView(row, userId);
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException(`Já existe a medida "${dto.label.trim()}" neste alimento`);
      }
      throw err;
    }
  }

  /** Só a da própria pessoa; a do catálogo e a alheia respondem como inexistentes. */
  async remove(userId: string, id: string): Promise<void> {
    const { count } = await this.prisma.foodPortion.deleteMany({
      where: { id, createdByUserId: userId },
    });
    if (count === 0) throw new NotFoundException('Portion not found');
  }
}
