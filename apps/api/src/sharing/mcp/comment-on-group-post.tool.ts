import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { COMMENT_BODY_MAX, PostService } from '../post.service';
import {
  McpTool,
  type McpToolContext,
  type McpToolDef,
} from '../../common/decorators/tool.decorator';

@Injectable()
@McpTool()
export class CommentOnGroupPostTool implements McpToolDef {
  constructor(private readonly posts: PostService) {}
  readonly name = 'comment_on_group_post';
  readonly title = 'Comentar um post da comunidade';
  readonly annotations = { readOnlyHint: false, destructiveHint: false, confirmableHint: true };
  readonly hostedInference = false;
  readonly description =
    'Comenta um post do mural de uma comunidade de que o usuário faz parte. Todos os membros ' +
    'veem o comentário com o apelido dele. Escreva só o que o usuário pediu. ' +
    'Exemplo: {"groupId":"11111111-2222-4333-8444-555555555555",' +
    '"postId":"66666666-7777-4888-9999-000000000000","body":"Parabéns!"}';
  readonly inputSchema = {
    groupId: z.string().describe('ID da comunidade'),
    postId: z.string().describe('ID do post, como devolvido por list_group_posts'),
    body: z.string().min(1).max(COMMENT_BODY_MAX).describe('Texto do comentário'),
    displayName: z
      .string()
      .optional()
      .describe('Apelido no mural, de 2 a 30 caracteres. Padrão: o da comunidade'),
  } as const;
  async execute(
    input: { groupId: string; postId: string; body: string; displayName?: string },
    { userId }: McpToolContext,
  ) {
    return this.posts.comment(userId, input.groupId, input.postId, input);
  }
}
