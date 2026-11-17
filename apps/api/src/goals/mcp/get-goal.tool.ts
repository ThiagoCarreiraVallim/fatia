import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { GoalsService, type GoalWithProgress } from '../goals.service';
import {
  McpTool,
  type McpToolContext,
  type McpToolDef,
} from '../../common/decorators/tool.decorator';
import { goalProgressItem } from './goal-progress-item';

@Injectable()
@McpTool()
export class GetGoalTool implements McpToolDef {
  constructor(private readonly goals: GoalsService) {}
  readonly name = 'get_goal';
  readonly title = 'Ver meta';
  readonly annotations = { readOnlyHint: true, destructiveHint: false, confirmableHint: false };
  readonly hostedInference = false;
  readonly card = 'progress' as const;
  readonly description = 'Retorna uma meta pessoal por id, com progresso calculado.';
  readonly inputSchema = {
    goalId: z.string().describe('ID da meta a detalhar'),
  } as const;
  async execute({ goalId }: { goalId: string }, { userId, timezone }: McpToolContext) {
    return this.goals.findById(goalId, userId, timezone);
  }

  /** A barra de progresso da meta (prancha IA-Cartoes, #384). */
  artifact(result: unknown) {
    return {
      kind: 'progress',
      label: 'Meta',
      items: [goalProgressItem(result as GoalWithProgress)],
    };
  }
}
