import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import {
  McpTool,
  type McpToolContext,
  type McpToolDef,
} from '../../common/decorators/tool.decorator';
import { SessionSetService } from '../session-set.service';

@Injectable()
@McpTool()
export class DeleteSetTool implements McpToolDef {
  constructor(private readonly sets: SessionSetService) {}

  readonly name = 'delete_set';

  readonly title = 'Excluir série';

  readonly annotations = { readOnlyHint: false, destructiveHint: true };

  readonly hostedInference = false;
  readonly description =
    'Remove uma série registrada. ' + 'Exemplo: {"setId":"11111111-2222-4333-8444-555555555555"}';
  readonly inputSchema = {
    setId: z.string().uuid().describe('ID da série a remover'),
  } as const;

  async execute(input: { setId: string }, { userId }: McpToolContext) {
    await this.sets.delete(userId, input.setId);
    return { deleted: true };
  }
}
