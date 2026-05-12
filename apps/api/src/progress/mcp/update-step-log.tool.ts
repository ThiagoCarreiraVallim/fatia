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
  readonly description = 'Atualiza um log de passos específico (corrige valor, data ou notas).';
  readonly inputSchema = {
    stepLogId: z.string().uuid(),
    steps: z.number().int().min(0).optional(),
    date: z.string().optional(),
    notes: z.string().max(500).optional(),
  } as const;
  execute(
    input: { stepLogId: string; steps?: number; date?: string; notes?: string },
    { userId }: McpToolContext,
  ) {
    const { stepLogId, ...patch } = input;
    return this.steps.update(stepLogId, patch, userId);
  }
}
