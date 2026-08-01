import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { WeightLogService } from '../weight-log.service';
import {
  McpTool,
  type McpToolContext,
  type McpToolDef,
} from '../../common/decorators/tool.decorator';

@Injectable()
@McpTool()
export class DeleteWeightLogTool implements McpToolDef {
  constructor(private readonly weights: WeightLogService) {}
  readonly name = 'delete_weight_log';
  readonly title = 'Excluir registro de peso';
  readonly annotations = { readOnlyHint: false, destructiveHint: true };
  readonly description =
    'Deleta um log de peso. ' + 'Exemplo: {"weightLogId":"11111111-2222-4333-8444-555555555555"}';
  readonly inputSchema = {
    weightLogId: z.string().uuid().describe('ID do registro de peso a remover'),
  } as const;
  execute(input: { weightLogId: string }, { userId }: McpToolContext) {
    return this.weights.delete(input.weightLogId, userId);
  }
}
