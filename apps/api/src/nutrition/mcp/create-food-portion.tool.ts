import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { FoodPortionService } from '../food-portion.service';
import {
  McpTool,
  type McpToolContext,
  type McpToolDef,
} from '../../common/decorators/tool.decorator';

@Injectable()
@McpTool()
export class CreateFoodPortionTool implements McpToolDef {
  constructor(private readonly portions: FoodPortionService) {}
  readonly name = 'create_food_portion';
  readonly title = 'Criar medida caseira';
  readonly annotations = { readOnlyHint: false, destructiveHint: false, confirmableHint: true };
  readonly hostedInference = false;
  readonly description =
    'Cria uma medida caseira do usuário para um alimento (ex.: "minha concha" = 140 g), para registrar com portionId. ' +
    'Exemplo: {"foodId":312,"name":"concha","grams":140}';
  readonly inputSchema = {
    foodId: z.number().int().describe('ID do alimento, obtido via search_food'),
    name: z.string().min(1).max(40).describe('Nome da medida, ex.: "colher de sopa"'),
    grams: z.number().min(0.1).max(2000).describe('Quanto pesa uma medida, em gramas'),
  } as const;
  execute(
    { foodId, name, grams }: { foodId: number; name: string; grams: number },
    { userId }: McpToolContext,
  ) {
    return this.portions.create(userId, foodId, { label: name, grams });
  }
}
