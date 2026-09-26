import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import {
  McpTool,
  type McpToolContext,
  type McpToolDef,
} from '../../../common/decorators/tool.decorator';
import { MemoryService, TETO_DA_MEMORIA } from '../memory.service';

@Injectable()
@McpTool()
export class SaveMemoryTool implements McpToolDef {
  constructor(private readonly memorias: MemoryService) {}
  readonly name = 'save_memory';
  readonly title = 'Guardar memória';
  readonly annotations = { readOnlyHint: false, destructiveHint: false, confirmableHint: true };
  readonly hostedInference = false;
  readonly description =
    'Guarda algo que o usuário pediu para o assistente lembrar nas próximas conversas ' +
    '(preferência, restrição, rotina). Uma frase curta na terceira pessoa. ' +
    'Exemplo: {"content":"Não come carne nem ovo."}';
  readonly inputSchema = {
    content: z
      .string()
      .min(1)
      .max(TETO_DA_MEMORIA)
      .describe('O que lembrar, numa frase curta — ex.: "Treina às 6h, antes do trabalho."'),
  } as const;
  execute({ content }: { content: string }, { userId }: McpToolContext) {
    return this.memorias.lembrar(userId, content);
  }
}
