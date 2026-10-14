import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { MealType } from '@prisma/client';
import { MealTemplateService } from '../meal-template.service';
import {
  McpTool,
  type McpToolContext,
  type McpToolDef,
} from '../../common/decorators/tool.decorator';

@Injectable()
@McpTool()
export class LogMealTemplateTool implements McpToolDef {
  constructor(private readonly templates: MealTemplateService) {}
  readonly name = 'log_meal_template';
  readonly title = 'Registrar refeição salva';
  readonly annotations = { readOnlyHint: false, destructiveHint: false, confirmableHint: true };
  readonly hostedInference = false;
  readonly description =
    'Registra uma refeição salva (list_meal_templates) como refeição nova. ' +
    'Exemplo: {"templateId":"11111111-2222-4333-8444-555555555555","eatenAt":"2026-07-29T08:00:00-03:00"}';
  readonly inputSchema = {
    templateId: z.string().uuid().describe('ID da refeição salva'),
    eatenAt: z.string().describe('Quando comeu, ISO 8601 com offset'),
    mealType: z
      .nativeEnum(MealType)
      .optional()
      .describe('Tipo; default o da refeição salva, senão SNACK'),
  } as const;
  execute(
    input: { templateId: string; eatenAt: string; mealType?: MealType },
    { userId }: McpToolContext,
  ) {
    return this.templates.log(userId, input.templateId, {
      eatenAt: input.eatenAt,
      mealType: input.mealType,
    });
  }
}
