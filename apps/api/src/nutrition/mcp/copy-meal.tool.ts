import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { MealType } from '@prisma/client';
import { MealCopyService } from '../meal-copy.service';
import { YMD } from '../dto/meal-template.dto';
import {
  McpTool,
  type McpToolContext,
  type McpToolDef,
} from '../../common/decorators/tool.decorator';

@Injectable()
@McpTool()
export class CopyMealTool implements McpToolDef {
  constructor(private readonly copies: MealCopyService) {}
  readonly name = 'copy_meal';
  readonly title = 'Copiar refeição';
  readonly annotations = { readOnlyHint: false, destructiveHint: false, confirmableHint: true };
  readonly hostedInference = false;
  readonly description =
    'Copia uma refeição para outro dia, no mesmo horário local e com os mesmos itens. Repetir não duplica (409). ' +
    'Exemplo: {"mealId":"11111111-2222-4333-8444-555555555555","toDate":"2026-07-30"}';
  readonly inputSchema = {
    mealId: z.string().uuid().describe('ID da refeição de origem (list_meals)'),
    toDate: z.string().regex(YMD).describe('Dia de destino, YYYY-MM-DD'),
    mealType: z
      .nativeEnum(MealType)
      .optional()
      .describe('Outro tipo para a cópia; default o da origem'),
  } as const;
  execute(
    input: { mealId: string; toDate: string; mealType?: MealType },
    { userId, timezone }: McpToolContext,
  ) {
    return this.copies.copyMeal(
      userId,
      input.mealId,
      { toDate: input.toDate, mealType: input.mealType },
      timezone,
    );
  }
}
