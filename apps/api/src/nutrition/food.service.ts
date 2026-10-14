import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { FoodSource, Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma.service';
import type { CreateCustomFoodDto, SearchFoodDto, UpdateCustomFoodDto } from './dto/food.dto';
import { normalizeSearchText, rankByRelevance } from '../common/search-text';
import { includePortions, withPortionViews, type FoodWithPortions } from './helpers/portion';

export type { FoodWithPortions } from './helpers/portion';

/** Teto físico por 100 g: gordura pura dá 900 kcal, e os macros não pesam mais que o alimento. */
export const MAX_KCAL_PER_100G = 900;
export const MAX_MACROS_PER_100G = 100;

interface Per100g {
  kcalPer100g: number;
  proteinPer100g: number;
  carbsPer100g: number;
  fatPer100g: number;
}

const MACROS = [
  ['proteinPer100g', 'Proteína'],
  ['carbsPer100g', 'Carboidrato'],
  ['fatPer100g', 'Gordura'],
] as const;

/**
 * Recusa o que não cabe em 100 g. Sem isso, um "1000" digitado no lugar de "100"
 * vira um alimento que estraga o total de toda refeição em que entrar.
 */
function assertPlausible(values: Per100g): void {
  if (values.kcalPer100g > MAX_KCAL_PER_100G) {
    throw new BadRequestException(`Calorias passam de ${MAX_KCAL_PER_100G} kcal em 100 g.`);
  }
  for (const [key, label] of MACROS) {
    if (values[key] > MAX_MACROS_PER_100G) {
      throw new BadRequestException(`${label} passa de ${MAX_MACROS_PER_100G} g em 100 g.`);
    }
  }
  const total = values.proteinPer100g + values.carbsPer100g + values.fatPer100g;
  if (total > MAX_MACROS_PER_100G) {
    throw new BadRequestException(
      `Proteína, carboidrato e gordura somam mais de ${MAX_MACROS_PER_100G} g em 100 g.`,
    );
  }
}

function trimmedName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) throw new BadRequestException('Dê um nome ao alimento.');
  return trimmed;
}

/** A única unique de `Food` que a pessoa alcança é `[name, source, createdByUserId]`. */
function isDuplicateName(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
}

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
  async search(userId: string, params: SearchFoodDto): Promise<FoodWithPortions[]> {
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
      include: includePortions(userId),
      ...(term ? {} : { take: limit }),
    });

    const ranked = term ? rankByRelevance(matches, term, (food) => food.name, limit) : matches;
    return ranked.map((food) => withPortionViews(food, userId));
  }

  async get(userId: string, id: number): Promise<FoodWithPortions> {
    const food = await this.prisma.food.findFirst({
      where: {
        id,
        OR: [{ createdByUserId: null }, { createdByUserId: userId }],
      },
      include: includePortions(userId),
    });
    if (!food) throw new NotFoundException('Food not found');
    return withPortionViews(food, userId);
  }

  async createCustom(userId: string, dto: CreateCustomFoodDto): Promise<FoodWithPortions> {
    const name = trimmedName(dto.name);
    assertPlausible(dto);
    await this.assertGroupExists(dto.groupId);

    const food = await this.prisma.food
      .create({
        data: {
          name,
          searchName: normalizeSearchText(name),
          source: FoodSource.CUSTOM,
          createdByUserId: userId,
          groupId: dto.groupId,
          kcalPer100g: dto.kcalPer100g,
          proteinPer100g: dto.proteinPer100g,
          carbsPer100g: dto.carbsPer100g,
          fatPer100g: dto.fatPer100g,
          ...(dto.portions?.length
            ? {
                portions: {
                  create: dto.portions.map((p) => ({
                    label: p.label.trim(),
                    grams: p.grams,
                    createdByUserId: userId,
                  })),
                },
              }
            : {}),
        },
        include: includePortions(userId),
      })
      .catch((err: unknown) => {
        throw this.duplicateOr(err, name);
      });
    return withPortionViews(food, userId);
  }

  async updateCustom(
    userId: string,
    id: number,
    dto: UpdateCustomFoodDto,
  ): Promise<FoodWithPortions> {
    const food = await this.prisma.food.findUnique({ where: { id } });
    // Alimento de outro usuário responde igual a inexistente. Os IDs de Food são
    // inteiros sequenciais, então distinguir "existe mas não é seu" de "não
    // existe" permitiria enumerar o catálogo privado alheio (#92).
    if (!food || food.source !== FoodSource.CUSTOM || food.createdByUserId !== userId) {
      throw new NotFoundException('Food not found');
    }
    const name = dto.name === undefined ? undefined : trimmedName(dto.name);
    // A soma dos macros vale para o alimento inteiro: o que não veio fica como está.
    assertPlausible({
      kcalPer100g: dto.kcalPer100g ?? food.kcalPer100g,
      proteinPer100g: dto.proteinPer100g ?? food.proteinPer100g,
      carbsPer100g: dto.carbsPer100g ?? food.carbsPer100g,
      fatPer100g: dto.fatPer100g ?? food.fatPer100g,
    });
    await this.assertGroupExists(dto.groupId);

    const updated = await this.prisma.food
      .update({
        where: { id },
        // `searchName` acompanha o nome — se ficar para trás, a busca continua
        // achando o alimento pelo nome antigo e não pelo novo.
        data: { ...dto, ...(name ? { name, searchName: normalizeSearchText(name) } : {}) },
        include: includePortions(userId),
      })
      .catch((err: unknown) => {
        throw this.duplicateOr(err, name ?? food.name);
      });
    return withPortionViews(updated, userId);
  }

  async deleteCustom(userId: string, id: number): Promise<void> {
    const food = await this.prisma.food.findUnique({ where: { id } });
    // Ver updateCustom: resposta indistinguível para não permitir enumeração.
    if (!food || food.source !== FoodSource.CUSTOM || food.createdByUserId !== userId) {
      throw new NotFoundException('Food not found');
    }
    await this.prisma.food.delete({ where: { id } });
  }

  /** Os alimentos que a pessoa cadastrou, para a tela "Meus alimentos". */
  async listCustom(userId: string): Promise<FoodWithPortions[]> {
    const foods = await this.prisma.food.findMany({
      where: { source: FoodSource.CUSTOM, createdByUserId: userId },
      orderBy: { name: 'asc' },
      include: includePortions(userId),
    });
    return foods.map((food) => withPortionViews(food, userId));
  }

  /** Grupo inexistente estouraria a chave estrangeira como 500. */
  private async assertGroupExists(groupId: number | undefined): Promise<void> {
    if (groupId === undefined) return;
    const group = await this.prisma.foodGroup.findUnique({ where: { id: groupId } });
    if (!group) throw new BadRequestException('Grupo de alimento inexistente.');
  }

  private duplicateOr(err: unknown, name: string): unknown {
    return isDuplicateName(err)
      ? new ConflictException(`Você já tem um alimento chamado "${name}".`)
      : err;
  }

  async listGroups() {
    return this.prisma.foodGroup.findMany({ orderBy: { name: 'asc' } });
  }
}
