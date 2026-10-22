import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { dateInTz, dayBoundsInTz, sameLocalTimeOn } from '../progress/helpers/date-tz';
import { MealService } from './meal.service';
import { snapshotOf } from './helpers/meal-snapshot';
import type { CopyMealDto } from './dto/meal-template.dto';
import { assertDay } from '../common/dates';

type Meal = Awaited<ReturnType<MealService['findById']>>;

/**
 * "Comi o mesmo de ontem": copia uma refeição, ou o dia inteiro, para outro dia.
 *
 * A cópia leva o **retrato** dos itens (macros, micronutrientes e a medida em que
 * foram digitados), sem recalcular, e cai no mesmo horário local. Passa pela
 * guarda de duplicata do `MealService`: copiar duas vezes para o mesmo dia não
 * grava duas vezes, o que deixa o botão seguro contra toque duplo e o MCP seguro
 * contra retry.
 */
@Injectable()
export class MealCopyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly meals: MealService,
  ) {}

  async copyMeal(
    userId: string,
    mealId: string,
    dto: CopyMealDto,
    timezone: string,
  ): Promise<Meal> {
    assertDay(dto.toDate, 'toDate');
    const source = await this.meals.findById(userId, mealId);
    if (source.items.length === 0) {
      throw new BadRequestException('A refeição está vazia: não há o que copiar.');
    }
    const mealType = dto.mealType ?? source.mealType;
    if (dateInTz(source.eatenAt, timezone) === dto.toDate && mealType === source.mealType) {
      throw new BadRequestException('A refeição já está nesse dia.');
    }
    try {
      return await this.copy(userId, source, dto.toDate, timezone, mealType);
    } catch (error) {
      if (error instanceof ConflictException) {
        throw new ConflictException(`Essa refeição já foi copiada para ${dto.toDate}.`);
      }
      throw error;
    }
  }

  /**
   * Copia as refeições de um dia para outro. As que já estão no destino (mesmo
   * tipo, horário e itens) ficam de fora e entram na contagem `skipped`; refazer
   * a cópia completa o que faltou sem duplicar o que já foi.
   */
  async copyDay(
    userId: string,
    fromDate: string,
    toDate: string,
    timezone: string,
  ): Promise<{ created: Meal[]; skipped: number }> {
    assertDay(fromDate, 'fromDate');
    assertDay(toDate, 'toDate');
    if (fromDate === toDate) {
      throw new BadRequestException('Escolha um dia diferente do de origem.');
    }
    const { start, end } = dayBoundsInTz(fromDate, timezone);
    const sources = await this.prisma.meal.findMany({
      where: { userId, eatenAt: { gte: start, lt: end } },
      include: { items: true },
      orderBy: { eatenAt: 'asc' },
    });
    const withItems = sources.filter((meal) => meal.items.length > 0);
    if (withItems.length === 0) {
      throw new NotFoundException(`Nenhuma refeição em ${fromDate} para copiar.`);
    }

    const created: Meal[] = [];
    let skipped = 0;
    for (const source of withItems) {
      try {
        created.push(await this.copy(userId, source, toDate, timezone, source.mealType));
      } catch (error) {
        if (!(error instanceof ConflictException)) throw error;
        skipped += 1;
      }
    }
    return { created, skipped };
  }

  private copy(
    userId: string,
    source: Meal,
    toDate: string,
    timezone: string,
    mealType: Meal['mealType'],
  ) {
    return this.meals.createResolved(
      userId,
      {
        mealType,
        eatenAt: sameLocalTimeOn(source.eatenAt, toDate, timezone),
        notes: source.notes ?? undefined,
      },
      source.items.map(snapshotOf),
    );
  }
}
