import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { FoodService } from '../food.service';
import {
  McpTool,
  type McpToolContext,
  type McpToolDef,
} from '../../common/decorators/tool.decorator';

@Injectable()
@McpTool()
export class GetFoodTool implements McpToolDef {
  constructor(private readonly foods: FoodService) {}
  readonly name = 'get_food';
  readonly title = 'Ver alimento';
  readonly annotations = { readOnlyHint: true, destructiveHint: false, confirmableHint: false };
  readonly hostedInference = false;
  readonly card = 'metric' as const;
  readonly description = 'Detalhe de um alimento por id.';
  readonly inputSchema = {
    id: z.number().int().describe('ID do alimento no catálogo, obtido via search_food'),
  } as const;
  execute({ id }: { id: number }, { userId }: McpToolContext) {
    return this.foods.get(userId, id);
  }

  /** As calorias de 100 g, com os três macros embaixo (prancha IA-Cartoes, #384). */
  artifact(result: unknown) {
    const alimento = result as Awaited<ReturnType<FoodService['get']>>;
    return {
      kind: 'metric',
      label: `${alimento.name} (100 g)`,
      value: alimento.kcalPer100g,
      unit: 'kcal',
      breakdown: [
        { label: 'Proteína', value: alimento.proteinPer100g, unit: 'g' },
        { label: 'Carboidratos', value: alimento.carbsPer100g, unit: 'g' },
        { label: 'Gordura', value: alimento.fatPer100g, unit: 'g' },
      ],
    };
  }
}
