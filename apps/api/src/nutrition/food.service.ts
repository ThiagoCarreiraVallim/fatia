import { Injectable, NotFoundException } from '@nestjs/common';
import { FoodSource, type Food } from '@prisma/client';
import { PrismaService } from '../common/prisma.service';
import type { CreateCustomFoodDto, SearchFoodDto, UpdateCustomFoodDto } from './dto/food.dto';
import { normalizeSearchText, rankByRelevance } from '../common/search-text';

@Injectable()
export class FoodService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Busca alimentos no catálogo público (TACO/USDA) + customs do usuário.
   *
   * O filtro roda sobre `searchName` (sem acento, sem pontuação) para que
   * "feijao" ache "Feijão" — no teclado do celular ninguém acentua.
   *
   * Quando há termo, o `take` do banco é omitido de propósito e o corte acontece
   * depois do ranqueamento: limitar antes traria os 20 primeiros **em ordem
   * alfabética** e o melhor resultado poderia ficar de fora. O conjunto filtrado
   * de um termo real é pequeno, e o catálogo inteiro tem centenas de linhas, não
   * milhões.
   */
  async search(userId: string, params: SearchFoodDto): Promise<Food[]> {
    const limit = Math.min(params.limit ?? 20, 50);
    const term = params.q ? normalizeSearchText(params.q) : '';

    const matches = await this.prisma.food.findMany({
      where: {
        AND: [
          { OR: [{ createdByUserId: null }, { createdByUserId: userId }] },
          term ? { searchName: { contains: term } } : {},
          params.groupId ? { groupId: params.groupId } : {},
        ],
      },
      orderBy: [{ name: 'asc' }],
      ...(term ? {} : { take: limit }),
    });

    return term ? rankByRelevance(matches, term, (food) => food.name, limit) : matches;
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
        searchName: normalizeSearchText(dto.name),
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
    // Alimento de outro usuário responde igual a inexistente. Os IDs de Food são
    // inteiros sequenciais, então distinguir "existe mas não é seu" de "não
    // existe" permitiria enumerar o catálogo privado alheio (#92).
    if (!food || food.source !== FoodSource.CUSTOM || food.createdByUserId !== userId) {
      throw new NotFoundException('Food not found');
    }
    return this.prisma.food.update({
      where: { id },
      // `searchName` acompanha o nome — se ficar para trás, a busca continua
      // achando o alimento pelo nome antigo e não pelo novo.
      data: { ...dto, ...(dto.name ? { searchName: normalizeSearchText(dto.name) } : {}) },
    });
  }

  async deleteCustom(userId: string, id: number): Promise<void> {
    const food = await this.prisma.food.findUnique({ where: { id } });
    // Ver updateCustom: resposta indistinguível para não permitir enumeração.
    if (!food || food.source !== FoodSource.CUSTOM || food.createdByUserId !== userId) {
      throw new NotFoundException('Food not found');
    }
    await this.prisma.food.delete({ where: { id } });
  }

  async listGroups() {
    return this.prisma.foodGroup.findMany({ orderBy: { name: 'asc' } });
  }
}
