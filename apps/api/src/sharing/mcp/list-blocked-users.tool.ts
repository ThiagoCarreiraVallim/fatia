import { Injectable } from '@nestjs/common';
import { BlockService } from '../block.service';
import {
  McpTool,
  type McpToolContext,
  type McpToolDef,
} from '../../common/decorators/tool.decorator';

@Injectable()
@McpTool()
export class ListBlockedUsersTool implements McpToolDef {
  constructor(private readonly blocks: BlockService) {}
  readonly name = 'list_blocked_users';
  readonly title = 'Pessoas bloqueadas';
  readonly annotations = { readOnlyHint: true, destructiveHint: false, confirmableHint: false };
  readonly hostedInference = false;
  readonly card = 'list' as const;
  readonly description =
    'Lista as pessoas que o usuário bloqueou nas comunidades, com o nome que aparecia e onde ' +
    'foi. Quem o bloqueou nunca aparece. O id serve para unblock_user. Exemplo: {}';
  readonly inputSchema = {} as const;
  async execute(_input: Record<string, never>, { userId }: McpToolContext) {
    return this.blocks.list(userId);
  }

  artifact(result: unknown) {
    const lista = result as { label: string; groupName: string | null }[];
    if (lista.length === 0) return null;
    return {
      kind: 'list',
      label: 'Pessoas bloqueadas',
      items: lista.map((b) => ({
        title: b.label,
        ...(b.groupName ? { detail: b.groupName } : {}),
      })),
      total: `${lista.length} ${lista.length === 1 ? 'pessoa' : 'pessoas'}`,
    };
  }
}
