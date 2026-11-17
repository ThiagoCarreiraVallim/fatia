import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { FoodService } from '../food.service';
import { BARCODE_SCHEMA, NUTRIENTS_SCHEMA } from './custom-food-schema';
import {
  McpTool,
  type McpToolContext,
  type McpToolDef,
} from '../../common/decorators/tool.decorator';

@Injectable()
@McpTool()
export class UpdateCustomFoodTool implements McpToolDef {
  constructor(private readonly foods: FoodService) {}
  readonly name = 'update_custom_food';
  readonly title = 'Atualizar alimento personalizado';
  readonly annotations = { readOnlyHint: false, destructiveHint: false, confirmableHint: true };
  readonly hostedInference = false;
  readonly card = 'confirm' as const;
  readonly description =
    'Atualiza um alimento custom do usuário. nutrients troca o mapa inteiro (null apaga); ' +
    'barcode null desliga o código. Exemplo: {"id":4217,"kcalPer100g":315,"nutrients":{"fiber_g":3}}';
  readonly inputSchema = {
    id: z.number().int().describe('ID do alimento custom a atualizar (só os seus)'),
    name: z.string().min(1).max(160).optional().describe('Novo nome do alimento'),
    groupId: z.number().int().optional().describe('Novo ID de grupo alimentar'),
    kcalPer100g: z.number().min(0).optional().describe('Novas calorias por 100 g'),
    proteinPer100g: z.number().min(0).optional().describe('Nova proteína em gramas por 100 g'),
    carbsPer100g: z.number().min(0).optional().describe('Novos carboidratos em gramas por 100 g'),
    fatPer100g: z.number().min(0).optional().describe('Nova gordura em gramas por 100 g'),
    nutrients: NUTRIENTS_SCHEMA.nullable().optional(),
    barcode: BARCODE_SCHEMA.nullable().optional(),
  } as const;
  execute({ id, ...rest }: { id: number } & Record<string, unknown>, { userId }: McpToolContext) {
    return this.foods.updateCustom(userId, id, rest);
  }
}
