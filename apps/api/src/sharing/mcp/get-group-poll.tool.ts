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
export class GetGroupPollTool implements McpToolDef {
  constructor(private readonly posts: PostService) {}
  readonly name = 'get_group_poll';
  readonly title = 'Enquete do mural';
  readonly annotations = { readOnlyHint: true, destructiveHint: false, confirmableHint: false };
  readonly hostedInference = false;
  readonly card = 'list' as const;
  readonly description =
    'Lê uma enquete do mural de uma comunidade de que o usuário faz parte: a pergunta, as ' +
    'opções, o prazo, em qual opção o próprio usuário votou e, se já der para mostrar, as %. O ' +
    'resultado só aparece com 5 votos ou mais, e só depois de o usuário votar ou de a enquete ' +
    'encerrar; antes disso percent e totalVotes vêm nulos. Ninguém sabe em quê os outros ' +
    'votaram. Exemplo: {"groupId":"11111111-2222-4333-8444-555555555555",' +
    '"postId":"66666666-7777-4888-9999-000000000000"}';
  readonly inputSchema = {
    groupId: z.string().describe('ID da comunidade'),
    postId: z.string().describe('ID do post da enquete, como devolvido por list_group_posts'),
  } as const;
  async execute(input: { groupId: string; postId: string }, { userId }: McpToolContext) {
    const post = await this.posts.get(userId, input.groupId, input.postId);
    if (!post.poll) return { postId: post.id, poll: null, options: [] };
    return { postId: post.id, ...post.poll };
  }

  /** As opções, com a % só quando a API já manda; senão, "amostra pequena". */
  artifact(result: unknown) {
    const r = result as {
      question?: string;
      closed?: boolean;
      myOptionId?: string | null;
      totalVotes?: number | null;
      options: { id: string; label: string; percent: number | null }[];
    };
    if (!r.question || r.options.length === 0) return null;
    return {
      kind: 'list',
      label: r.question,
      items: r.options.map((o) => ({
        title: o.label,
        detail: [
          o.percent !== null ? `${o.percent}%` : null,
          o.id === r.myOptionId ? 'seu voto' : null,
        ]
          .filter(Boolean)
          .join(' · '),
      })),
      total:
        r.totalVotes != null
          ? `${r.totalVotes} votos${r.closed ? ' · encerrada' : ''}`
          : 'Resultado com 5 votos',
    };
  }
}
