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
  readonly annotations = { readOnlyHint: true, destructiveHint: false };
  readonly description =
    'Lista as academias e grupos de que o usuário participa, com o papel dele em cada um e a ' +
    'situação (aguardando aprovação ou ativo). Estar num grupo não dá a ninguém acesso aos ' +
    'dados do usuário: quem lê é apenas o profissional que ele autorizou explicitamente.';
  readonly inputSchema = {} as const;
  async execute(_input: Record<string, never>, { userId }: McpToolContext) {
    return this.groups.listMine(userId);
  }
}
