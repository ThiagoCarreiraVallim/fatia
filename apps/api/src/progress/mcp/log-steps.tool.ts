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
export class LogStepsTool implements McpToolDef {
  constructor(private readonly steps: StepLogService) {}
  readonly name = 'log_steps';
  readonly title = 'Registrar passos';
  readonly annotations = { readOnlyHint: false, destructiveHint: false, confirmableHint: true };
  readonly hostedInference = false;
  readonly card = 'confirm' as const;
  readonly description =
    'Registra uma contagem de passos para um dia. Múltiplos logs por dia são permitidos — o servidor considera o maior valor (ADR 007). ' +
    'O registro fica como manual (passos à mão não contam em desafio de passos). ' +
    'Exemplo: {"date":"2026-07-29","steps":9420}';
  readonly inputSchema = {
    date: z.string().optional().describe('YYYY-MM-DD; default hoje no fuso do user'),
    steps: z.number().int().min(0).describe('Total de passos do dia'),
    notes: z.string().max(500).optional().describe('Observações do registro'),
  } as const;
  execute(
    input: { date?: string; steps: number; notes?: string },
    { userId, timezone }: McpToolContext,
  ) {
    // Só o que o schema oferece: um `source` que chegue mesmo assim fica de fora.
    const { date, steps, notes } = input;
    return this.steps.logWithDayTotal({ date, steps, notes }, userId, timezone);
  }
}
