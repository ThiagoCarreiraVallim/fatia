import { Injectable } from '@nestjs/common';
import {
  McpTool,
  type McpToolContext,
  type McpToolDef,
} from '../../common/decorators/tool.decorator';
import { MuscleSummaryService } from '../muscle-summary.service';

/**
 * A mesma leitura do `GET /workout/muscles/week` (cards da aba Treino, #369):
 * séries por grupo nos últimos 7 dias, grupos descansados e o plano da pessoa
 * que mais os trabalha. MCP-first (PRD §3.5, ADR 006): nenhuma outra tool dá
 * séries por músculo nem o descanso.
 */
@Injectable()
@McpTool()
export class GetWeeklyMuscleSummaryTool implements McpToolDef {
  constructor(private readonly muscles: MuscleSummaryService) {}

  readonly name = 'get_weekly_muscle_summary';

  readonly title = 'Ver músculos da semana';

  readonly annotations = { readOnlyHint: true, destructiveHint: false, confirmableHint: false };

  readonly hostedInference = false;
  readonly card = 'report' as const;
  readonly description =
    'Séries de força por grupo muscular nos últimos 7 dias (com a meta semanal), os grupos mais descansados (dias desde a última série) e o plano da própria pessoa que mais trabalha os grupos descansados.';
  readonly inputSchema = {} as const;

  execute(_input: Record<string, never>, { userId, timezone }: McpToolContext) {
    return this.muscles.weekly(userId, timezone);
  }
}
