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
export class ListStepLogsTool implements McpToolDef {
  constructor(private readonly steps: StepLogService) {}
  readonly name = 'list_step_logs';
  readonly description =
    'Lista logs de passos com filtros de período. Retorna todos os logs (não o efetivo do dia).';
  readonly inputSchema = {
    from: z.string().optional(),
    to: z.string().optional(),
    limit: z.number().int().min(1).max(100).optional(),
    cursor: z.string().optional(),
  } as const;
  execute(
    input: { from?: string; to?: string; limit?: number; cursor?: string },
    { userId }: McpToolContext,
  ) {
    return this.steps.list(input, userId);
  }
}
