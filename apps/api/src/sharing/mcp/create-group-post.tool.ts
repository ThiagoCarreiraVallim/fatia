import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { POST_BODY_MAX, PostService } from '../post.service';
import {
  McpTool,
  type McpToolContext,
  type McpToolDef,
} from '../../common/decorators/tool.decorator';

@Injectable()
@McpTool()
export class CreateGroupPostTool implements McpToolDef {
  constructor(private readonly posts: PostService) {}
  readonly name = 'create_group_post';
  readonly title = 'Publicar no mural da comunidade';
  readonly annotations = { readOnlyHint: false, destructiveHint: false, confirmableHint: true };
  readonly hostedInference = false;
  readonly description =
    'Publica um post de texto no mural de uma comunidade de que o usuário faz parte. Todos os ' +
    'membros passam a ver o texto com o apelido dele. Escreva só o que o usuário pediu para ' +
    'publicar e mostre o texto antes; nunca inclua dado de saúde que ele não ditou. Imagens só ' +
    'pelo app. Em comunidade em que só a equipe publica, membros recebem erro. Sem displayName, ' +
    'usa o apelido que ele já tem ou o primeiro nome. ' +
    'Exemplo: {"groupId":"11111111-2222-4333-8444-555555555555","body":"Bati 10 mil passos hoje!"}';
  readonly inputSchema = {
    groupId: z.string().describe('ID da comunidade'),
    body: z.string().min(1).max(POST_BODY_MAX).describe('Texto do post, como o usuário quer'),
    displayName: z
      .string()
      .optional()
      .describe('Apelido no mural, de 2 a 30 caracteres. Padrão: o da comunidade'),
  } as const;
  async execute(
    input: { groupId: string; body: string; displayName?: string },
    { userId }: McpToolContext,
  ) {
    const { images, ...post } = await this.posts.create(userId, input.groupId, input);
    return { ...post, images: images.length };
  }
}
