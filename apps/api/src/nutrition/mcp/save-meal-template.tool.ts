import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { MealType } from '@prisma/client';
import { MealTemplateService } from '../meal-template.service';
import { MAX_TEMPLATE_ITEMS, MAX_TEMPLATE_NAME } from '../dto/meal-template.dto';
import type { MealItemInputDto } from '../dto/meal.dto';
import { mealItemSchema } from './log-meal.tool';
import {
  McpTool,
  type McpToolContext,
  type McpToolDef,
} from '../../common/decorators/tool.decorator';

@Injectable()
@McpTool()
export class SaveMealTemplateTool implements McpToolDef {
  constructor(private readonly templates: MealTemplateService) {}
  readonly name = 'save_meal_template';
  readonly title = 'Salvar refeição';
  readonly annotations = { readOnlyHint: false, destructiveHint: false, confirmableHint: true };
  readonly hostedInference = false;
  readonly description =
    'Salva uma refeição para registrar de novo depois. Use mealId (copia uma refeição registrada) ou items (como em log_meal), um dos dois. Nome único. ' +
    'Exemplo: {"name":"Café de sempre","mealId":"11111111-2222-4333-8444-555555555555"}';
  readonly inputSchema = {
    name: z.string().min(1).max(MAX_TEMPLATE_NAME).describe('Nome, ex.: "Café de sempre"'),
    mealId: z.string().uuid().optional().describe('Refeição registrada a salvar'),
    mealType: z.nativeEnum(MealType).optional().describe('Tipo sugerido ao registrar'),
    items: z
      .array(mealItemSchema)
      .min(1)
      .max(MAX_TEMPLATE_ITEMS)
      .optional()
      .describe('Itens, no formato de log_meal'),
  } as const;
  execute(
    input: { name: string; mealId?: string; mealType?: MealType; items?: MealItemInputDto[] },
    { userId }: McpToolContext,
  ) {
    return this.templates.create(userId, input);
  }
}
