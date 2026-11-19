import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import {
  POLL_MAX_DAYS,
  POLL_MAX_OPTIONS,
  POLL_MIN_OPTIONS,
  POLL_OPTION_MAX,
  POLL_QUESTION_MAX,
  POST_BODY_MAX,
  PostService,
} from '../post.service';
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
  readonly card = 'confirm' as const;
  readonly description =
    'Publica um post de texto no mural de uma comunidade de que o usuário faz parte. Todos os ' +
    'membros passam a ver o texto com o apelido dele. Escreva só o que o usuário pediu para ' +
    'publicar e mostre o texto antes; nunca inclua dado de saúde que ele não ditou. Imagens só ' +
    'pelo app. Em comunidade em que só a equipe publica, membros recebem erro. Sem displayName, ' +
    'usa o apelido que ele já tem ou o primeiro nome. Com poll, publica uma enquete (pergunta, ' +
    'de 2 a 4 opções e quantos dias fica aberta): o voto é anônimo e o resultado só aparece com ' +
    '5 votos. ' +
    'Exemplo: {"groupId":"11111111-2222-4333-8444-555555555555","body":"Bati 10 mil passos hoje!"}';
  readonly inputSchema = {
    groupId: z.string().describe('ID da comunidade'),
    body: z
      .string()
      .max(POST_BODY_MAX)
      .optional()
      .describe('Texto do post, como o usuário quer. Na enquete, opcional'),
    poll: z
      .object({
        question: z.string().min(1).max(POLL_QUESTION_MAX),
        options: z
          .array(z.string().min(1).max(POLL_OPTION_MAX))
          .min(POLL_MIN_OPTIONS)
          .max(POLL_MAX_OPTIONS),
        days: z.number().int().min(1).max(POLL_MAX_DAYS),
      })
      .optional()
      .describe('Enquete: pergunta, opções e dias aberta'),
    displayName: z
      .string()
      .optional()
      .describe('Apelido no mural, de 2 a 30 caracteres. Padrão: o da comunidade'),
  } as const;
  async execute(
    input: {
      groupId: string;
      body?: string;
      displayName?: string;
      poll?: { question: string; options: string[]; days: number };
    },
    { userId }: McpToolContext,
  ) {
    const { images, ...post } = await this.posts.create(userId, input.groupId, {
      body: input.body,
      displayName: input.displayName,
      ...(input.poll ? { kind: 'POLL' as const, poll: input.poll } : {}),
    });
    return { ...post, images: images.length };
  }
}
