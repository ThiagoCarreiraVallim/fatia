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
export class UpdateWeightLogTool implements McpToolDef {
  constructor(private readonly weights: WeightLogService) {}
  readonly name = 'update_weight_log';
  readonly title = 'Atualizar registro de peso';
  readonly annotations = { readOnlyHint: false, destructiveHint: false };
  readonly description =
    'Atualiza um log de peso existente. ' +
    'Exemplo: {"weightLogId":"11111111-2222-4333-8444-555555555555","weightKg":77.9}';
  readonly inputSchema = {
    weightLogId: z.string().uuid().describe('ID do registro de peso a atualizar'),
    weightKg: z.number().positive().optional().describe('Novo peso corporal em kg'),
    loggedAt: z.string().optional().describe('Novo horário da pesagem, em ISO 8601'),
    notes: z.string().max(500).optional().describe('Novas observações da pesagem'),
  } as const;
  execute(
    input: { weightLogId: string; weightKg?: number; loggedAt?: string; notes?: string },
    { userId }: McpToolContext,
  ) {
    const { weightLogId, ...patch } = input;
    return this.weights.update(weightLogId, patch, userId);
  }
}
