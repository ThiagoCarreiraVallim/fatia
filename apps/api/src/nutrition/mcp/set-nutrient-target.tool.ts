import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { NutrientTargetService } from '../nutrient-target.service';
import {
  McpTool,
  type McpToolContext,
  type McpToolDef,
} from '../../common/decorators/tool.decorator';

@Injectable()
@McpTool()
export class SetNutrientTargetTool implements McpToolDef {
  constructor(private readonly targets: NutrientTargetService) {}
  readonly name = 'set_nutrient_target';
  readonly description =
    'Cria/atualiza uma meta de nutriente personalizada (ex.: limitar sódio a 2000mg/dia). `nutrientKey` é a chave usada nos itens (ex.: "sodium_mg"). Informe `max` para limite e/ou `min` para meta mínima. Upsert por nutrientKey.';
  readonly inputSchema = {
    nutrientKey: z.string().max(40).describe('Ex.: "sodium_mg", "sugar_g", "fiber_g"'),
    label: z.string().max(40).describe('Ex.: "Sódio"'),
    unit: z.string().max(12).describe('Ex.: "mg", "g"'),
    min: z.number().min(0).optional(),
    max: z.number().min(0).optional(),
    period: z.literal('daily').optional(),
  } as const;
  execute(
    input: {
      nutrientKey: string;
      label: string;
      unit: string;
      min?: number;
      max?: number;
      period?: 'daily';
    },
    { userId }: McpToolContext,
  ) {
    return this.targets.upsert(userId, input);
  }
}
