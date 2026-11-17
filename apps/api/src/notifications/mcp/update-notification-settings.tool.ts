import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { NotificationKind } from '@fatia/db';
import { NotificationService, type NotificationSettings } from '../notification.service';
import {
  McpTool,
  type McpToolContext,
  type McpToolDef,
} from '../../common/decorators/tool.decorator';

const hhmm = () => z.string().regex(/^([01]\d|2[0-3]):[0-5][05]$/, 'hh:mm, de 5 em 5 minutos');

@Injectable()
@McpTool()
export class UpdateNotificationSettingsTool implements McpToolDef {
  constructor(private readonly notifications: NotificationService) {}
  readonly name = 'update_notification_settings';
  readonly title = 'Mudar preferências de aviso';
  readonly annotations = { readOnlyHint: false, destructiveHint: false, confirmableHint: true };
  readonly hostedInference = false;
  readonly card = 'confirm' as const;
  readonly description =
    'Liga ou desliga avisos por tipo e muda o silêncio noturno. Só o que vier muda. Nenhum aviso ' +
    'mostra dado de saúde. ' +
    'Exemplo: {"preferences":{"BIRTHDAY":true,"FEED":false},"quietHoursEnabled":true,"quietFrom":"22:00","quietTo":"07:00"}';
  readonly inputSchema = {
    preferences: z
      .record(z.nativeEnum(NotificationKind), z.boolean())
      .optional()
      .describe(
        'Tipo → ligado. COMMUNITY, ANNOUNCEMENTS (comunicados), SCHEDULE (agenda), ' +
          'SCHEDULE_REMINDER (treino do dia), CHALLENGES, FEED (mural), MODERATION, CHAT, ' +
          'PLAN_RECEIVED, ASSESSMENT_REQUESTED, QUESTIONNAIRE, BIRTHDAY, REMINDERS',
      ),
    quietHoursEnabled: z.boolean().optional().describe('Silêncio noturno ligado'),
    quietFrom: hhmm().optional().describe('Início do silêncio, "22:00"'),
    quietTo: hhmm().optional().describe('Fim do silêncio, "07:00"'),
  } as const;
  async execute(
    input: {
      preferences?: Partial<Record<NotificationKind, boolean>>;
      quietHoursEnabled?: boolean;
      quietFrom?: string;
      quietTo?: string;
    },
    { userId }: McpToolContext,
  ): Promise<NotificationSettings> {
    if (input.preferences) await this.notifications.setPreferences(userId, input.preferences);
    if (
      input.quietHoursEnabled !== undefined ||
      input.quietFrom !== undefined ||
      input.quietTo !== undefined
    ) {
      await this.notifications.setQuietHours(userId, {
        enabled: input.quietHoursEnabled,
        from: input.quietFrom,
        to: input.quietTo,
      });
    }
    return this.notifications.settings(userId);
  }
}
