import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { McpTool, type McpToolContext } from '../../../common/decorators/tool.decorator';
import { MealItemService } from '../../../nutrition/meal-item.service';
import { MealService } from '../../../nutrition/meal.service';
import { escolherPorNome, IntentTool, resolverDia } from '../composicao';
import type { IntentInput } from '../intent-surface';

/** Só o que veio: o `update_*` de entidade também muda só o campo enviado. */
function definidos<T extends Record<string, unknown>>(campos: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(campos).filter(([, v]) => v !== undefined),
  ) as Partial<T>;
}

/**
 * A refeição pelo dia e pelo tipo (`list_meals`, que já traz os itens), o item pelo nome
 * dentro dela, e o `update_meal_item` / `update_meal` com só os campos enviados. Nunca apaga:
 * tirar um item é `delete_meal_item`, que é destrutiva e fica igual nos dois braços.
 */
@Injectable()
@McpTool()
export class FixMealTool extends IntentTool<'fix_meal'> {
  constructor(
    private readonly meals: MealService,
    private readonly mealItems: MealItemService,
  ) {
    super('fix_meal');
  }

  async execute(input: IntentInput<'fix_meal'>, { userId, timezone }: McpToolContext) {
    const date = resolverDia(input.day, timezone);
    const doDia = await this.meals.list(userId, { date, limit: 50 }, timezone); // list_meals
    const candidatas = doDia.filter((m) => m.mealType === input.mealType);
    if (candidatas.length === 0) {
      throw new NotFoundException(`Nenhuma refeição ${input.mealType} em ${date}.`);
    }
    if (candidatas.length > 1) {
      throw new BadRequestException(
        `Há ${candidatas.length} refeições ${input.mealType} em ${date} ` +
          `(${candidatas.map((m) => m.eatenAt.toISOString()).join(', ')}). ` +
          'Use find_meals e corrija pelo id com as tools de refeição.',
      );
    }
    const [meal] = candidatas;

    const doItem = definidos({
      grams: input.grams,
      kcal: input.kcal,
      proteinG: input.proteinG,
      carbsG: input.carbsG,
      fatG: input.fatG,
    });
    const daRefeicao = definidos({
      mealType: input.newMealType,
      eatenAt: input.eatenAt,
      notes: input.notes,
    });
    if (Object.keys(doItem).length > 0 && input.item === undefined) {
      throw new BadRequestException('Porção e macros mudam um item: diga qual em `item`.');
    }
    if (Object.keys(doItem).length === 0 && Object.keys(daRefeicao).length === 0) {
      throw new BadRequestException(
        'Nada a corrigir: envie a porção, os macros ou um campo da refeição.',
      );
    }

    let item: unknown = undefined;
    if (input.item !== undefined && Object.keys(doItem).length > 0) {
      const alvo = escolherPorNome(input.item, meal.items, (i) => i.foodName, 'item na refeição');
      item = await this.mealItems.update(userId, alvo.id, doItem); // update_meal_item
    }
    const atualizada =
      Object.keys(daRefeicao).length > 0
        ? await this.meals.update(userId, meal.id, daRefeicao) // update_meal
        : undefined;
    return {
      mealId: meal.id,
      ...(item !== undefined && { item }),
      ...(atualizada && { meal: atualizada }),
    };
  }
}
