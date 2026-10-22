import { Injectable } from '@nestjs/common';
import { GroupService } from '../group.service';
import {
  McpTool,
  type McpToolContext,
  type McpToolDef,
} from '../../common/decorators/tool.decorator';

@Injectable()
@McpTool()
export class ListMyGroupsTool implements McpToolDef {
  constructor(private readonly groups: GroupService) {}
  readonly name = 'list_my_groups';
  readonly title = 'Listar meus grupos';
  readonly annotations = { readOnlyHint: true, destructiveHint: false, confirmableHint: false };
  readonly hostedInference = false;
  readonly description =
    'Lista as comunidades de que o usuário participa: papel dele, situação (aguardando ' +
    'aprovação ou ativo), como se entra (`joinPolicy`), o que ele compartilha com a equipe ' +
    '(`consentScopes`), se entra nas estatísticas agregadas (`statsOptIn`) e se a comunidade ' +
    'paga a IA dele (`hasAiSeat`). Só a equipe (dono, profissionais e criadores) vê dados, e ' +
    'só as categorias que o usuário escolheu; membros comuns nunca veem.';
  readonly inputSchema = {} as const;
  async execute(_input: Record<string, never>, { userId }: McpToolContext) {
    return this.groups.listMine(userId);
  }
}
