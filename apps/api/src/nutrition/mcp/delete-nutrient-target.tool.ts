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
export class DeleteNutrientTargetTool implements McpToolDef {
  constructor(private readonly targets: NutrientTargetService) {}
  readonly name = 'delete_nutrient_target';
  readonly title = 'Excluir meta de nutriente';
  readonly annotations = { readOnlyHint: false, destructiveHint: true };
  readonly description = 'Remove uma meta de nutriente personalizada pelo nutrientKey.';
  readonly inputSchema = {
    nutrientKey: z
      .string()
      .max(40)
      .describe('Chave do nutriente a deixar de acompanhar (ex.: "sodium_mg")'),
  } as const;
  execute(input: { nutrientKey: string }, { userId }: McpToolContext) {
    return this.targets.delete(userId, input.nutrientKey);
  }
}
