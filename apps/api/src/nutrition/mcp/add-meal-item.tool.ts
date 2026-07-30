import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { MealItemService } from '../meal-item.service';
import {
  McpTool,
  type McpToolContext,
  type McpToolDef,
} from '../../common/decorators/tool.decorator';

@Injectable()
@McpTool()
export class AddMealItemTool implements McpToolDef {
  constructor(private readonly mealItems: MealItemService) {}
  readonly name = 'add_meal_item';
  readonly description =
    'Adiciona um item a uma refeição existente. `nutrients` aceita micronutrientes opcionais por chave (ex.: { "sodium_mg": 412, "sugar_g": 9 }) para metas personalizadas.';
  readonly inputSchema = {
    mealId: z.string().uuid().describe('ID da refeição que vai receber o item'),
    foodId: z
      .number()
      .int()
      .optional()
      .describe('ID do alimento no catálogo (TACO ou custom). Omita para item livre'),
    foodName: z
      .string()
      .optional()
      .describe(
        'Nome do alimento. Obrigatório quando não há foodId; senão vira snapshot do catálogo',
      ),
    grams: z.number().min(0.1).describe('Quantidade consumida em gramas'),
    kcal: z
      .number()
      .min(0)
      .optional()
      .describe('Calorias do item. Derivado do catálogo quando há foodId'),
    proteinG: z.number().min(0).optional().describe('Proteína em gramas'),
    carbsG: z.number().min(0).optional().describe('Carboidratos em gramas'),
    fatG: z.number().min(0).optional().describe('Gordura em gramas'),
    nutrients: z
      .record(z.number())
      .optional()
      .describe('Micronutrientes por chave, ex.: { "sodium_mg": 412, "sugar_g": 9 }'),
    groupId: z
      .number()
      .int()
      .optional()
      .describe('ID do grupo alimentar. Copiado do alimento quando há foodId'),
  } as const;
  execute(
    { mealId, ...item }: { mealId: string; grams: number } & Record<string, unknown>,
    { userId }: McpToolContext,
  ) {
    return this.mealItems.add(userId, mealId, item as never);
  }
}
