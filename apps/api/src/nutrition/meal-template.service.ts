import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma.service';
import { MealService, type ResolvedItem } from './meal.service';
import { snapshotOf } from './helpers/meal-snapshot';
import {
  MAX_TEMPLATE_ITEMS,
  MAX_TEMPLATES_PER_USER,
  type CreateMealTemplateDto,
  type LogMealTemplateDto,
} from './dto/meal-template.dto';

const TEMPLATE_INCLUDE = {
  items: { orderBy: { position: 'asc' } },
} satisfies Prisma.MealTemplateInclude;

export type MealTemplateWithItems = Prisma.MealTemplateGetPayload<{
  include: typeof TEMPLATE_INCLUDE;
}>;
type Meal = Awaited<ReturnType<MealService['findById']>>;

/**
 * Refeição salva: "meu café de sempre", registrado de novo em um toque.
 *
 * Guarda o retrato dos itens como na cópia de refeição (`MealCopyService`), e
 * registrar passa pelo mesmo `MealService.createResolved` — mesma guarda de
 * duplicata, mesmo formato de refeição.
 */
@Injectable()
export class MealTemplateService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly meals: MealService,
  ) {}

  list(userId: string): Promise<MealTemplateWithItems[]> {
    return this.prisma.mealTemplate.findMany({
      where: { userId },
      include: TEMPLATE_INCLUDE,
      orderBy: { name: 'asc' },
    });
  }

  /** Alheio e inexistente respondem igual (§IDs de docs/MCP.md). */
  async get(userId: string, id: string): Promise<MealTemplateWithItems> {
    const template = await this.prisma.mealTemplate.findFirst({
      where: { id, userId },
      include: TEMPLATE_INCLUDE,
    });
    if (!template) throw new NotFoundException('Meal template not found');
    return template;
  }

  async create(userId: string, dto: CreateMealTemplateDto): Promise<MealTemplateWithItems> {
    const name = dto.name.trim();
    if (!name) throw new BadRequestException('Dê um nome à refeição salva.');
    if ((dto.mealId === undefined) === (dto.items === undefined)) {
      throw new BadRequestException('Informe mealId ou items, um dos dois.');
    }
    const total = await this.prisma.mealTemplate.count({ where: { userId } });
    if (total >= MAX_TEMPLATES_PER_USER) {
      throw new BadRequestException(
        `Limite de ${MAX_TEMPLATES_PER_USER} refeições salvas. Apague uma para salvar outra.`,
      );
    }

    let items: ResolvedItem[];
    let mealType = dto.mealType ?? null;
    if (dto.mealId !== undefined) {
      const meal = await this.meals.findById(userId, dto.mealId);
      items = meal.items.map(snapshotOf);
      mealType = dto.mealType ?? meal.mealType;
    } else {
      items = await this.meals.resolveItems(userId, dto.items ?? []);
    }
    if (items.length === 0) throw new BadRequestException('A refeição está vazia.');
    if (items.length > MAX_TEMPLATE_ITEMS) {
      throw new BadRequestException(`Uma refeição salva tem até ${MAX_TEMPLATE_ITEMS} itens.`);
    }

    try {
      return await this.prisma.mealTemplate.create({
        data: {
          userId,
          name,
          mealType,
          items: { create: items.map((item, position) => ({ ...item, position })) },
        },
        include: TEMPLATE_INCLUDE,
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException(`Já existe uma refeição salva chamada "${name}".`);
      }
      throw error;
    }
  }

  async remove(userId: string, id: string): Promise<void> {
    const { count } = await this.prisma.mealTemplate.deleteMany({ where: { id, userId } });
    if (count === 0) throw new NotFoundException('Meal template not found');
  }

  async log(userId: string, id: string, dto: LogMealTemplateDto): Promise<Meal> {
    const template = await this.get(userId, id);
    return this.meals.createResolved(
      userId,
      {
        mealType: dto.mealType ?? template.mealType ?? 'SNACK',
        eatenAt: new Date(dto.eatenAt),
      },
      template.items.map(snapshotOf),
    );
  }
}
