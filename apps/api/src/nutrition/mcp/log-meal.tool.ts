import { Injectable } from '@nestjs/common';
import { TIPO_DA_REFEICAO } from './list-meals.tool';
import { z } from 'zod';
import { MealItemSource, MealType } from '@prisma/client';
import { MealService } from '../meal.service';
import { MAX_PORTION_QUANTITY, MIN_PORTION_QUANTITY } from '../dto/meal.dto';
import {
  McpTool,
  type McpToolContext,
  type McpToolDef,
} from '../../common/decorators/tool.decorator';

export const mealItemSchema = z.object({
  foodId: z.number().int().optional(),
  foodName: z.string().optional(),
  grams: z.number().min(0.1).optional(),
  portionId: z.string().uuid().optional(),
  quantity: z.number().min(MIN_PORTION_QUANTITY).max(MAX_PORTION_QUANTITY).optional(),
  kcal: z.number().min(0).optional(),
  proteinG: z.number().min(0).optional(),
  carbsG: z.number().min(0).optional(),
  fatG: z.number().min(0).optional(),
  nutrients: z.record(z.number()).optional(),
  groupId: z.number().int().optional(),
  source: z
    .nativeEnum(MealItemSource)
    .optional()
    .describe(
      'De onde veio o item: AI (você estimou, por foto ou descrição), MANUAL (a pessoa deu o valor exato), ' +
        'BARCODE (código de barras ou rótulo) ou PLAN (do plano alimentar). Padrão AI',
    ),
});

/**
 * Item que chega pelo MCP foi registrado por uma IA: sem origem dita, é `AI`
 * (#374), e a refeição aparece com o selo "IA" na tela.
 */
export function withAiSource<T extends { source?: MealItemSource }>(items: T[]): T[] {
  return items.map((item) => ({ ...item, source: item.source ?? MealItemSource.AI }));
}

@Injectable()
@McpTool()
export class LogMealTool implements McpToolDef {
  constructor(private readonly meals: MealService) {}
  readonly name = 'log_meal';
  readonly title = 'Registrar refeição';
  readonly annotations = { readOnlyHint: false, destructiveHint: false, confirmableHint: true };
  readonly hostedInference = false;
  readonly card = 'confirm' as const;
  readonly aiCategory = 'DAY_LOG' as const;
  readonly description =
    'Registra uma refeição com items. Cada item pode referenciar foodId (TACO/custom) ou ser livre (foodName + macros estimados). ' +
    'Cada item aceita source (origem: AI, MANUAL, BARCODE ou PLAN; padrão AI). A resposta diz hasPhoto, nunca o arquivo. ' +
    'Exemplo (item do catálogo): {"mealType":"LUNCH","eatenAt":"2026-07-29T12:30:00-03:00","items":[{"foodId":312,"grams":150}]} ' +
    'Em vez de grams, um item do catálogo aceita portionId + quantity (medidas em get_food). ' +
    'Exemplo (item livre): {"mealType":"SNACK","eatenAt":"2026-07-29T16:00:00-03:00","items":[{"foodName":"Pão de queijo","grams":80,"kcal":264,"proteinG":6.8,"carbsG":27.2,"fatG":14.4}]}';
  readonly inputSchema = {
    mealType: z
      .nativeEnum(MealType)
      .describe('Tipo da refeição: BREAKFAST, LUNCH, DINNER ou SNACK'),
    eatenAt: z
      .string()
      .describe('Quando a refeição foi consumida, em ISO 8601 (ex.: 2026-07-29T12:30:00-03:00)'),
    notes: z.string().max(500).optional().describe('Observações livres sobre a refeição'),
    items: z
      .array(mealItemSchema)
      .min(1)
      .describe(
        'Itens da refeição — pelo menos um. Cada item: foodId do catálogo ou foodName + macros estimados',
      ),
  } as const;
  execute(
    input: {
      mealType: MealType;
      eatenAt: string;
      notes?: string;
      items: z.infer<typeof mealItemSchema>[];
    },
    { userId }: McpToolContext,
  ) {
    return this.meals.create(userId, { ...input, items: withAiSource(input.items) });
  }

  /** O que foi gravado, item por item: é o que a pessoa confere depois de aprovar. */
  artifact(result: unknown) {
    const refeicao = result as Awaited<ReturnType<MealService['create']>>;
    return {
      kind: 'report',
      label: `${TIPO_DA_REFEICAO[refeicao.mealType] ?? 'Refeição'} registrado`,
      columns: ['Alimento', 'g', 'kcal', 'Proteína (g)'],
      rows: refeicao.items.map((item) => [
        item.foodName,
        Math.round(item.grams),
        Math.round(item.kcal),
        Math.round(item.proteinG),
      ]),
    };
  }
}
