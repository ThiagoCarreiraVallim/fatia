import { BadRequestException, Injectable } from '@nestjs/common';
import { McpTool, type McpToolContext } from '../../../common/decorators/tool.decorator';
import { FoodService } from '../../../nutrition/food.service';
import { MealService } from '../../../nutrition/meal.service';
import { IntentTool } from '../composicao';
import type { IntentInput } from '../intent-surface';

/**
 * Cada item é casado pelo nome com o catálogo pela mesma busca do `search_food`, e o melhor
 * resultado vira o `foodId` do `log_meal`. Sem correspondência, o item entra livre com os
 * macros informados. Sem nenhum dos dois, a refeição inteira é recusada antes de gravar —
 * gravar a metade de uma refeição aprovada inteira na tela seria pior que não gravar.
 */
@Injectable()
@McpTool()
export class RecordMealTool extends IntentTool<'record_meal'> {
  constructor(
    private readonly foods: FoodService,
    private readonly meals: MealService,
  ) {
    super('record_meal');
  }

  async execute(input: IntentInput<'record_meal'>, { userId }: McpToolContext) {
    const casamentos: Array<{ food: string; matched: { id: number; name: string } | null }> = [];
    const items = [];
    const recusados: string[] = [];

    for (const item of input.items) {
      const [melhor] = await this.foods.search(userId, { q: item.food, limit: 1 }); // search_food
      if (melhor) {
        casamentos.push({ food: item.food, matched: { id: melhor.id, name: melhor.name } });
        items.push({ foodId: melhor.id, grams: item.grams });
        continue;
      }
      const informados = [item.kcal, item.proteinG, item.carbsG, item.fatG].some(
        (v) => v !== undefined,
      );
      if (!informados) {
        recusados.push(item.food);
        continue;
      }
      casamentos.push({ food: item.food, matched: null });
      items.push({
        foodName: item.food,
        grams: item.grams,
        kcal: item.kcal,
        proteinG: item.proteinG,
        carbsG: item.carbsG,
        fatG: item.fatG,
      });
    }

    if (recusados.length > 0) {
      throw new BadRequestException(
        `Sem correspondência no catálogo e sem macros informados: ${recusados.join(', ')}. ` +
          'Informe kcal e macros desses itens, ou um nome mais próximo do catálogo. Nada foi gravado.',
      );
    }

    const meal = await this.meals.create(userId, {
      mealType: input.mealType,
      eatenAt: input.eatenAt ?? new Date().toISOString(),
      notes: input.notes,
      items,
    }); // log_meal
    return { meal, matches: casamentos };
  }
}
