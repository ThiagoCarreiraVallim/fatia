import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import type { ShareScope } from '@fatia/db';
import { MembershipService } from '../membership.service';
import { groupConsentSchema } from './consent-input';
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
  readonly annotations = { readOnlyHint: false, destructiveHint: false, confirmableHint: false };
  readonly hostedInference = false;
  readonly description =
    'Pede para entrar numa academia ou comunidade pelo código público (slug). Conforme a ' +
    'comunidade, a entrada é imediata ou fica aguardando a aprovação do dono; quem entra é ' +
    'sempre o próprio usuário — não é possível colocar outra pessoa num grupo. Por padrão ' +
    'nada é compartilhado: `scopes` e `statsOptIn` só devem ser enviados depois de perguntar ' +
    'ao usuário, categoria por categoria. ' +
    'Exemplo: {"slug":"academia-central-9f3a2b71","scopes":["WORKOUT"],"statsOptIn":false}';
  readonly inputSchema = {
    slug: z.string().describe('Código público da comunidade, como aparece no convite'),
    scopes: groupConsentSchema.scopes.optional(),
    statsOptIn: groupConsentSchema.statsOptIn.optional(),
  } as const;
  async execute(
    { slug, scopes, statsOptIn }: { slug: string; scopes?: ShareScope[]; statsOptIn?: boolean },
    { userId }: McpToolContext,
  ) {
    return this.memberships.requestJoin(userId, slug, {
      scopes: scopes ?? [],
      statsOptIn: statsOptIn ?? false,
    });
  }
}
