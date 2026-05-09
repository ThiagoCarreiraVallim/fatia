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
  readonly description = 'Cria um alimento custom para o usuário.';
  readonly inputSchema = {
    name: z.string().min(1).max(160),
    groupId: z.number().int().optional(),
    kcalPer100g: z.number().min(0),
    proteinPer100g: z.number().min(0),
    carbsPer100g: z.number().min(0),
    fatPer100g: z.number().min(0),
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
