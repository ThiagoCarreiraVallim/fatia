import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { MembershipService } from '../membership.service';
import {
  McpTool,
  type McpToolContext,
  type McpToolDef,
} from '../../common/decorators/tool.decorator';

@Injectable()
@McpTool()
export class JoinGroupTool implements McpToolDef {
  constructor(private readonly memberships: MembershipService) {}
  readonly name = 'join_group';
  readonly title = 'Pedir para entrar num grupo';
  readonly annotations = { readOnlyHint: false, destructiveHint: false };
  readonly hostedInference = false;
  readonly description =
    'Pede para entrar numa academia ou grupo pelo identificador público (slug) do convite. ' +
    'O pedido fica aguardando a aprovação do dono, e quem entra é sempre o próprio usuário — ' +
    'não é possível colocar outra pessoa num grupo. Entrar não concede acesso nenhum aos ' +
    'dados do usuário. ' +
    'Exemplo: {"slug":"academia-central-9f3a2b71"}';
  readonly inputSchema = {
    slug: z.string().describe('Identificador público do grupo, como aparece no link do convite'),
  } as const;
  async execute({ slug }: { slug: string }, { userId }: McpToolContext) {
    return this.memberships.requestJoin(userId, slug);
  }
}
