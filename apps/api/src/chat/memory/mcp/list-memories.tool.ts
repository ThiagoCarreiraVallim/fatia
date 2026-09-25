import { Injectable } from '@nestjs/common';
import {
  McpTool,
  type McpToolContext,
  type McpToolDef,
} from '../../../common/decorators/tool.decorator';
import { MemoryService } from '../memory.service';

@Injectable()
@McpTool()
export class ListMemoriesTool implements McpToolDef {
  constructor(private readonly memorias: MemoryService) {}
  readonly name = 'list_memories';
  readonly title = 'Ver memórias';
  readonly annotations = { readOnlyHint: true, destructiveHint: false, confirmableHint: false };
  readonly hostedInference = false;
  readonly description =
    'Lista o que o usuário pediu para o assistente lembrar, da mais antiga para a mais nova.';
  readonly inputSchema = {} as const;
  execute(_input: Record<string, never>, { userId }: McpToolContext) {
    return this.memorias.listar(userId);
  }
}
