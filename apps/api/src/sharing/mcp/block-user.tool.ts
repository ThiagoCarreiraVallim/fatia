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
export class BlockUserTool implements McpToolDef {
  constructor(private readonly blocks: BlockService) {}
  readonly name = 'block_user';
  readonly title = 'Bloquear pessoa';
  readonly annotations = { readOnlyHint: false, destructiveHint: false, confirmableHint: false };
  readonly hostedInference = false;
  readonly appOnly = { screen: 'Mural', path: '/community/:groupId/feed' };
  readonly description =
    'Bloqueia quem escreveu um post (ou, com commentId, um comentário) do mural de uma ' +
    'comunidade. O usuário deixa de ver os posts, comentários e reações dessa pessoa em todas ' +
    'as comunidades, e ela deixa de ver os dele, sem ser avisada. Só bloqueie quem o usuário ' +
    'pediu. Desfaz com unblock_user. Exemplo: {"groupId":"11111111-2222-4333-8444-555555555555",' +
    '"postId":"66666666-7777-4888-9999-000000000000"}';
  readonly inputSchema = {
    groupId: z.string().describe('ID da comunidade'),
    postId: z.string().describe('ID do post, como devolvido por list_group_posts'),
    commentId: z.string().optional().describe('ID do comentário, para bloquear quem comentou'),
  } as const;
  async execute(
    input: { groupId: string; postId: string; commentId?: string },
    { userId }: McpToolContext,
  ) {
    return this.blocks.block(userId, input);
  }
}
