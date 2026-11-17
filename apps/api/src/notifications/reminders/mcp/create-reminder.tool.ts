import { Injectable } from '@nestjs/common';
import {
  McpTool,
  type McpToolContext,
  type McpToolDef,
} from '../../../common/decorators/tool.decorator';
import { ReminderService } from '../reminder.service';
import { asInput, reminderFields, type ReminderToolInput } from './reminder-schema';

@Injectable()
@McpTool()
export class CreateReminderTool implements McpToolDef {
  constructor(private readonly reminders: ReminderService) {}
  readonly name = 'create_reminder';
  readonly title = 'Criar lembrete';
  readonly annotations = { readOnlyHint: false, destructiveHint: false, confirmableHint: true };
  readonly hostedInference = false;
  readonly card = 'confirm' as const;
  readonly description =
    'Cria um lembrete pessoal. INTERVAL avisa a cada N horas entre from e to; TIMES avisa nos ' +
    'horários de times. O aviso não sai se a pessoa já fez (água batida, refeição registrada, ' +
    'treino começado). ' +
    'Exemplo: {"kind":"WATER","mode":"INTERVAL","everyHours":2,"from":"08:00","to":"20:00"} ' +
    'Exemplo (almoço de segunda a sexta): {"kind":"MEAL","mode":"TIMES","times":["12:30"],"weekdays":[1,2,3,4,5]}';
  readonly inputSchema = reminderFields;
  execute(input: ReminderToolInput, { userId }: McpToolContext) {
    const i = asInput(input);
    return this.reminders.create(userId, { ...i, kind: i.kind!, mode: i.mode! });
  }
}
