import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { InboxService, INBOX_MARK_MAX } from '../inbox.service';
import {
  McpTool,
  type McpToolContext,
  type McpToolDef,
} from '../../common/decorators/tool.decorator';

@Injectable()
@McpTool()
export class MarkInboxReadTool implements McpToolDef {
  constructor(private readonly inbox: InboxService) {}
  readonly name = 'mark_inbox_read';
  readonly title = 'Marcar avisos como lidos';
  readonly annotations = { readOnlyHint: false, destructiveHint: false, confirmableHint: true };
  readonly hostedInference = false;
  readonly card = 'confirm' as const;
  readonly description =
    'Marca avisos da central do sino como lidos. Sem `ids`, marca todos. Id que não é da ' +
    'pessoa é ignorado. Exemplo: {"ids":["11111111-2222-4333-8444-555555555555"]}';
  readonly inputSchema = {
    ids: z
      .array(z.string().uuid())
      .max(INBOX_MARK_MAX)
      .optional()
      .describe('IDs dos avisos (de list_inbox); omitido = todos'),
  } as const;
  execute({ ids }: { ids?: string[] }, { userId }: McpToolContext) {
    return this.inbox.markRead(userId, ids);
  }
}
