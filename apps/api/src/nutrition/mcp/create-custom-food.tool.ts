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
export class CreateCustomFoodTool implements McpToolDef {
  constructor(private readonly foods: FoodService) {}
  readonly name = 'create_custom_food';
  readonly title = 'Criar alimento personalizado';
  readonly annotations = { readOnlyHint: false, destructiveHint: false };
  readonly description =
    'Cria um alimento custom para o usuário. ' +
    'Exemplo: {"name":"Pão de queijo assado","kcalPer100g":330,"proteinPer100g":8.5,"carbsPer100g":34,"fatPer100g":18}';
  readonly inputSchema = {
    name: z.string().min(1).max(160).describe('Nome do alimento (ex.: "Whey chocolate marca X")'),
    groupId: z
      .number()
      .int()
      .optional()
      .describe('ID do grupo alimentar. Use list_food_groups para obter os IDs'),
    kcalPer100g: z.number().min(0).describe('Calorias por 100 g'),
    proteinPer100g: z.number().min(0).describe('Proteína em gramas por 100 g'),
    carbsPer100g: z.number().min(0).describe('Carboidratos em gramas por 100 g'),
    fatPer100g: z.number().min(0).describe('Gordura em gramas por 100 g'),
  } as const;
  execute(
    input: {
      name: string;
      groupId?: number;
      kcalPer100g: number;
      proteinPer100g: number;
      carbsPer100g: number;
      fatPer100g: number;
    },
    { userId }: McpToolContext,
  ) {
    return this.foods.createCustom(userId, input);
  }
}
