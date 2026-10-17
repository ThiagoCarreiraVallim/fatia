import { Injectable } from '@nestjs/common';
import { McpTool, type McpToolContext } from '../../../common/decorators/tool.decorator';
import { GoalsService } from '../../../goals/goals.service';
import { AchievementService } from '../../../progress/achievement.service';
import { IntentTool } from '../composicao';
import type { IntentInput } from '../intent-surface';

const DIAS_RECENTES = 7;

/**
 * `list_goals` já traz o progresso de cada meta — o `get_goal` por meta seria a mesma
 * leitura de novo. As conquistas recentes são as do `list_achievements` desbloqueadas na
 * última semana; a lista inteira vem junto.
 */
@Injectable()
@McpTool()
export class GetGoalsOverviewTool extends IntentTool<'get_goals_overview'> {
  constructor(
    private readonly goals: GoalsService,
    private readonly achievements: AchievementService,
  ) {
    super('get_goals_overview');
  }

  async execute(input: IntentInput<'get_goals_overview'>, { userId, timezone }: McpToolContext) {
    const [goals, achievements] = await Promise.all([
      this.goals.list({ status: input.status }, userId, timezone), // list_goals
      this.achievements.list({ userId, timezone }), // list_achievements
    ]);
    const desde = Date.now() - DIAS_RECENTES * 24 * 60 * 60 * 1000;
    const recentAchievements = achievements.filter(
      (a) => a.unlockedAt !== null && Date.parse(a.unlockedAt) >= desde,
    );
    return { goals, recentAchievements, achievements };
  }
}
