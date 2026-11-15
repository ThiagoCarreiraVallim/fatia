import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import {
  McpTool,
  type McpToolContext,
  type McpToolDef,
} from '../../../common/decorators/tool.decorator';
import { ReminderService } from '../reminder.service';

@Injectable()
@McpTool()
export class DeleteReminderTool implements McpToolDef {
  constructor(private readonly reminders: ReminderService) {}
  readonly name = 'delete_reminder';
  readonly title = 'Apagar lembrete';
  readonly annotations = { readOnlyHint: false, destructiveHint: true, confirmableHint: false };
  readonly hostedInference = false;
  readonly description =
    'Apaga um lembrete. Para só pausar, use update_reminder com enabled false. ' +
    'Exemplo: {"id":"11111111-2222-4333-8444-555555555555"}';
  readonly inputSchema = {
    id: z.string().uuid().describe('ID do lembrete (de list_reminders)'),
  } as const;
  execute({ id }: { id: string }, { userId }: McpToolContext) {
    return this.reminders.remove(userId, id);
  }
}
