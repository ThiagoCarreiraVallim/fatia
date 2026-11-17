import { Injectable } from '@nestjs/common';
import {
  McpTool,
  type McpToolContext,
  type McpToolDef,
} from '../../../common/decorators/tool.decorator';
import { ReminderService } from '../reminder.service';

@Injectable()
@McpTool()
export class ListRemindersTool implements McpToolDef {
  constructor(private readonly reminders: ReminderService) {}
  readonly name = 'list_reminders';
  readonly title = 'Listar lembretes';
  readonly annotations = { readOnlyHint: true, destructiveHint: false, confirmableHint: false };
  readonly hostedInference = false;
  readonly card = 'report' as const;
  readonly description =
    'Lista os lembretes pessoais (água, refeição, pesagem, treino, passos): tipo, intervalo ou ' +
    'horários fixos ("hh:mm" no fuso da pessoa), dias da semana (1 = segunda) e se estão ligados. ' +
    'O servidor só manda o lembrete do que ainda não foi feito e respeita o silêncio noturno.';
  readonly inputSchema = {} as const;
  execute(_input: Record<string, never>, { userId }: McpToolContext) {
    return this.reminders.list(userId);
  }
}
