import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { BlockService } from '../block.service';
import {
  McpTool,
  type McpToolContext,
  type McpToolDef,
} from '../../common/decorators/tool.decorator';

@Injectable()
@McpTool()
export class UnblockUserTool implements McpToolDef {
  constructor(private readonly blocks: BlockService) {}
  readonly name = 'unblock_user';
  readonly title = 'Desbloquear pessoa';
  readonly annotations = { readOnlyHint: false, destructiveHint: false, confirmableHint: true };
  readonly hostedInference = false;
  readonly card = 'confirm' as const;
  readonly description =
    'Desfaz um bloqueio: o usuário e a pessoa voltam a ver o que cada um publica nas ' +
    'comunidades. Exemplo: {"blockId":"11111111-2222-4333-8444-555555555555"}';
  readonly inputSchema = {
    blockId: z.string().describe('id do bloqueio, como devolvido por list_blocked_users'),
  } as const;
  async execute(input: { blockId: string }, { userId }: McpToolContext) {
    return this.blocks.unblock(userId, input.blockId);
  }
}
