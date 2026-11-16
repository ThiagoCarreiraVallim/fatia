import { Injectable } from '@nestjs/common';
import { ConsistencyService } from '../consistency.service';
import {
  McpTool,
  type McpToolContext,
  type McpToolDef,
} from '../../common/decorators/tool.decorator';

@Injectable()
@McpTool()
export class GetStreakTool implements McpToolDef {
  constructor(private readonly consistency: ConsistencyService) {}
  readonly name = 'get_streak';
  readonly title = 'Sequência atual';
  readonly annotations = { readOnlyHint: true, destructiveHint: false, confirmableHint: false };
  readonly hostedInference = false;
  readonly description =
    'Sequência atual de dias ativos. Um dia é ativo com ao menos uma área cumprida: refeição ' +
    'registrada, treino concluído, água na meta ou passos na meta. Traz o orçamento de faltas: ' +
    'um dia perdido não zera a sequência. Responde "você está no seu 12º dia" sem carregar o ' +
    'dashboard inteiro; a grade por dia e o recorde estão em `get_consistency`.';
  readonly inputSchema = {} as const;
  execute(_input: Record<string, never>, { userId, timezone }: McpToolContext) {
    return this.consistency.streak({ userId, timezone });
  }
}
