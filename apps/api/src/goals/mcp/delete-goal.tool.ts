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
export class DeleteGoalTool implements McpToolDef {
  constructor(private readonly goals: GoalsService) {}
  readonly name = 'delete_goal';
  readonly description = 'Remove permanentemente uma meta pessoal.';
  readonly inputSchema = { goalId: z.string() } as const;
  async execute({ goalId }: { goalId: string }, { userId }: McpToolContext) {
    return this.goals.delete(goalId, userId);
  }
}
