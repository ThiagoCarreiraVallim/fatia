import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { PostService } from '../post.service';
import {
  McpTool,
  type McpToolContext,
  type McpToolDef,
} from '../../common/decorators/tool.decorator';

@Injectable()
@McpTool()
export class VoteGroupPollTool implements McpToolDef {
  constructor(private readonly posts: PostService) {}
  readonly name = 'vote_group_poll';
  readonly title = 'Votar numa enquete';
  readonly annotations = { readOnlyHint: false, destructiveHint: false, confirmableHint: true };
  readonly hostedInference = false;
  readonly card = 'confirm' as const;
  readonly description =
    'Vota, ou muda o voto, numa enquete do mural de uma comunidade de que o usuário faz parte, ' +
    'até o prazo. O voto é anônimo. Vote só na opção que o usuário escolheu. Devolve a enquete ' +
    'com o resultado, se já houver 5 votos. Exemplo: ' +
    '{"groupId":"11111111-2222-4333-8444-555555555555",' +
    '"postId":"66666666-7777-4888-9999-000000000000","optionId":"77777777-8888-4999-aaaa-bbbbbbbbbbbb"}';
  readonly inputSchema = {
    groupId: z.string().describe('ID da comunidade'),
    postId: z.string().describe('ID do post da enquete'),
    optionId: z.string().describe('ID da opção, como devolvido por get_group_poll'),
  } as const;
  async execute(
    input: { groupId: string; postId: string; optionId: string },
    { userId }: McpToolContext,
  ) {
    const post = await this.posts.vote(userId, input.groupId, input.postId, input.optionId);
    return { postId: post.id, ...post.poll };
  }
}
