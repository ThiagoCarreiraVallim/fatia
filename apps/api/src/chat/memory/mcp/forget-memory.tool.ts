import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import {
  McpTool,
  type McpToolContext,
  type McpToolDef,
} from '../../../common/decorators/tool.decorator';
import { MemoryService } from '../memory.service';

/**
 * Apaga uma memória, e **não** é `delete_*`: esquecer uma anotação do assistente
 * não apaga dado de saúde nem histórico — a pessoa diz de novo e ela volta. Por
 * isso é confirmável no chat (ADR 022), e não restrita.
 */
@Injectable()
@McpTool()
export class ForgetMemoryTool implements McpToolDef {
  constructor(private readonly memorias: MemoryService) {}
  readonly name = 'forget_memory';
  readonly title = 'Esquecer memória';
  readonly annotations = { readOnlyHint: false, destructiveHint: false, confirmableHint: true };
  readonly hostedInference = false;
  readonly description =
    'Esquece uma memória guardada pelo assistente, pelo id (de list_memories). ' +
    'Exemplo: {"memoryId":"3f1c9a52-6b1e-4d8a-9c2f-0a5e7b3d1c44"}';
  readonly inputSchema = {
    memoryId: z.string().uuid().describe('ID da memória, como list_memories devolve'),
  } as const;
  execute({ memoryId }: { memoryId: string }, { userId }: McpToolContext) {
    return this.memorias.esquecer(userId, memoryId);
  }
}
