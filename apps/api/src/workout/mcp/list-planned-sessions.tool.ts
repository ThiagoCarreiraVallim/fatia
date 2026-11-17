import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { AgendaService } from '../agenda.service';
import {
  McpTool,
  type McpToolContext,
  type McpToolDef,
} from '../../common/decorators/tool.decorator';

const DIA = /^\d{4}-\d{2}-\d{2}$/;

@Injectable()
@McpTool()
export class ListPlannedSessionsTool implements McpToolDef {
  constructor(private readonly agenda: AgendaService) {}
  readonly name = 'list_planned_sessions';
  readonly title = 'Agenda de treinos';
  readonly annotations = { readOnlyHint: true, destructiveHint: false, confirmableHint: false };
  readonly hostedInference = false;
  readonly card = 'report' as const;
  readonly description =
    'Devolve a agenda de treinos do usuário por dia: as sessões dos planos de calendário que a ' +
    'equipe enviou, com o estado (done, missed, today, planned) e, nos planos flexíveis, só a ' +
    'próxima sessão no dia de hoje. É informativa: não há reserva nem presença. Sem datas, a ' +
    'semana atual (segunda a domingo); até 42 dias por vez.';
  readonly inputSchema = {
    from: z.string().regex(DIA).optional().describe('Primeiro dia (YYYY-MM-DD)'),
    to: z.string().regex(DIA).optional().describe('Último dia (YYYY-MM-DD)'),
  } as const;
  execute(input: { from?: string; to?: string }, { userId, timezone }: McpToolContext) {
    return this.agenda.range(userId, timezone, input.from, input.to);
  }
}
