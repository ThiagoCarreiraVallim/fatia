import { Injectable } from '@nestjs/common';
import { UserGoalsService } from '../user-goals.service';
import {
  McpTool,
  type McpToolContext,
  type McpToolDef,
} from '../../common/decorators/tool.decorator';

@Injectable()
@McpTool()
export class GetNutritionGoalsTool implements McpToolDef {
  constructor(private readonly goals: UserGoalsService) {}
  readonly name = 'get_nutrition_goals';
  readonly description = 'Retorna as metas nutricionais do usuário.';
  readonly inputSchema = {} as const;
  execute(_input: unknown, { userId }: McpToolContext) {
    return this.goals.get(userId);
  }
}
