import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { StepLogService } from '../step-log.service';
import {
  McpTool,
  type McpToolContext,
  type McpToolDef,
} from '../../common/decorators/tool.decorator';

@Injectable()
@McpTool()
export class UpdateStepLogTool implements McpToolDef {
  constructor(private readonly steps: StepLogService) {}
  readonly name = 'update_step_log';
  readonly title = 'Atualizar registro de passos';
  readonly annotations = { readOnlyHint: false, destructiveHint: false };
  readonly description =
    'Atualiza um log de passos específico (corrige valor, data ou notas). ' +
    'Exemplo: {"stepLogId":"11111111-2222-4333-8444-555555555555","steps":10250}';
  readonly inputSchema = {
    stepLogId: z.string().uuid().describe('ID do registro de passos a atualizar'),
    steps: z.number().int().min(0).optional().describe('Novo total de passos'),
    date: z.string().optional().describe('Nova data do registro, em YYYY-MM-DD'),
    notes: z.string().max(500).optional().describe('Novas observações do registro'),
  } as const;
  execute(
    input: { stepLogId: string; steps?: number; date?: string; notes?: string },
    { userId }: McpToolContext,
  ) {
    const { stepLogId, ...patch } = input;
    return this.steps.update(stepLogId, patch, userId);
  }
}
