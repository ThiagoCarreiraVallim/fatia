import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import type { ShareScope } from '@fatia/db';
import { ConsentService } from '../consent.service';
import { groupConsentSchema } from './consent-input';
import {
  McpTool,
  type McpToolContext,
  type McpToolDef,
} from '../../common/decorators/tool.decorator';

@Injectable()
@McpTool()
export class SetGroupSharingTool implements McpToolDef {
  constructor(private readonly consent: ConsentService) {}
  readonly name = 'set_group_sharing';
  readonly title = 'Definir o que compartilho com a comunidade';
  readonly annotations = { readOnlyHint: false, destructiveHint: false, confirmableHint: true };
  readonly hostedInference = false;
  readonly description =
    'Define o que a equipe de uma comunidade do usuário (dono, profissionais e criadores) pode ' +
    'ver. A lista enviada passa a ser a lista inteira e substitui as autorizações por ' +
    'profissional daquele grupo; `scopes: []` revoga o acesso de todos. Membros comuns nunca ' +
    'veem os dados. Confirme as categorias com o usuário, uma a uma. ' +
    'Exemplo: {"groupId":"11111111-2222-4333-8444-555555555555","scopes":["NUTRITION"],"statsOptIn":false}';
  readonly inputSchema = {
    groupId: z.string().uuid().describe('ID da comunidade, como aparece em `list_my_groups`'),
    ...groupConsentSchema,
  } as const;
  async execute(
    { groupId, scopes, statsOptIn }: { groupId: string; scopes: ShareScope[]; statsOptIn: boolean },
    { userId }: McpToolContext,
  ) {
    return this.consent.setGroupConsent(userId, groupId, { scopes, statsOptIn });
  }
}
