import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { MealService } from '../meal.service';
import {
  McpTool,
  type McpToolContext,
  type McpToolDef,
} from '../../common/decorators/tool.decorator';

const TIPO_DA_REFEICAO: Record<string, string> = {
  BREAKFAST: 'Café da manhã',
  LUNCH: 'Almoço',
  DINNER: 'Jantar',
  SNACK: 'Lanche',
};

@Injectable()
@McpTool()
export class ListMealsTool implements McpToolDef {
  constructor(private readonly meals: MealService) {}
  readonly name = 'list_meals';
  readonly title = 'Listar refeições';
  readonly annotations = { readOnlyHint: true, destructiveHint: false, confirmableHint: false };
  readonly hostedInference = false;
  readonly description = 'Lista refeições do usuário (cursor pagination).';
  readonly inputSchema = {
    date: z.string().optional().describe('YYYY-MM-DD para filtrar pelo dia'),
    cursor: z
      .string()
      .optional()
      .describe('ID da última refeição da página anterior, para paginar'),
    limit: z
      .number()
      .int()
      .min(1)
      .max(50)
      .optional()
      .describe('Quantas refeições retornar (default 20, máx 50)'),
  } as const;
  execute(
    input: { date?: string; cursor?: string; limit?: number },
    { userId, timezone }: McpToolContext,
  ) {
    return this.meals.list(userId, input, timezone);
  }
  artifact(result: unknown) {
    const refeicoes = result as Awaited<ReturnType<MealService['list']>>;
    return {
      kind: 'report',
      label: 'Refeições',
      columns: ['Refeição', 'Quando', 'kcal', 'Proteína (g)'],
      rows: refeicoes.map((refeicao) => [
        TIPO_DA_REFEICAO[refeicao.mealType] ?? refeicao.mealType,
        refeicao.eatenAt.toISOString(),
        Math.round(refeicao.items.reduce((total, item) => total + item.kcal, 0)),
        Math.round(refeicao.items.reduce((total, item) => total + item.proteinG, 0)),
      ]),
    };
  }
}
