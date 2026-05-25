import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { GoalsService } from '../goals.service';
import {
  McpTool,
  type McpToolContext,
  type McpToolDef,
} from '../../common/decorators/tool.decorator';

@Injectable()
@McpTool()
export class GetGoalTool implements McpToolDef {
  constructor(private readonly goals: GoalsService) {}
  readonly name = 'get_goal';
  readonly description = 'Retorna uma meta pessoal por id, com progresso calculado.';
  readonly inputSchema = { goalId: z.string() } as const;
  async execute({ goalId }: { goalId: string }, { userId, timezone }: McpToolContext) {
    return this.goals.findById(goalId, userId, timezone);
  }
}
