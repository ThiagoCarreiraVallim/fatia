import { Injectable } from '@nestjs/common';
import { NutrientTargetService } from '../nutrient-target.service';
import {
  McpTool,
  type McpToolContext,
  type McpToolDef,
} from '../../common/decorators/tool.decorator';

@Injectable()
@McpTool()
export class ListNutrientTargetsTool implements McpToolDef {
  constructor(private readonly targets: NutrientTargetService) {}
  readonly name = 'list_nutrient_targets';
  readonly description = 'Lista as metas de nutrientes personalizadas do usuário.';
  readonly inputSchema = {} as const;
  execute(_input: Record<string, never>, { userId }: McpToolContext) {
    return this.targets.list(userId);
  }
}
