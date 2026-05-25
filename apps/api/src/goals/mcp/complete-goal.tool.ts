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
export class CompleteGoalTool implements McpToolDef {
  constructor(private readonly goals: GoalsService) {}
  readonly name = 'complete_goal';
  readonly description = 'Marca uma meta como concluída.';
  readonly inputSchema = { goalId: z.string() } as const;
  async execute({ goalId }: { goalId: string }, { userId, timezone }: McpToolContext) {
    return this.goals.complete(goalId, userId, timezone);
  }
}
