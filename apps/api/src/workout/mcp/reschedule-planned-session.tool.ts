import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { AgendaService } from '../agenda.service';
import {
  McpTool,
  type McpToolContext,
  type McpToolDef,
} from '../../common/decorators/tool.decorator';

@Injectable()
@McpTool()
export class ReschedulePlannedSessionTool implements McpToolDef {
  constructor(private readonly agenda: AgendaService) {}
  readonly name = 'reschedule_planned_session';
  readonly title = 'Remarcar uma sessão da agenda';
  readonly annotations = { readOnlyHint: false, destructiveHint: false, confirmableHint: true };
  readonly hostedInference = false;
  readonly card = 'confirm' as const;
  readonly description =
    'Move uma sessão da agenda de treinos para outro dia, de hoje até o último dia do plano ' +
    '(nunca depois). É só a agenda do usuário: não reserva nada e não avisa ninguém. ' +
    'Exemplo: {"id":"11111111-2222-4333-8444-555555555555","date":"2026-11-21"}';
  readonly inputSchema = {
    id: z.string().uuid().describe('ID da sessão (items[].id em list_planned_sessions)'),
    date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .describe('Novo dia (YYYY-MM-DD)'),
  } as const;
  execute(input: { id: string; date: string }, { userId, timezone }: McpToolContext) {
    return this.agenda.reschedule(userId, timezone, input.id, input.date);
  }
}
