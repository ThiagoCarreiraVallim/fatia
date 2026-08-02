import { Injectable } from '@nestjs/common';
import { StreakService } from '../streak.service';
import {
  McpTool,
  type McpToolContext,
  type McpToolDef,
} from '../../common/decorators/tool.decorator';

@Injectable()
@McpTool()
export class GetStreakTool implements McpToolDef {
  constructor(private readonly streaks: StreakService) {}
  readonly name = 'get_streak';
  readonly title = 'Sequência atual';
  readonly annotations = { readOnlyHint: true, destructiveHint: false };
  readonly description =
    'Sequência atual de dias ativos (refeição registrada OU treino concluído OU meta de passos batida), ' +
    'mais as sequências de nutrição, treino (em semanas) e passos. Traz o orçamento de faltas: ' +
    'um dia perdido não zera a sequência. Responde "você está no seu 12º dia" sem carregar o dashboard inteiro.';
  readonly inputSchema = {} as const;
  execute(_input: Record<string, never>, { userId, timezone }: McpToolContext) {
    return this.streaks.compute({ userId, timezone });
  }
}
