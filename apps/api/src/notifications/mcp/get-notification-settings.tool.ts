import { Injectable } from '@nestjs/common';
import { NotificationService } from '../notification.service';
import {
  McpTool,
  type McpToolContext,
  type McpToolDef,
} from '../../common/decorators/tool.decorator';

@Injectable()
@McpTool()
export class GetNotificationSettingsTool implements McpToolDef {
  constructor(private readonly notifications: NotificationService) {}
  readonly name = 'get_notification_settings';
  readonly title = 'Ver preferências de aviso';
  readonly annotations = { readOnlyHint: true, destructiveHint: false, confirmableHint: false };
  readonly hostedInference = false;
  readonly card = 'list' as const;
  readonly description =
    'Mostra quais avisos a pessoa recebe, por tipo (comunidade, comunicados, agenda, treino do ' +
    'dia, desafios, mural, moderação, chat, plano novo, avaliação pedida, questionário, ' +
    'aniversário), o silêncio noturno ("hh:mm" no fuso dela) e o nome da equipe, quando ela ' +
    'está numa comunidade com equipe.';
  readonly inputSchema = {} as const;
  execute(_input: Record<string, never>, { userId }: McpToolContext) {
    return this.notifications.settings(userId);
  }
}
