import { Injectable } from '@nestjs/common';
import { McpTool, type McpToolContext } from '../../../common/decorators/tool.decorator';
import { normalizeSearchText } from '../../../common/search-text';
import { MealService } from '../../../nutrition/meal.service';
import { IntentTool, resolverDia } from '../composicao';
import type { IntentInput } from '../intent-surface';

/** O teto do `list_meals`: sem dia, as refeições mais recentes até ele. */
const LIMITE = 50;

/**
 * `list_meals` já traz os itens de cada refeição — o `get_meal` que o contrato lista como
 * perna seria a mesma leitura de novo. Os filtros por tipo e por alimento recortam a lista
 * que a perna devolveu.
 */
@Injectable()
@McpTool()
export class FindMealsTool extends IntentTool<'find_meals'> {
  constructor(private readonly meals: MealService) {
    super('find_meals');
  }

  async execute(input: IntentInput<'find_meals'>, { userId, timezone }: McpToolContext) {
    const date = input.day === undefined ? undefined : resolverDia(input.day, timezone);
    const todas = await this.meals.list(userId, { date, limit: LIMITE }, timezone); // list_meals
    const alimento = input.food ? normalizeSearchText(input.food) : null;
    const meals = todas.filter(
      (meal) =>
        (input.mealType === undefined || meal.mealType === input.mealType) &&
        (alimento === null ||
          meal.items.some((item) => normalizeSearchText(item.foodName).includes(alimento))),
    );
    return { date: date ?? null, meals };
  }
}
