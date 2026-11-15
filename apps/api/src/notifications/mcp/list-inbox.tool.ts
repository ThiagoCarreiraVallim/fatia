import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { InboxService, INBOX_LIST_LIMIT } from '../inbox.service';
import {
  McpTool,
  type McpToolContext,
  type McpToolDef,
} from '../../common/decorators/tool.decorator';

@Injectable()
@McpTool()
export class ListInboxTool implements McpToolDef {
  constructor(private readonly inbox: InboxService) {}
  readonly name = 'list_inbox';
  readonly title = 'Listar avisos';
  readonly annotations = { readOnlyHint: true, destructiveHint: false, confirmableHint: false };
  readonly hostedInference = false;
  readonly description =
    'Lista os avisos da central do sino (comunidade, desafios, mural, moderação), do mais ' +
    'recente para o mais antigo, com quantos ainda não foram lidos. Não marca nada como lido.';
  readonly inputSchema = {
    limit: z
      .number()
      .int()
      .positive()
      .max(INBOX_LIST_LIMIT)
      .optional()
      .describe(`Quantos avisos retornar (default e máximo ${INBOX_LIST_LIMIT})`),
  } as const;
  execute({ limit }: { limit?: number }, { userId }: McpToolContext) {
    return this.inbox.list(userId, limit);
  }
}
