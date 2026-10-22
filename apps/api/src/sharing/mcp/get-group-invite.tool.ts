import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { InviteService } from '../invite.service';
import {
  McpTool,
  type McpToolContext,
  type McpToolDef,
} from '../../common/decorators/tool.decorator';

@Injectable()
@McpTool()
export class GetGroupInviteTool implements McpToolDef {
  constructor(private readonly invites: InviteService) {}
  readonly name = 'get_group_invite';
  readonly title = 'Ver um convite de comunidade';
  readonly annotations = { readOnlyHint: true, destructiveHint: false, confirmableHint: false };
  readonly hostedInference = false;
  readonly description =
    'Mostra a comunidade de um convite antes de aceitar: nome, descrição, quem convidou, o ' +
    'papel oferecido e quem da equipe poderia ver os dados compartilhados. Não entra nem ' +
    'compartilha nada. O token é a última parte do link `/c/<token>`. Convite inválido, ' +
    'vencido ou esgotado responde "não encontrado", sem dizer qual. ' +
    'Exemplo: {"token":"q1w2e3r4t5y6u7i8o9p0a1s2d3f4g5h6j7k8l9z0x1c"}';
  readonly inputSchema = {
    token: z
      .string()
      .regex(/^[A-Za-z0-9_-]{43}$/, 'Convite inválido')
      .describe('Token do convite, a parte final do link'),
  } as const;
  async execute({ token }: { token: string }, _ctx: McpToolContext) {
    return this.invites.preview(token);
  }
}
