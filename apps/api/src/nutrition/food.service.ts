import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { FoodSource, type Food } from '@prisma/client';
import { PrismaService } from '../common/prisma.service';
import type { CreateCustomFoodDto, SearchFoodDto, UpdateCustomFoodDto } from './dto/food.dto';

@Injectable()
export class FoodService {
  constructor(private readonly prisma: PrismaService) {}

  /** Busca alimentos no catálogo público (TACO/USDA) + customs do usuário. */
  async search(userId: string, params: SearchFoodDto): Promise<Food[]> {
    const limit = Math.min(params.limit ?? 20, 50);
    return this.prisma.food.findMany({
      where: {
        AND: [
          { OR: [{ createdByUserId: null }, { createdByUserId: userId }] },
          params.q ? { name: { contains: params.q, mode: 'insensitive' } } : {},
          params.groupId ? { groupId: params.groupId } : {},
        ],
      },
      orderBy: [{ name: 'asc' }],
      take: limit,
    });
  }

  async get(userId: string, id: number): Promise<Food> {
    const food = await this.prisma.food.findFirst({
      where: {
        id,
        OR: [{ createdByUserId: null }, { createdByUserId: userId }],
      },
    });
    if (!food) throw new NotFoundException('Food not found');
    return food;
  }

  async createCustom(userId: string, dto: CreateCustomFoodDto): Promise<Food> {
    return this.prisma.food.create({
      data: {
        name: dto.name,
        source: FoodSource.CUSTOM,
        createdByUserId: userId,
        groupId: dto.groupId,
        kcalPer100g: dto.kcalPer100g,
        proteinPer100g: dto.proteinPer100g,
        carbsPer100g: dto.carbsPer100g,
        fatPer100g: dto.fatPer100g,
      },
    });
  }

  async updateCustom(userId: string, id: number, dto: UpdateCustomFoodDto): Promise<Food> {
    const food = await this.prisma.food.findUnique({ where: { id } });
    if (!food) throw new NotFoundException('Food not found');
    if (food.source !== FoodSource.CUSTOM || food.createdByUserId !== userId) {
      throw new ForbiddenException('Cannot edit this food');
    }
    return this.prisma.food.update({ where: { id }, data: dto });
  }

  async deleteCustom(userId: string, id: number): Promise<void> {
    const food = await this.prisma.food.findUnique({ where: { id } });
    if (!food) throw new NotFoundException('Food not found');
    if (food.source !== FoodSource.CUSTOM || food.createdByUserId !== userId) {
      throw new ForbiddenException('Cannot delete this food');
    }
    await this.prisma.food.delete({ where: { id } });
  }

  async listGroups() {
    return this.prisma.foodGroup.findMany({ orderBy: { name: 'asc' } });
  }
}
