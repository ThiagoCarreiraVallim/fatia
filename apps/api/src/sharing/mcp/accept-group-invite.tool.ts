import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import type { ShareScope } from '@fatia/db';
import { InviteService } from '../invite.service';
import { groupConsentSchema } from './consent-input';
import {
  McpTool,
  type McpToolContext,
  type McpToolDef,
} from '../../common/decorators/tool.decorator';

@Injectable()
@McpTool()
export class AcceptGroupInviteTool implements McpToolDef {
  constructor(private readonly invites: InviteService) {}
  readonly name = 'accept_group_invite';
  readonly title = 'Aceitar um convite de comunidade';
  readonly annotations = { readOnlyHint: false, destructiveHint: false, confirmableHint: true };
  readonly hostedInference = false;
  readonly description =
    'Aceita um convite e entra na comunidade na hora, com o papel do convite. Quem entra é ' +
    'sempre o próprio usuário; convite enviado a um e-mail só vale para a conta desse e-mail. ' +
    'Antes, mostre a comunidade com `get_group_invite` e pergunte o que compartilhar com a ' +
    'equipe, categoria por categoria: recusar tudo (`scopes: []`) também entra. ' +
    'Exemplo: {"token":"q1w2e3r4t5y6u7i8o9p0a1s2d3f4g5h6j7k8l9z0x1c","scopes":["WORKOUT","HABITS"],"statsOptIn":true}';
  readonly inputSchema = {
    token: z
      .string()
      .regex(/^[A-Za-z0-9_-]{43}$/, 'Convite inválido')
      .describe('Token do convite, a parte final do link'),
    ...groupConsentSchema,
  } as const;
  async execute(
    { token, scopes, statsOptIn }: { token: string; scopes: ShareScope[]; statsOptIn: boolean },
    { userId }: McpToolContext,
  ) {
    return this.invites.accept(userId, token, { scopes, statsOptIn });
  }
}
