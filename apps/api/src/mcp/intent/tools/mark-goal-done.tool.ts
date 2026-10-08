import { Injectable } from '@nestjs/common';
import { GoalStatus } from '@prisma/client';
import { McpTool, type McpToolContext } from '../../../common/decorators/tool.decorator';
import { GoalsService } from '../../../goals/goals.service';
import { escolherPorNome, IntentTool } from '../composicao';
import type { IntentInput } from '../intent-surface';

/**
 * A meta ativa pelo título (`list_goals`) e o `complete_goal` dela. O valor alcançado, quando
 * a pessoa diz, vai antes pelo `update_goal` como valor reportado — `complete_goal` não recebe
 * valor nenhum, e é assim que o agente o registraria no braço A.
 */
@Injectable()
@McpTool()
export class MarkGoalDoneTool extends IntentTool<'mark_goal_done'> {
  constructor(private readonly goals: GoalsService) {
    super('mark_goal_done');
  }

  async execute(input: IntentInput<'mark_goal_done'>, { userId, timezone }: McpToolContext) {
    const ativas = await this.goals.list({ status: GoalStatus.active }, userId, timezone); // list_goals
    const meta = escolherPorNome(input.goal, ativas, (g) => g.title, 'meta ativa');
    if (input.finalValue !== undefined) {
      await this.goals.update(meta.id, { lastReportedValue: input.finalValue }, userId, timezone); // update_goal
    }
    return this.goals.complete(meta.id, userId, timezone); // complete_goal
  }
}
