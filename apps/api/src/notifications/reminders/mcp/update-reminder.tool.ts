import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import {
  McpTool,
  type McpToolContext,
  type McpToolDef,
} from '../../../common/decorators/tool.decorator';
import { ReminderService } from '../reminder.service';
import { asInput, reminderFields, type ReminderToolInput } from './reminder-schema';

@Injectable()
@McpTool()
export class UpdateReminderTool implements McpToolDef {
  constructor(private readonly reminders: ReminderService) {}
  readonly name = 'update_reminder';
  readonly title = 'Alterar lembrete';
  readonly annotations = { readOnlyHint: false, destructiveHint: false, confirmableHint: true };
  readonly hostedInference = false;
  readonly card = 'confirm' as const;
  readonly description =
    'Muda um lembrete (de list_reminders): só os campos enviados. enabled false desliga sem apagar. ' +
    'Exemplo: {"id":"11111111-2222-4333-8444-555555555555","enabled":false}';
  readonly inputSchema = {
    id: z.string().uuid().describe('ID do lembrete (de list_reminders)'),
    kind: reminderFields.kind.optional(),
    mode: reminderFields.mode.optional(),
    everyHours: reminderFields.everyHours,
    from: reminderFields.from,
    to: reminderFields.to,
    times: reminderFields.times,
    weekdays: reminderFields.weekdays,
    stepsBelow: reminderFields.stepsBelow,
    enabled: reminderFields.enabled,
  } as const;
  execute({ id, ...patch }: ReminderToolInput & { id: string }, { userId }: McpToolContext) {
    return this.reminders.update(userId, id, asInput(patch));
  }
}
